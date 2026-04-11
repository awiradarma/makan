import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useProfile } from '@/contexts/ProfileContext'
import { toggleRestaurantPreference, toggleGlobalDislike } from '@/lib/preferences'
import type { Restaurant } from '@/types'

function daysSince(date: Date): number {
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export default function Rotation() {
  const { activeProfile, activeMember } = useProfile()
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [showDisliked, setShowDisliked] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeProfile) {
      setRestaurants([])
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'restaurants'),
      where('profile_id', '==', activeProfile.id),
      orderBy('last_ordered_at', 'asc')
    )

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        last_ordered_at: doc.data().last_ordered_at?.toDate() || new Date(),
      })) as Restaurant[]
      setRestaurants(data)
      setLoading(false)
    })

    return unsubscribe
  }, [activeProfile])

  const handleTogglePreference = async (restaurantId: string, type: 'faved_by' | 'disliked_by') => {
    const restaurant = restaurants.find((r) => r.id === restaurantId)
    if (!restaurant || !activeMember) return
    await toggleRestaurantPreference(restaurant, activeMember, type)
  }

  const handleToggleGlobalDislike = async (restaurantId: string, currentStatus: boolean) => {
    await toggleGlobalDislike(restaurantId, currentStatus)
  }

  const filtered = restaurants.filter(r => {
    // Basic visibility filter
    if (!showDisliked && r.is_disliked) return false
    
    // Search filter
    const query = searchQuery.toLowerCase().trim()
    if (!query) return true
    
    const matchesName = r.name.toLowerCase().includes(query)
    const matchesTags = r.tags.some(tag => tag.toLowerCase().includes(query))
    return matchesName || matchesTags
  })

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page-container flex-col gap-xl">
      {/* Search Bar */}
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Filter restaurants by name or tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="section-header">
        <h2 className="section-title">
          {searchQuery ? 'Search Results' : 'Rotation'}
        </h2>
        <button
          className="btn btn--ghost"
          onClick={() => setShowDisliked(!showDisliked)}
        >
          {showDisliked ? 'Hide disliked' : 'Show disliked'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🍽️</div>
          <div className="empty-state__title">No restaurants yet</div>
          <div className="empty-state__text">
            Restaurants will appear here as you add orders.
          </div>
        </div>
      ) : (
        <div className="flex-col gap-md">
          {filtered.map((restaurant, index) => {
            const days = daysSince(restaurant.last_ordered_at)
            return (
              <div
                key={restaurant.id}
                className={`card rotation-card ${restaurant.is_disliked ? '' : ''}`}
                style={restaurant.is_disliked ? { opacity: 0.5 } : {}}
              >
                <div className="rotation-card__rank">{index + 1}</div>
                <div className="rotation-card__info">
                  <div className="rotation-card__name">
                    {restaurant.is_disliked && '👎 '}
                    {restaurant.name}
                  </div>
                  {restaurant.address && (
                    <div className="rotation-card__address" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--spacing-xs)' }}>
                      📍 {restaurant.address}
                    </div>
                  )}
                  <div className="rotation-card__days">
                    {days === 0 ? 'Ordered today' : `${days} day${days === 1 ? '' : 's'} ago`}
                    {' · '}
                    {restaurant.order_count} order{restaurant.order_count === 1 ? '' : 's'} total
                  </div>
                  {restaurant.tags.length > 0 && (
                    <div className="rotation-card__tags">
                      {restaurant.tags.map((tag) => (
                        <span key={tag} className="tag tag--muted">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-col gap-xs" style={{ minWidth: '80px', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className={`btn btn--icon ${restaurant.faved_by?.includes(activeMember || '') ? 'btn--accent' : 'btn--ghost'}`}
                      style={{ padding: '8px', fontSize: '1.1rem', background: restaurant.faved_by?.includes(activeMember || '') ? 'var(--color-accent-soft)' : 'transparent' }}
                      onClick={() => handleTogglePreference(restaurant.id, 'faved_by')}
                      title={`Like as ${activeMember}`}
                    >
                      ❤️
                    </button>
                    <button
                      className={`btn btn--icon ${restaurant.disliked_by?.includes(activeMember || '') ? 'btn--accent' : 'btn--ghost'}`}
                      style={{ 
                        padding: '8px', 
                        fontSize: '1.1rem', 
                        background: restaurant.disliked_by?.includes(activeMember || '') ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                        color: restaurant.disliked_by?.includes(activeMember || '') ? '#ef4444' : 'inherit'
                      }}
                      onClick={() => handleTogglePreference(restaurant.id, 'disliked_by')}
                      title={`Dislike as ${activeMember}`}
                    >
                      💔
                    </button>
                  </div>
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: '10px', textTransform: 'uppercase', padding: '4px 8px', color: restaurant.is_disliked ? '#ef4444' : 'var(--color-text-tertiary)' }}
                    onClick={() => handleToggleGlobalDislike(restaurant.id, restaurant.is_disliked)}
                  >
                    {restaurant.is_disliked ? 'Un-ban' : 'Ban globally'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
