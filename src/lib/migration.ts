import { collection, getDocs, query, where, writeBatch, doc, Timestamp, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { normalizeItemName } from './foodItems'
import type { Order } from '@/types'

export async function migrateExistingOrdersToFoodItems(profileId: string) {
  const ordersRef = collection(db, 'orders')
  const q = query(ordersRef, where('profile_id', '==', profileId), where('status', '==', 'confirmed'))
  const querySnapshot = await getDocs(q)
  
  const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order))
  
  // Aggregate food items across all orders
  const foodItemsMap: Record<string, {
    name: string,
    restaurant_name: string,
    restaurant_id: string,
    order_count: number,
    last_ordered_at: Date,
    rating?: number
  }> = {}

  for (const order of orders) {
    if (!order.restaurant_name?.trim()) continue
    if (!order.items || !Array.isArray(order.items)) continue
    if (!order.profile_id) continue

    const restaurantId = `${order.profile_id}_${order.restaurant_name.trim().toLowerCase()}`
    
    // Ensure ordered_at is a valid Date
    let orderedAt: Date
    if (order.ordered_at instanceof Timestamp) {
      orderedAt = order.ordered_at.toDate()
    } else if (order.ordered_at) {
      orderedAt = new Date(order.ordered_at)
    } else {
      orderedAt = new Date(0)
    }

    if (isNaN(orderedAt.getTime())) {
      orderedAt = new Date(0)
    }

    for (const item of order.items) {
      if (!item.name?.trim()) continue
      
      const itemSlug = normalizeItemName(item.name)
      const foodItemId = `${order.profile_id}_${restaurantId}_${itemSlug}`
      
      const current = foodItemsMap[foodItemId] || {
        name: item.name.trim(),
        restaurant_name: order.restaurant_name.trim(),
        restaurant_id: restaurantId,
        order_count: 0,
        last_ordered_at: new Date(0)
      }
      
      current.order_count += 1
      if (orderedAt > current.last_ordered_at) {
        current.last_ordered_at = orderedAt
        // Take the rating from the most recent order if available
        if (item.rating !== undefined) {
          current.rating = item.rating
        }
      }
      
      foodItemsMap[foodItemId] = current
    }
  }

  // Batch write to food_items in chunks of 400
  const items = Object.entries(foodItemsMap)
  const chunkSize = 400
  for (let i = 0; i < items.length; i += chunkSize) {
    const batch = writeBatch(db)
    const chunk = items.slice(i, i + chunkSize)
    
    for (const [id, data] of chunk) {
      const ref = doc(db, 'food_items', id)
      batch.set(ref, {
        ...data,
        profile_id: profileId,
        last_ordered_at: Timestamp.fromDate(data.last_ordered_at),
        updated_at: serverTimestamp(),
      }, { merge: true })
    }
    
    await batch.commit()
  }

  return items.length
}
