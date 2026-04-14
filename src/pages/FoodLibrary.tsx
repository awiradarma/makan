import { useEffect, useState, useMemo } from 'react'
import { collection, query, where, onSnapshot, doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useProfile } from '@/contexts/ProfileContext'
import { useLocation } from '@/contexts/LocationContext'
import { toggleRestaurantPreference } from '@/lib/preferences'
import { TagInput } from '@/components/TagInput'
import { calculateDistance, formatDistance, geocodeAddress } from '@/lib/geocoding'
import { toast } from 'react-hot-toast'
import type { FoodItem, Restaurant } from '@/types'

type ViewMode = 'restaurant' | 'item'

export default function FoodLibrary() {
  const { activeProfile, activeMember, distanceUnit } = useProfile()
  const { location } = useLocation()
  const [viewMode, setViewMode] = useState<ViewMode>('restaurant')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'distance'>('name')
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [foodItems, setFoodItems] = useState<FoodItem[]>([])
  const [loading, setLoading] = useState(true)
  
  // Merge state
  const [confirmTargetId, setConfirmTargetId] = useState<string | null>(null)
  
  // Merge state
  const [mergeSource, setMergeSource] = useState<Restaurant | null>(null)
  const [isMerging, setIsMerging] = useState(false)
  
  // Restaurant edit state
  const [editingRestId, setEditingRestId] = useState<string | null>(null)
  const [editRestName, setEditRestName] = useState('')
  const [editRestAddress, setEditRestAddress] = useState('')
  const [editRestTags, setEditRestTags] = useState<string[]>([])
  const [editRestLat, setEditRestLat] = useState<number | null>(null)
  const [editRestLng, setEditRestLng] = useState<number | null>(null)
  const [isSavingRest, setIsSavingRest] = useState(false)

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
      const item = foodItems.find(i => i.id === itemId)
      if (!item) return

      const firestoreUpdates: any = { ...updates, updated_at: new Date() }
      
      // If we are updating the rating, also update the member-specific map
      // AND recalculate the global rating aggregate
      if (updates.rating !== undefined && activeMember) {
        const newMemberRatings = { ...(item.member_ratings || {}) }
        
        if (updates.rating === null) {
          firestoreUpdates[`member_ratings.${activeMember}`] = deleteField()
          delete newMemberRatings[activeMember]
        } else {
          firestoreUpdates[`member_ratings.${activeMember}`] = updates.rating
          newMemberRatings[activeMember] = updates.rating
        }
        
        // Recalculate global rating (average of all members)
        const ratings = Object.values(newMemberRatings) as number[]
        if (ratings.length > 0) {
          const sum = ratings.reduce((a, b) => a + b, 0)
          firestoreUpdates.rating = Math.round(sum / ratings.length)
        } else {
          // No ratings left, clear the global one
          firestoreUpdates.rating = deleteField()
        }
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

  const handleMerge = async (target: Restaurant) => {
    console.log('handleMerge triggered for target:', target.name)
    if (!mergeSource) return
    if (!activeProfile) return
    if (isMerging) return
    
    if (confirmTargetId !== target.id) {
      setConfirmTargetId(target.id)
      return
    }

    console.log('Merge confirmed. Executing...')
    setIsMerging(true)
    const loadingToast = toast.loading('Merging restaurants...')
    try {
      const { mergeRestaurants } = await import('@/lib/restaurants')
      await mergeRestaurants(activeProfile.id, target.id, mergeSource.id)
      console.log('Merge successful logic-wise')
      toast.success('Restaurants merged successfully!', { id: loadingToast })
      setMergeSource(null)
      setConfirmTargetId(null)
    } catch (err) {
      console.error('Merge error:', err)
      toast.error('Failed to merge restaurants', { id: loadingToast })
    } finally {
      setIsMerging(false)
    }
  }

  const startEditing = (r: Restaurant) => {
    setEditingRestId(r.id)
    setEditRestName(r.name)
    setEditRestAddress(r.address || '')
    setEditRestTags(r.tags || [])
    setEditRestLat(r.lat || null)
    setEditRestLng(r.lng || null)
  }

  const handleUpdateRestaurant = async () => {
    if (!editingRestId) return
    setIsSavingRest(true)
    const loadingToast = toast.loading('Updating restaurant...')
    try {
      const updates: any = {
        name: editRestName,
        address: editRestAddress,
        tags: editRestTags,
        lat: editRestLat,
        lng: editRestLng,
        updated_at: new Date()
      }
      await updateDoc(doc(db, 'restaurants', editingRestId), updates)
      toast.success('Restaurant updated', { id: loadingToast })
      setEditingRestId(null)
    } catch (err) {
      console.error('Error updating restaurant:', err)
      toast.error('Failed to update restaurant', { id: loadingToast })
    } finally {
      setIsSavingRest(false)
    }
  }

  const handleReGeocode = async () => {
    if (!editRestAddress) return
    const loadingToast = toast.loading('Geocoding address...')
    const coords = await geocodeAddress(editRestAddress)
    if (coords) {
      setEditRestLat(coords.lat)
      setEditRestLng(coords.lng)
      toast.success('Address geocoded!', { id: loadingToast })
    } else {
      toast.error('Could not geocode address', { id: loadingToast })
    }
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

      {mergeSource && (
        <div className="card" style={{ background: 'var(--color-accent-soft)', border: '1px dashed var(--color-accent)', padding: 'var(--spacing-md)' }}>
          <div className="flex-row justify-between align-center">
            <div style={{ fontSize: 'var(--font-size-sm)' }}>
              Merging <strong>{mergeSource.name}</strong>. Select a target restaurant below.
            </div>
            <button className="btn btn--ghost" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => { setMergeSource(null); setConfirmTargetId(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
                        {formatDistance(distance, distanceUnit)}
                      </span>
                    )}
                  </div>
                  <div className="preference-controls">
                    <div className="preference-controls__emojis">
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
                </div>

                <div className="flex-col gap-xs">
                  {restaurant.address && (
                    <div className="flex-row align-center gap-xs mini-meta">
                      <span>📍</span>
                      <span className="text-truncate">{restaurant.address}</span>
                    </div>
                  )}
                  {restaurant.tags && restaurant.tags.length > 0 && (
                    <div className="flex-row gap-xs wrap mt-xs">
                    {restaurant.tags.map((tag: string) => (
                      <span key={tag} className="tag tag--muted">{tag}</span>
                    ))}
                    </div>
                  )}
                </div>
                
                <div className="flex-row gap-sm align-center">
                  <span className="tag tag--muted">{items.length} items</span>
                  {!mergeSource && !editingRestId && (
                    <button 
                      className="btn btn--ghost" 
                      style={{ padding: '4px 8px', fontSize: '10px', textTransform: 'uppercase' }}
                      onClick={() => startEditing(restaurant)}
                    >
                      Edit
                    </button>
                  )}
                  {mergeSource ? (
                    restaurant.id !== mergeSource.id && (
                      <button 
                        className={`btn ${confirmTargetId === restaurant.id ? 'btn--accent' : 'btn--primary'}`} 
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                        onClick={() => handleMerge(restaurant)}
                        disabled={isMerging}
                      >
                        {confirmTargetId === restaurant.id ? 'Confirm?' : 'Merge Here'}
                      </button>
                    )
                  ) : (
                    !editingRestId && (
                    <button 
                      className="btn btn--ghost" 
                      style={{ padding: '4px 8px', fontSize: '10px', textTransform: 'uppercase' }}
                      onClick={() => setMergeSource(restaurant)}
                    >
                      Merge
                    </button>
                    )
                  )}
                </div>
              </div>
              
              {editingRestId === restaurant.id && (
                <div className="mt-md flex-col gap-md library-item__edit-panel" style={{ padding: 'var(--spacing-md)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent-soft)' }}>
                  <div className="flex-col gap-xs">
                    <label className="form-label">Restaurant Name</label>
                    <input className="form-input" value={editRestName} onChange={e => setEditRestName(e.target.value)} />
                  </div>
                  <div className="flex-col gap-xs">
                    <label className="form-label">Address</label>
                    <div className="flex-row gap-xs">
                      <input className="form-input" value={editRestAddress} onChange={e => setEditRestAddress(e.target.value)} />
                      <button className="btn btn--secondary" style={{ padding: '0 12px' }} onClick={handleReGeocode} title="Re-geocode address">📍</button>
                    </div>
                  </div>
                  <div className="flex-row gap-md">
                    <div className="flex-col gap-xs" style={{ flex: 1 }}>
                      <label className="form-label">Lat</label>
                      <input type="number" className="form-input" value={editRestLat || ''} onChange={e => setEditRestLat(parseFloat(e.target.value) || null)} step="any" />
                    </div>
                    <div className="flex-col gap-xs" style={{ flex: 1 }}>
                      <label className="form-label">Lng</label>
                      <input type="number" className="form-input" value={editRestLng || ''} onChange={e => setEditRestLng(parseFloat(e.target.value) || null)} step="any" />
                    </div>
                  </div>
                  <div className="flex-col gap-xs">
                    <label className="form-label">Tags</label>
                    <TagInput tags={editRestTags} onChange={setEditRestTags} />
                  </div>
                  <div className="flex-row gap-sm">
                    <button className="btn btn--primary flex-1" onClick={handleUpdateRestaurant} disabled={isSavingRest}>Save Changes</button>
                    <button className="btn btn--secondary" onClick={() => setEditingRestId(null)}>Cancel</button>
                  </div>
                </div>
              )}

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
