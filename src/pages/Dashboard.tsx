import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useProfile } from '@/contexts/ProfileContext'
import type { Order } from '@/types'

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
  const { activeProfile } = useProfile()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeProfile) {
      setOrders([])
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'orders'),
      where('profile_id', '==', activeProfile.id),
      orderBy('ordered_at', 'desc'),
      limit(20)
    )

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        ordered_at: doc.data().ordered_at?.toDate() || new Date(),
        created_at: doc.data().created_at?.toDate() || new Date(),
      })) as Order[]
      setOrders(data)
      setLoading(false)
    })

    return unsubscribe
  }, [activeProfile])

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
    <div className="page-container flex-col gap-xl">
      {/* Stats */}
      <div className="stats-row">
        <div className="card stat-card">
          <div className="stat-card__value">{thisWeek.length}</div>
          <div className="stat-card__label">This week</div>
        </div>
        <div className="card stat-card">
          <div className="stat-card__value">{thisMonth.length}</div>
          <div className="stat-card__label">This month</div>
        </div>
        <div className="card stat-card">
          <div className="stat-card__value">
            {formatCurrency(monthSpend, activeProfile?.default_currency || 'USD')}
          </div>
          <div className="stat-card__label">Month spend</div>
        </div>
      </div>

      {/* Recent Orders */}
      <div>
        <div className="section-header">
          <h2 className="section-title">Recent Orders</h2>
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
            {orders.map((order) => (
              <div key={order.id} className="card order-card">
                <div className="order-card__restaurant">{order.restaurant_name}</div>
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
                  {order.status === 'pending_review' && (
                    <span className="tag" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                      Needs review
                    </span>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
