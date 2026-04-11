import { collection, getDocs, query, where, writeBatch, doc, Timestamp, serverTimestamp, updateDoc } from 'firebase/firestore'
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

export async function geocodeExistingRestaurants(profileId: string) {
  const { geocodeAddress, sleep } = await import('./geocoding')
  const restaurantsRef = collection(db, 'restaurants')
  const q = query(restaurantsRef, where('profile_id', '==', profileId))
  const querySnapshot = await getDocs(q)
  
  let successCount = 0
  for (const restaurantDoc of querySnapshot.docs) {
    const data = restaurantDoc.data()
    if (data.address && (!data.lat || !data.lng)) {
      const coords = await geocodeAddress(data.address)
      if (coords) {
        await updateDoc(doc(db, 'restaurants', restaurantDoc.id), {
          ...coords,
          updated_at: serverTimestamp(),
        })
        successCount++
      }
      // Respect Nominatim usage policy (1 request/second)
      await sleep(1000)
    }
  }
  
  return successCount
}

export async function syncRestaurantDates(profileId: string) {
  const ordersRef = collection(db, 'orders')
  const q = query(ordersRef, where('profile_id', '==', profileId), where('status', '==', 'confirmed'))
  const querySnapshot = await getDocs(q)
  
  const restaurantStats: Record<string, { last_ordered_at: Date, order_count: number, name: string }> = {}
  
  querySnapshot.docs.forEach(orderDoc => {
    const data = orderDoc.data()
    if (!data.restaurant_name) return
    
    const restId = `${profileId}_${data.restaurant_name.trim().toLowerCase()}`
    
    let orderedAt: Date
    if (data.ordered_at instanceof Timestamp) {
      orderedAt = data.ordered_at.toDate()
    } else if (data.ordered_at) {
      orderedAt = new Date(data.ordered_at)
    } else {
      return
    }

    if (!restaurantStats[restId]) {
      restaurantStats[restId] = {
        name: data.restaurant_name.trim(),
        last_ordered_at: orderedAt,
        order_count: 0
      }
    }
    
    restaurantStats[restId].order_count++
    if (orderedAt > restaurantStats[restId].last_ordered_at) {
      restaurantStats[restId].last_ordered_at = orderedAt
    }
  })

  // Update restaurants
  const batch = writeBatch(db)
  const entries = Object.entries(restaurantStats)
  
  for (const [id, stats] of entries) {
    const restRef = doc(db, 'restaurants', id)
    batch.update(restRef, {
      last_ordered_at: Timestamp.fromDate(stats.last_ordered_at),
      order_count: stats.order_count,
      updated_at: serverTimestamp(),
    })
  }
  
  await batch.commit()
  return entries.length
}
