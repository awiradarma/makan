import { useEffect, useState, useMemo } from 'react'
import { collection, query, where, onSnapshot, doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useProfile } from '@/contexts/ProfileContext'
import { useLocation } from '@/contexts/LocationContext'
import { toggleRestaurantPreference } from '@/lib/preferences'
import { TagInput } from '@/components/TagInput'
import { calculateDistance } from '@/lib/geocoding'
import type { FoodItem, Restaurant } from '@/types'

type ViewMode = 'restaurant' | 'item'

export default function FoodLibrary() {
  const { activeProfile, activeMember } = useProfile()
  const { location } = useLocation()
  const [viewMode, setViewMode] = useState<ViewMode>('restaurant')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'distance'>('name')
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [foodItems, setFoodItems] = useState<FoodItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeProfile) return

    // Watch restaurants
    const qRest = query(
      collection(db, 'restaurants'),
      where('profile_id', '==', activeProfile.id)
    )
    const unsubRest = onSnapshot(qRest, (snap) => {
      setRestaurants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Restaurant)))
    })

    // Watch food items
    const qItems = query(
      collection(db, 'food_items'),
      where('profile_id', '==', activeProfile.id)
    )
    const unsubItems = onSnapshot(qItems, (snap) => {
      setFoodItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as FoodItem)))
      setLoading(false)
    })

    return () => {
      unsubRest()
      unsubItems()
    }
  }, [activeProfile])

  const handleUpdateItem = async (itemId: string, updates: any) => {
    try {
      const firestoreUpdates = { ...updates, updated_at: new Date() }
      
      // If we are updating the rating, also update the member-specific map
      if (updates.rating !== undefined && activeMember) {
        if (updates.rating === null) {
          firestoreUpdates[`member_ratings.${activeMember}`] = deleteField()
        } else {
          firestoreUpdates[`member_ratings.${activeMember}`] = updates.rating
        }
        
        // Remove the top-level rating from the update if we are doing a member rating
        // so we don't accidentally overwrite the global weighted rating 
        // (unless that's intended, but usually it's calculated or separate)
        delete firestoreUpdates.rating
      }

      await updateDoc(doc(db, 'food_items', itemId), firestoreUpdates)
    } catch (err) {
      console.error('Error updating food item:', err)
    }
  }

  const handlePreference = async (restaurantId: string, type: 'faved_by' | 'disliked_by') => {
    const restaurant = restaurants.find((r) => r.id === restaurantId)
    if (!restaurant || !activeMember) return
    await toggleRestaurantPreference(restaurant, activeMember, type)
  }

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    
    // Filter items first
    const matchedItems = foodItems.filter(item => {
      if (!q) return true
      const matchesName = item.name.toLowerCase().includes(q)
      const matchesRestaurant = item.restaurant_name.toLowerCase().includes(q)
      const matchesTags = item.tags?.some(t => t.toLowerCase().includes(q))
      return matchesName || matchesRestaurant || matchesTags
    })

    if (viewMode === 'item') {
      return matchedItems.sort((a, b) => a.name.localeCompare(b.name))
    }

    // Group by restaurant and calculate distance if possible
    const groups: Record<string, { restaurant: Restaurant; items: FoodItem[]; distance?: number }> = {}
    
    restaurants.forEach(r => {
      const items = matchedItems.filter(i => i.restaurant_id === r.id)
      const matchesRestName = r.name.toLowerCase().includes(q)
      
      if (matchesRestName || items.length > 0) {
        let dist: number | undefined
        if (location && r.lat && r.lng) {
          dist = calculateDistance(location.lat, location.lng, r.lat, r.lng)
        }
        groups[r.id] = { 
          restaurant: r, 
          items: items.sort((a, b) => a.name.localeCompare(b.name)),
          distance: dist
        }
      }
    })

    const result = Object.values(groups)
    
    if (sortBy === 'distance' && location) {
      return result.sort((a, b) => {
        if (a.distance === undefined) return 1
        if (b.distance === undefined) return -1
        return a.distance - b.distance
      })
    }
    
    return result.sort((a, b) => a.restaurant.name.localeCompare(b.restaurant.name))
  }, [viewMode, searchQuery, sortBy, restaurants, foodItems, location])

  if (loading) {
    return (
      <div className="page-container flex-center" style={{ paddingTop: '4rem' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page-container flex-col gap-lg">
      <div className="section-header section-header--sticky">
        <h2 className="section-title">Food Library</h2>
        <div className="segmented-control">
          <button 
            className={`segmented-control__item ${viewMode === 'restaurant' ? 'active' : ''}`}
            onClick={() => setViewMode('restaurant')}
          >
            Restaurants
          </button>
          <button 
            className={`segmented-control__item ${viewMode === 'item' ? 'active' : ''}`}
            onClick={() => setViewMode('item')}
          >
            Items
          </button>
        </div>
      </div>

      <div className="flex-row gap-sm align-center wrap" style={{ flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: '200px' }}>
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder={`Search ${viewMode}s, items, or tags...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {viewMode === 'restaurant' && (
          <div className="flex-row align-center gap-xs" style={{ background: 'var(--color-bg-secondary)', padding: '4px 12px', borderRadius: 'var(--radius-md)', height: '44px' }}>
            <span style={{ fontSize: '1rem' }}>⇅</span>
            <select 
              className="search-input" 
              style={{ width: 'auto', background: 'transparent', border: 'none', padding: '0', fontSize: 'var(--font-size-sm)' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'distance')}
            >
              <option value="name">Name</option>
              {location && <option value="distance">Distance</option>}
            </select>
          </div>
        )}
      </div>

      <div className="flex-col gap-lg">
        {viewMode === 'restaurant' ? (
          (filteredData as any[]).map(({ restaurant, items, distance }) => (
            <div key={restaurant.id} className="card flex-col gap-md">
              <div className="flex-row justify-between align-center">
                <div className="flex-col gap-xs">
                  <div className="flex-row align-center gap-xs">
                    <h3 className="card__title" style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>{restaurant.name}</h3>
                    {distance !== undefined && (
                      <span className="tag tag--accent" style={{ fontSize: '0.7rem' }}>
                        {distance.toFixed(1)} km
                      </span>
                    )}
                  </div>
                  <div className="flex-row align-center gap-xs">
                    <button 
                      className={`btn-pref ${restaurant.faved_by?.includes(activeMember || '') ? 'btn-pref--active' : ''}`}
                      onClick={() => handlePreference(restaurant.id, 'faved_by')}
                      title={`Like as ${activeMember}`}
                    >
                      ❤️
                    </button>
                    <button 
                      className={`btn-pref btn-pref--dislike ${restaurant.disliked_by?.includes(activeMember || '') ? 'btn-pref--active' : ''}`}
                      onClick={() => handlePreference(restaurant.id, 'disliked_by')}
                      title={`Dislike as ${activeMember}`}
                    >
                      💔
                    </button>
                  </div>
                </div>
                <span className="tag tag--muted">{items.length} items</span>
              </div>
              
              <div className="flex-col gap-sm">
                {items.length > 0 ? (
                  items.map((item: FoodItem) => (
                    <ItemRow key={item.id} item={item} onUpdate={handleUpdateItem} showRestaurant={false} activeMember={activeMember} />
                  ))
                ) : (
                  <div className="empty-text">No items found for this restaurant</div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="card flex-col gap-sm">
            {(filteredData as FoodItem[]).map(item => (
              <ItemRow key={item.id} item={item} onUpdate={handleUpdateItem} showRestaurant={true} activeMember={activeMember} />
            ))}
            {filteredData.length === 0 && <div className="empty-state">No items found</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function ItemRow({ item, onUpdate, showRestaurant, activeMember }: { item: FoodItem, onUpdate: (id: string, u: any) => void, showRestaurant: boolean, activeMember: string | null }) {
  const [isEditing, setIsEditing] = useState(false)
  
  // Use active member's rating if available, otherwise global rating for the badge
  const personalRating = activeMember ? item.member_ratings?.[activeMember] : undefined
  const displayedRating = personalRating || item.rating
  const isPersonalRating = personalRating !== undefined

  return (
    <div className="library-item">
      <div className="flex-row justify-between align-start gap-md">
        <div className="flex-col gap-xs" style={{ flex: 1 }}>
          <div className="flex-row align-center gap-sm">
            <span className="library-item__name">{item.name}</span>
            <span className={`library-item__rating-badge ${isPersonalRating ? 'library-item__rating-badge--personal' : ''}`} title={isPersonalRating ? 'Your personal rating' : 'Global rating'}>
              {displayedRating === 1 && '🤢'}
              {displayedRating === 2 && '😕'}
              {displayedRating === 3 && '😐'}
              {displayedRating === 4 && '😋'}
              {displayedRating === 5 && '🤩'}
              {isPersonalRating && <span style={{ fontSize: '8px', marginLeft: '2px', verticalAlign: 'middle' }}>👤</span>}
            </span>
          </div>
          {showRestaurant && (
            <span className="library-item__restaurant">at {item.restaurant_name}</span>
          )}
          {!isEditing && item.tags && item.tags.length > 0 && (
            <div className="flex-row gap-xs wrap">
              {item.tags.map(t => <span key={t} className="tag tag--muted">{t}</span>)}
            </div>
          )}
        </div>
        
        <button className="order-card__btn-toggle" onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {isEditing && (
        <div className="mt-md flex-col gap-md library-item__edit-panel">
          <div className="flex-col gap-xs">
            <label className="form-label">
              Rating {activeMember ? `as ${activeMember}` : ''}
            </label>
            <div className="flex-row gap-sm">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  className={`btn-rating ${personalRating === r ? 'active' : ''}`}
                  onClick={() => onUpdate(item.id, { rating: personalRating === r ? null : r })}
                >
                  {r === 1 && '🤢'}
                  {r === 2 && '😕'}
                  {r === 3 && '😐'}
                  {r === 4 && '😋'}
                  {r === 5 && '🤩'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-col gap-xs">
            <label className="form-label">Tags</label>
            <TagInput 
              tags={item.tags || []} 
              onChange={(newTags) => onUpdate(item.id, { tags: newTags })} 
            />
          </div>
        </div>
      )}
    </div>
  )
}
