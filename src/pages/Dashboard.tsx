import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
} from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { db } from '@/lib/firebase'
import { useProfile } from '@/contexts/ProfileContext'
import { toggleRestaurantPreference } from '@/lib/preferences'
import type { Order, Restaurant } from '@/types'

function formatCurrency(amount: number, currency: string) {
  if (currency === 'IDR') {
    return `Rp ${amount.toLocaleString('id-ID')}`
  }
  return `$${amount.toFixed(2)}`
}

function formatDate(date: Date) {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const { activeProfile, activeMember } = useProfile()
  const [orders, setOrders] = useState<Order[]>([])
  const [restaurants, setRestaurants] = useState<Record<string, Restaurant>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!activeProfile) {
      setOrders([])
      setRestaurants({})
      setLoading(false)
      return
    }

    // Fetch restaurants to get preference status
    const fetchRestaurants = async () => {
      const q = query(
        collection(db, 'restaurants'),
        where('profile_id', '==', activeProfile.id)
      )
      const snap = await getDocs(q)
      const resMap: Record<string, Restaurant> = {}
      snap.docs.forEach(doc => {
        const data = doc.data() as Restaurant
        resMap[data.name.toLowerCase()] = { ...data, id: doc.id }
      })
      setRestaurants(resMap)
    }

    fetchRestaurants()

    const q = query(
      collection(db, 'orders'),
      where('profile_id', '==', activeProfile.id),
      orderBy('ordered_at', 'desc'),
      limit(50)
    )

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        ordered_at: doc.data().ordered_at?.toDate() || new Date(),
        created_at: doc.data().created_at?.toDate() || new Date(),
      })) as Order[]
      setOrders(data)
      
      // Initialize all cards as collapsed
      const initialCollapsed: Record<string, boolean> = {}
      data.forEach(order => {
        initialCollapsed[order.id] = true
      })
      setCollapsedCards(prev => ({ ...initialCollapsed, ...prev }))
      
      setLoading(false)
    })

    return unsubscribe
  }, [activeProfile])

  const toggleCard = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCollapsedCards(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handlePreference = async (restaurantName: string, type: 'faved_by' | 'disliked_by', e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const restaurant = restaurants[restaurantName.toLowerCase()]
    if (!restaurant || !activeMember) return
    
    await toggleRestaurantPreference(restaurant, activeMember, type)
    
    // Optimistic update for local state
    setRestaurants(prev => {
      const res = prev[restaurantName.toLowerCase()]
      const current = res[type] || []
      const isPresent = current.includes(activeMember)
      const next = isPresent ? current.filter(m => m !== activeMember) : [...current, activeMember]
      return {
        ...prev,
        [restaurantName.toLowerCase()]: { ...res, [type]: next }
      }
    })
  }

  const filteredOrders = orders.filter(order => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return true
    
    const matchesName = order.restaurant_name.toLowerCase().includes(query)
    const matchesTags = order.items.some(item => 
      item.tags?.some(tag => tag.toLowerCase().includes(query))
    )
    return matchesName || matchesTags
  })

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="spinner" />
      </div>
    )
  }

  // Quick stats
  const now = new Date()
  const thisWeek = orders.filter((o) => {
    const diff = now.getTime() - o.ordered_at.getTime()
    return diff < 7 * 24 * 60 * 60 * 1000
  })
  const thisMonth = orders.filter(
    (o) =>
      o.ordered_at.getMonth() === now.getMonth() &&
      o.ordered_at.getFullYear() === now.getFullYear()
  )
  const monthSpend = thisMonth.reduce((sum, o) => sum + o.total_amount, 0)

  return (
    <div className="page-container flex-col gap-lg">
      {/* Search Bar */}
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Search by restaurant or tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Stats */}
      <div className="stats-compact">
        <div className="stat-pill">
          <div className="stat-pill__value">{thisWeek.length}</div>
          <div className="stat-pill__label">This week</div>
        </div>
        <div className="stat-pill">
          <div className="stat-pill__value">{thisMonth.length}</div>
          <div className="stat-pill__label">This month</div>
        </div>
        <div className="stat-pill">
          <div className="stat-pill__value">
            {formatCurrency(monthSpend, activeProfile?.default_currency || 'USD')}
          </div>
          <div className="stat-pill__label">Spent</div>
        </div>
      </div>

      {/* Recent Orders */}
      <div>
        <div className="section-header" style={{ marginBottom: 'var(--spacing-md)' }}>
          <h2 className="section-title">
            {searchQuery ? 'Search Results' : 'Recent Orders'}
          </h2>
        </div>

        {orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">📭</div>
            <div className="empty-state__title">No orders yet</div>
            <div className="empty-state__text">
              Forward a receipt email or tap the + button to add your first order.
            </div>
          </div>
        ) : (
          <div className="flex-col gap-md">
            {filteredOrders.map((order) => (
              <Link
                key={order.id}
                to={`/order/${order.id}`}
                className="card order-card"
                style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
              >
                <div className="flex-row justify-between align-center">
                  <div className="order-card__restaurant" style={{ flex: 1 }}>{order.restaurant_name}</div>
                  <div className="order-card__actions">
                    <button 
                      className={`btn-pref ${restaurants[order.restaurant_name.toLowerCase()]?.faved_by?.includes(activeMember || '') ? 'btn-pref--active' : ''}`}
                      onClick={(e) => handlePreference(order.restaurant_name, 'faved_by', e)}
                    >
                      ❤️
                    </button>
                    <button 
                      className={`btn-pref btn-pref--dislike ${restaurants[order.restaurant_name.toLowerCase()]?.disliked_by?.includes(activeMember || '') ? 'btn-pref--active' : ''}`}
                      onClick={(e) => handlePreference(order.restaurant_name, 'disliked_by', e)}
                    >
                      💔
                    </button>
                    <button 
                      className="order-card__btn-toggle"
                      onClick={(e) => toggleCard(order.id, e)}
                    >
                      {collapsedCards[order.id] ? 'More' : 'Less'}
                    </button>
                  </div>
                </div>

                <div className={`order-card__header-collapsible ${collapsedCards[order.id] ? 'order-card__header-collapsible--collapsed' : ''}`}>
                  <div className="order-card__meta">
                    <span
                      className={`order-card__badge order-card__badge--${order.order_type.toLowerCase()}`}
                    >
                      {order.order_type === 'Email' && '📧'}
                      {order.order_type === 'Photo' && '📷'}
                      {order.order_type === 'Manual' && '✏️'}
                      {' '}{order.order_type}
                    </span>
                    <span>{formatDate(order.ordered_at)}</span>
                    {order.restaurant_address && (
                      <span className="mini-meta">📍 {order.restaurant_address}</span>
                    )}
                    {order.status === 'pending_review' && (
                      <span className="tag" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                        Needs review
                      </span>
                    )}
                  </div>
                  {order.items.some(it => it.tags && it.tags.length > 0) && (
                    <div className="rotation-card__tags" style={{ marginTop: '4px' }}>
                      {Array.from(new Set(order.items.flatMap(it => it.tags || []))).map(tag => (
                        <span key={tag} className="tag tag--muted">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="order-card__items">
                  {order.items.slice(0, 4).map((item, i) => (
                    <div key={i} className="order-card__item">
                      <span>{item.name}</span>
                      <span>{formatCurrency(item.price, order.currency)}</span>
                    </div>
                  ))}
                  {order.items.length > 4 && (
                    <div className="order-card__item" style={{ color: 'var(--color-text-tertiary)' }}>
                      <span>+{order.items.length - 4} more items</span>
                    </div>
                  )}
                </div>
                <div className="order-card__total">
                  <span>Total</span>
                  <div className="flex-row gap-sm align-center">
                    <span>{formatCurrency(order.total_amount, order.currency)}</span>
                    <button
                      className="btn btn--icon btn--ghost"
                      style={{ color: 'var(--color-error)', padding: '4px' }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (window.confirm('Are you sure you want to delete this order?')) {
                          import('firebase/firestore').then(({ doc, deleteDoc }) => {
                            deleteDoc(doc(db, 'orders', order.id));
                          });
                        }
                      }}
                      title="Delete order"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
