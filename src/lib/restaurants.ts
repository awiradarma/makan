import { 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch, 
  doc, 
  getDoc,
  serverTimestamp,
  deleteField
} from 'firebase/firestore'
import { db } from './firebase'
import { normalizeItemName } from './foodItems'
import type { Restaurant, FoodItem } from '@/types'

const getMillis = (date: any) => {
  if (!date) return 0
  if (typeof date.toMillis === 'function') return date.toMillis()
  if (date instanceof Date) return date.getTime()
  return 0
}

/**
 * Merges a source restaurant into a target restaurant.
 * All orders, food items, and stats will be consolidated into the target.
 * The source restaurant will be deleted.
 */
export async function mergeRestaurants(
  profileId: string,
  targetId: string,
  sourceId: string
) {
  const targetRef = doc(db, 'restaurants', targetId)
  const sourceRef = doc(db, 'restaurants', sourceId)
  
  const [targetSnap, sourceSnap] = await Promise.all([
    getDoc(targetRef),
    getDoc(sourceRef)
  ])
  
  if (!targetSnap.exists() || !sourceSnap.exists()) {
    throw new Error('One or both restaurants do not exist')
  }
  
  const targetData = targetSnap.data() as Restaurant
  const sourceData = sourceSnap.data() as Restaurant
  
  // 1. Update Orders
  // We find all orders with the source restaurant name and update them to target name
  const ordersRef = collection(db, 'orders')
  const ordersQuery = query(
    ordersRef, 
    where('profile_id', '==', profileId), 
    where('restaurant_name', '==', sourceData.name)
  )
  const ordersSnap = await getDocs(ordersQuery)
  
  const batch = writeBatch(db)
  
  ordersSnap.docs.forEach(orderDoc => {
    batch.update(orderDoc.ref, {
      restaurant_name: targetData.name,
      updated_at: serverTimestamp()
    })
  })
  
  // 2. Merge Food Items
  const foodItemsRef = collection(db, 'food_items')
  const sourceItemsQuery = query(
    foodItemsRef,
    where('profile_id', '==', profileId),
    where('restaurant_id', '==', sourceId)
  )
  const sourceItemsSnap = await getDocs(sourceItemsQuery)
  
  for (const sourceItemDoc of sourceItemsSnap.docs) {
    const sourceItem = sourceItemDoc.data() as FoodItem
    const itemSlug = normalizeItemName(sourceItem.name)
    const targetItemId = `${profileId}_${targetId}_${itemSlug}`
    const targetItemRef = doc(db, 'food_items', targetItemId)
    const targetItemSnap = await getDoc(targetItemRef)
    
    if (targetItemSnap.exists()) {
      // Merge stats into existing target item
      const targetItem = targetItemSnap.data() as FoodItem
      
      const mergedMemberRatings = { ...(targetItem.member_ratings || {}) }
      if (sourceItem.member_ratings) {
        Object.entries(sourceItem.member_ratings).forEach(([member, rating]) => {
          if (mergedMemberRatings[member] === undefined) {
            mergedMemberRatings[member] = rating
          }
        })
      }
      
      // Recalculate average rating
      const ratings = Object.values(mergedMemberRatings) as number[]
      let newGlobalRating: any = deleteField()
      if (ratings.length > 0) {
        newGlobalRating = Math.round(ratings.reduce((a, b: any) => a + b, 0) / ratings.length)
      }

      batch.update(targetItemRef, {
        order_count: (targetItem.order_count || 0) + (sourceItem.order_count || 0),
        last_ordered_at: getMillis(sourceItem.last_ordered_at) > getMillis(targetItem.last_ordered_at)
          ? sourceItem.last_ordered_at 
          : targetItem.last_ordered_at,
        member_ratings: mergedMemberRatings,
        rating: newGlobalRating,
        tags: Array.from(new Set([...(targetItem.tags || []), ...(sourceItem.tags || [])])),
        updated_at: serverTimestamp()
      })
      
      // Delete source item
      batch.delete(sourceItemDoc.ref)
    } else {
      // Create new food item for target (since it didn't exist)
      // Ensure no undefined values in the object
      const newItem: any = {
        ...sourceItem,
        restaurant_id: targetId,
        restaurant_name: targetData.name,
        updated_at: serverTimestamp()
      }
      // Remove any undefined fields that might have come from sourceItem
      Object.keys(newItem).forEach(key => newItem[key] === undefined && delete newItem[key])

      batch.set(targetItemRef, newItem)
      // Delete source item
      batch.delete(sourceItemDoc.ref)
    }
  }
  
  // 3. Update Target Restaurant Stats
  const mergedFaved = Array.from(new Set([...(targetData.faved_by || []), ...(sourceData.faved_by || [])]))
  const mergedDisliked = Array.from(new Set([...(targetData.disliked_by || []), ...(sourceData.disliked_by || [])]))
  const mergedTags = Array.from(new Set([...(targetData.tags || []), ...(sourceData.tags || [])]))
  
  batch.update(targetRef, {
    order_count: (targetData.order_count || 0) + (sourceData.order_count || 0),
    last_ordered_at: getMillis(sourceData.last_ordered_at) > getMillis(targetData.last_ordered_at)
      ? sourceData.last_ordered_at
      : targetData.last_ordered_at,
    faved_by: mergedFaved,
    disliked_by: mergedDisliked,
    tags: mergedTags,
    updated_at: serverTimestamp()
  })
  
  // 4. Delete Source Restaurant
  batch.delete(sourceRef)
  
  await batch.commit()
}
