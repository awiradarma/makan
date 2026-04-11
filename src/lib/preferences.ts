import { doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Restaurant } from '@/types'

export async function toggleRestaurantPreference(
  restaurant: Restaurant,
  member: string,
  type: 'faved_by' | 'disliked_by'
) {
  if (!member) return

  const currentArray = restaurant[type] || []
  const isPresent = currentArray.includes(member)

  const otherType = type === 'faved_by' ? 'disliked_by' : 'faved_by'
  const otherArray = restaurant[otherType] || []

  const nextArray = isPresent
    ? currentArray.filter((m) => m !== member)
    : [...currentArray, member]
  
  // Mutual exclusion: if we are adding to one, remove from the other
  const nextOtherArray = !isPresent 
    ? otherArray.filter((m) => m !== member)
    : otherArray

  try {
    await updateDoc(doc(db, 'restaurants', restaurant.id), {
      [type]: nextArray,
      [otherType]: nextOtherArray,
    })
  } catch (err) {
    console.error(`Error toggling ${type}:`, err)
    throw err
  }
}

export async function toggleGlobalDislike(
  restaurantId: string,
  currentStatus: boolean
) {
  try {
    await updateDoc(doc(db, 'restaurants', restaurantId), {
      is_disliked: !currentStatus,
    })
  } catch (err) {
    console.error('Error toggling global dislike:', err)
    throw err
  }
}
