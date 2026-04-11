import { doc, setDoc, increment, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Order, OrderItem } from '@/types'

/**
 * Normalizes a food item name for use in a document ID.
 */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
}

/**
 * Updates or creates FoodItem records for each item in an order.
 * This should be called when an order is confirmed or edited.
 */
export async function updateFoodItems(order: Order, activeMember?: string | null) {
  if (order.status !== 'confirmed') return
  if (!order.restaurant_name?.trim()) return

  const restaurantId = `${order.profile_id}_${order.restaurant_name.trim().toLowerCase()}`
  
  // Ensure ordered_at is a Date for Timestamp.fromDate
  const orderedDate = order.ordered_at instanceof Timestamp 
    ? order.ordered_at.toDate() 
    : new Date(order.ordered_at)

  const promises = order.items.map(async (item: OrderItem) => {
    if (!item.name?.trim()) return

    const itemSlug = normalizeItemName(item.name)
    const foodItemId = `${order.profile_id}_${restaurantId}_${itemSlug}`
    const foodItemRef = doc(db, 'food_items', foodItemId)
    const foodItemSnap = await getDoc(foodItemRef)
    
    let shouldUpdateDate = true
    if (foodItemSnap.exists()) {
      const currentData = foodItemSnap.data()
      const currentLastOrderedAt = currentData.last_ordered_at?.toDate() || new Date(0)
      if (orderedDate <= currentLastOrderedAt) {
        shouldUpdateDate = false
      }
    }

    await setDoc(
      foodItemRef,
      {
        profile_id: order.profile_id,
        restaurant_id: restaurantId,
        restaurant_name: order.restaurant_name.trim(),
        name: item.name.trim(),
        // We use the most recent rating if provided
        ...(item.rating !== undefined ? { rating: item.rating } : {}),
        // Add member-specific rating if we know who it is
        ...(item.rating !== undefined && activeMember ? {
          member_ratings: {
            [activeMember]: item.rating
          }
        } : {}),
        order_count: increment(1),
        ...(shouldUpdateDate ? { last_ordered_at: Timestamp.fromDate(orderedDate) } : {}),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    )
  })

  await Promise.all(promises)
}
