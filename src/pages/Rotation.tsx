import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '@/lib/firebase'
import { useProfile } from '@/contexts/ProfileContext'
import { useLocation } from '@/contexts/LocationContext'
import { toggleRestaurantPreference, toggleGlobalDislike } from '@/lib/preferences'
import { calculateDistance } from '@/lib/geocoding'
import type { Restaurant } from '@/types'

function daysSince(date: Date): number {
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export default function Rotation() {
  const { activeProfile, activeMember } = useProfile()
  const { location } = useLocation()
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [showDisliked, setShowDisliked] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [maxDistance, setMaxDistance] = useState<number | null>(null) // null means "Any"
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
    if (!showDisliked) {
      if (r.is_disliked) return false
      if (r.disliked_by?.includes(activeMember || '')) return false
    }
    
    // Search filter
    const query = searchQuery.toLowerCase().trim()
    let matchesSearch = true
    if (query) {
      const matchesName = r.name.toLowerCase().includes(query)
      const matchesTags = r.tags.some(tag => tag.toLowerCase().includes(query))
      matchesSearch = matchesName || matchesTags
    }
    if (!matchesSearch) return false

    // Proximity filter
    if (maxDistance !== null && location && r.lat && r.lng) {
      const dist = calculateDistance(location.lat, location.lng, r.lat, r.lng)
      if (dist > maxDistance) return false
    }

    return true
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
      <div className="section-header section-header--sticky">
        <h2 className="section-title">
          {searchQuery ? 'Search Results' : 'Rotation'}
        </h2>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button 
            className="btn btn--accent" 
            onClick={() => navigate('/tradition')}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>🎡</span>
            <span>Spin</span>
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => setShowDisliked(!showDisliked)}
          >
            {showDisliked ? 'Hide disliked' : 'Show disliked'}
          </button>
        </div>
      </div>

      <div className="flex-row gap-sm align-center wrap" style={{ flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: '200px' }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Filter restaurants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex-row align-center gap-xs" style={{ background: 'var(--color-bg-secondary)', padding: '4px 12px', borderRadius: 'var(--radius-md)', height: '44px' }}>
          <span style={{ fontSize: '1.2rem' }}>📍</span>
          <select 
            className="search-input" 
            style={{ width: 'auto', background: 'transparent', border: 'none', padding: '0' }}
            value={maxDistance || ''}
            onChange={(e) => setMaxDistance(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Any distance</option>
            <option value="1">{"< 1 km"}</option>
            <option value="3">{"< 3 km"}</option>
            <option value="5">{"< 5 km"}</option>
            <option value="10">{"< 10 km"}</option>
            <option value="25">{"< 25 km"}</option>
          </select>
        </div>
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
                    {location && restaurant.lat && restaurant.lng && (
                      <span className="tag tag--accent" style={{ marginLeft: '8px', fontSize: '0.7rem' }}>
                        {calculateDistance(location.lat, location.lng, restaurant.lat, restaurant.lng).toFixed(1)} km
                      </span>
                    )}
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

                <div className="flex-row gap-xs align-center" style={{ minWidth: '80px' }}>
                  <button
                    className={`btn-pref ${restaurant.faved_by?.includes(activeMember || '') ? 'btn-pref--active' : ''}`}
                    onClick={() => handleTogglePreference(restaurant.id, 'faved_by')}
                    title={`Like as ${activeMember}`}
                  >
                    ❤️
                  </button>
                  <button
                    className={`btn-pref btn-pref--dislike ${restaurant.disliked_by?.includes(activeMember || '') ? 'btn-pref--active' : ''}`}
                    onClick={() => handleTogglePreference(restaurant.id, 'disliked_by')}
                    title={`Dislike as ${activeMember}`}
                  >
                    💔
                  </button>
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
