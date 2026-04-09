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
import type { Restaurant } from '@/types'

function daysSince(date: Date): number {
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export default function Rotation() {
  const { activeProfile } = useProfile()
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [showDisliked, setShowDisliked] = useState(false)
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

  const filtered = showDisliked
    ? restaurants
    : restaurants.filter((r) => !r.is_disliked)

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page-container flex-col gap-xl">
      <div className="section-header">
        <h2 className="section-title">Rotation</h2>
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
