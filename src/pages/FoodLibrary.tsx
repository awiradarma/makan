import { useEffect, useState, useMemo } from 'react'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useProfile } from '@/contexts/ProfileContext'
import { TagInput } from '@/components/TagInput'
import type { FoodItem, Restaurant } from '@/types'

type ViewMode = 'restaurant' | 'item'

export default function FoodLibrary() {
  const { activeProfile } = useProfile()
  const [viewMode, setViewMode] = useState<ViewMode>('restaurant')
  const [searchQuery, setSearchQuery] = useState('')
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

  const handleUpdateItem = async (itemId: string, updates: Partial<FoodItem>) => {
    try {
      await updateDoc(doc(db, 'food_items', itemId), {
        ...updates,
        updated_at: new Date()
      })
    } catch (err) {
      console.error('Error updating food item:', err)
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

    // Group by restaurant
    const groups: Record<string, { restaurant: Restaurant; items: FoodItem[] }> = {}
    
    // 1. Initialize groups for all restaurants that match the search (or have matching items)
    restaurants.forEach(r => {
      const items = matchedItems.filter(i => i.restaurant_id === r.id)
      const matchesRestName = r.name.toLowerCase().includes(q)
      
      if (matchesRestName || items.length > 0) {
        groups[r.id] = { restaurant: r, items: items.sort((a, b) => a.name.localeCompare(b.name)) }
      }
    })

    return Object.values(groups).sort((a, b) => a.restaurant.name.localeCompare(b.restaurant.name))
  }, [viewMode, searchQuery, restaurants, foodItems])

  if (loading) {
    return (
      <div className="page-container flex-center" style={{ paddingTop: '4rem' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page-container flex-col gap-lg">
      <div className="section-header">
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

      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          placeholder={`Search ${viewMode}s, items, or tags...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex-col gap-lg">
        {viewMode === 'restaurant' ? (
          (filteredData as any[]).map(({ restaurant, items }) => (
            <div key={restaurant.id} className="card flex-col gap-md">
              <div className="flex-row justify-between align-center">
                <h3 className="card__title" style={{ fontSize: 'var(--font-size-lg)' }}>{restaurant.name}</h3>
                <span className="tag tag--muted">{items.length} items</span>
              </div>
              
              <div className="flex-col gap-sm">
                {items.length > 0 ? (
                  items.map((item: FoodItem) => (
                    <ItemRow key={item.id} item={item} onUpdate={handleUpdateItem} showRestaurant={false} />
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
              <ItemRow key={item.id} item={item} onUpdate={handleUpdateItem} showRestaurant={true} />
            ))}
            {filteredData.length === 0 && <div className="empty-state">No items found</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function ItemRow({ item, onUpdate, showRestaurant }: { item: FoodItem, onUpdate: (id: string, u: any) => void, showRestaurant: boolean }) {
  const [isEditing, setIsEditing] = useState(false)

  return (
    <div className="library-item">
      <div className="flex-row justify-between align-start gap-md">
        <div className="flex-col gap-xs" style={{ flex: 1 }}>
          <div className="flex-row align-center gap-sm">
            <span className="library-item__name">{item.name}</span>
            <span className="library-item__rating-badge">
              {item.rating === 1 && '🤢'}
              {item.rating === 2 && '😕'}
              {item.rating === 3 && '😐'}
              {item.rating === 4 && '😋'}
              {item.rating === 5 && '🤩'}
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
            <label className="form-label">Rating</label>
            <div className="flex-row gap-sm">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  className={`btn-rating ${item.rating === r ? 'active' : ''}`}
                  onClick={() => onUpdate(item.id, { rating: r })}
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
