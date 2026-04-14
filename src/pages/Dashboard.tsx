import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  QueryConstraint
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
  const [showOnlyPending, setShowOnlyPending] = useState(false)
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({})
  const [viewMode, setViewMode] = useState<'recent' | 'insights'>('recent')
  const [globalOrders, setGlobalOrders] = useState<Order[]>([])
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false)
  const [hasSearchedGlobal, setHasSearchedGlobal] = useState(false)
  
  // Insights state
  const [topRestaurants, setTopRestaurants] = useState<Restaurant[]>([])
  const [topFoodItems, setTopFoodItems] = useState<any[]>([])

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

    const constraints: QueryConstraint[] = [
      where('profile_id', '==', activeProfile.id),
      orderBy('ordered_at', 'desc'),
    ]

    if (showOnlyPending) {
      constraints.push(where('status', '==', 'pending_review'))
      constraints.push(limit(200)) // Higher limit for pending reviews
    } else {
      constraints.push(limit(50))
    }

    const q = query(
      collection(db, 'orders'),
      ...constraints
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
  }, [activeProfile, showOnlyPending])

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

  const handleGlobalSearch = async () => {
    if (!activeProfile || !searchQuery) return
    setIsSearchingGlobal(true)
    try {
      // We can't do a partial glob search efficiently in Firestore without external index,
      // but we can search for the profile's orders and filter.
      // Since "all orders" is requested, we'll fetch all and filter manually 
      // if it's not too many, or just query by restaurant_name if possible.
      const q = query(
        collection(db, 'orders'),
        where('profile_id', '==', activeProfile.id),
        orderBy('ordered_at', 'desc')
      )
      const snap = await getDocs(q)
      const queryLower = searchQuery.toLowerCase().trim()
      const allData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        ordered_at: doc.data().ordered_at?.toDate() || new Date(),
      })) as Order[]
      
      const filtered = allData.filter(o => 
        o.restaurant_name.toLowerCase().includes(queryLower) ||
        o.items.some(it => it.name.toLowerCase().includes(queryLower) || it.tags?.some(t => t.toLowerCase().includes(queryLower)))
      )
      
      setGlobalOrders(filtered)
      setHasSearchedGlobal(true)
    } finally {
      setIsSearchingGlobal(false)
    }
  }

  useEffect(() => {
    if (viewMode === 'insights' && activeProfile) {
      const fetchInsights = async () => {
        try {
          const qRest = query(
            collection(db, 'restaurants'),
            where('profile_id', '==', activeProfile.id),
            orderBy('order_count', 'desc'),
            limit(10)
          )
          const snapRest = await getDocs(qRest)
          setTopRestaurants(snapRest.docs.map(d => ({ id: d.id, ...d.data() } as Restaurant)))

          const qItems = query(
            collection(db, 'food_items'),
            where('profile_id', '==', activeProfile.id),
            orderBy('order_count', 'desc'),
            limit(10)
          )
          const snapItems = await getDocs(qItems)
          setTopFoodItems(snapItems.docs.map(d => ({ id: d.id, ...d.data() } as any)))
        } catch (err) {
          console.error('Error fetching insights:', err)
        }
      }
      fetchInsights()
    }
  }, [viewMode, activeProfile])

  const filteredOrders = orders.filter(order => {
    // 1. Pending filter
    if (showOnlyPending && order.status !== 'pending_review') return false

    // 2. Search query filter
    const query = searchQuery.toLowerCase().trim()
    if (!query) return true
    
    const matchesName = order.restaurant_name.toLowerCase().includes(query)
    const matchesTags = order.items.some(item => 
      item.name.toLowerCase().includes(query) || // Added item name
      item.tags?.some(tag => tag.toLowerCase().includes(query))
    )
    return matchesName || matchesTags
  })

  const displayOrders = hasSearchedGlobal ? globalOrders : filteredOrders

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
      <div className="section-header section-header--sticky" style={{ zIndex: 95 }}>
        <div className="segmented-control">
          <button 
            className={`segmented-control__item ${viewMode === 'recent' ? 'active' : ''}`}
            onClick={() => { setViewMode('recent'); setHasSearchedGlobal(false); }}
          >
            Orders
          </button>
          <button 
            className={`segmented-control__item ${viewMode === 'insights' ? 'active' : ''}`}
            onClick={() => setViewMode('insights')}
          >
            Insights
          </button>
        </div>
      </div>

      {viewMode === 'recent' ? (
        <>
      {/* Search Bar */}
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Search by restaurant, item, or tag..."
          value={searchQuery}
          onChange={(e) => { 
            setSearchQuery(e.target.value)
            if (hasSearchedGlobal) setHasSearchedGlobal(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleGlobalSearch()}
        />
        {searchQuery && !hasSearchedGlobal && (
          <button 
            className="btn btn--secondary" 
            style={{ padding: '4px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}
            onClick={handleGlobalSearch}
            disabled={isSearchingGlobal}
          >
            {isSearchingGlobal ? '...' : 'Search All'}
          </button>
        )}
        <button 
          className={`btn btn--icon ${showOnlyPending ? 'active' : ''}`}
          onClick={() => setShowOnlyPending(!showOnlyPending)}
          title="Show only orders needing review"
          style={{ 
            padding: '4px 8px', 
            background: showOnlyPending ? 'var(--color-accent-soft)' : 'transparent',
            border: showOnlyPending ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            marginLeft: '8px',
            whiteSpace: 'nowrap',
            color: showOnlyPending ? 'var(--color-accent)' : 'var(--color-text-secondary)'
          }}
        >
          🟡 {showOnlyPending ? 'All Orders' : 'Needs Review'}
        </button>
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
        {orders.some(o => o.status === 'pending_review') && (
          <div 
            className={`stat-pill ${showOnlyPending ? 'stat-pill--active' : ''}`}
            onClick={() => setShowOnlyPending(!showOnlyPending)}
            style={{ cursor: 'pointer', border: showOnlyPending ? '1px solid #eab308' : 'none', background: showOnlyPending ? 'rgba(234,179,8,0.1)' : 'var(--color-bg-elevated)' }}
          >
            <div className="stat-pill__value" style={{ color: '#eab308' }}>
              {orders.filter(o => o.status === 'pending_review').length}
            </div>
            <div className="stat-pill__label">Review</div>
          </div>
        )}
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
            {searchQuery ? (hasSearchedGlobal ? 'Global Search Results' : 'Search Results') : 'Recent Orders'}
          </h2>
          {hasSearchedGlobal && (
            <button className="btn btn--ghost" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => setHasSearchedGlobal(false)}>
              Back to Recent
            </button>
          )}
        </div>

        {displayOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">📭</div>
            <div className="empty-state__title">No orders found</div>
            <div className="empty-state__text">
              {hasSearchedGlobal 
                ? "We couldn't find any orders matching your search in your entire history."
                : "Try a different search or click 'Search All'"}
            </div>
          </div>
        ) : (
          <div className="flex-col gap-md">
            {displayOrders.map((order) => (
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
      </>
      ) : (
        <div className="flex-col gap-xl">
          <div className="section-header">
            <h2 className="section-title">Top Restaurants</h2>
          </div>
          <div className="stats-compact wrap" style={{ flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            {topRestaurants.map((r, i) => (
              <div key={r.id} className="stat-pill" style={{ justifyContent: 'space-between', width: '100%', padding: 'var(--spacing-md)' }}>
                <div className="flex-row align-center gap-sm">
                  <span style={{ opacity: 0.5, fontSize: 'var(--font-size-xs)' }}>#{i+1}</span>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                </div>
                <div className="stat-pill__value">{r.order_count} visits</div>
              </div>
            ))}
          </div>

          <div className="section-header">
            <h2 className="section-title">Favorite Items</h2>
          </div>
          <div className="stats-compact wrap" style={{ flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            {topFoodItems.map((item, i) => (
              <div key={item.id} className="stat-pill" style={{ justifyContent: 'space-between', width: '100%', padding: 'var(--spacing-md)' }}>
                <div className="flex-col">
                  <div className="flex-row align-center gap-sm">
                    <span style={{ opacity: 0.5, fontSize: 'var(--font-size-xs)' }}>#{i+1}</span>
                    <span style={{ fontWeight: 600 }}>{item.name}</span>
                  </div>
                  <span className="mini-meta">at {item.restaurant_name}</span>
                </div>
                <div className="stat-pill__value">{item.order_count}x</div>
              </div>
            ))}
          </div>

          <div className="section-header">
            <h2 className="section-title">Spending History</h2>
          </div>
          <div className="card flex-col gap-sm">
            {(() => {
              const monthlySpend: Record<string, number> = {}
              orders.forEach(o => {
                const month = o.ordered_at.toLocaleString('default', { month: 'short', year: 'numeric' })
                monthlySpend[month] = (monthlySpend[month] || 0) + o.total_amount
              })
              return Object.entries(monthlySpend)
                .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
                .slice(0, 6)
                .map(([month, amount]) => (
                  <div key={month} className="flex-row justify-between align-center" style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontWeight: 500 }}>{month}</span>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                      {formatCurrency(amount, activeProfile?.default_currency || 'USD')}
                    </span>
                  </div>
                ))
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
