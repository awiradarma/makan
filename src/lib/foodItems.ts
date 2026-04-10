import { doc, setDoc, increment, serverTimestamp, Timestamp } from 'firebase/firestore'
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
export async function updateFoodItems(order: Order) {
  if (order.status !== 'confirmed') return

  const restaurantId = `${order.profile_id}_${order.restaurant_name.trim().toLowerCase()}`
  
  const promises = order.items.map(async (item: OrderItem) => {
    if (!item.name.trim()) return

    const itemSlug = normalizeItemName(item.name)
    const foodItemId = `${order.profile_id}_${restaurantId}_${itemSlug}`
    const foodItemRef = doc(db, 'food_items', foodItemId)

    await setDoc(
      foodItemRef,
      {
        profile_id: order.profile_id,
        restaurant_id: restaurantId,
        restaurant_name: order.restaurant_name,
        name: item.name.trim(),
        // We use the most recent rating if provided
        ...(item.rating !== undefined ? { rating: item.rating } : {}),
        order_count: increment(1),
        last_ordered_at: Timestamp.fromDate(order.ordered_at),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    )
  })

  await Promise.all(promises)
}
