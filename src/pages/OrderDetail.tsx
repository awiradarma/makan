import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { toast } from 'react-hot-toast'
import { db } from '@/lib/firebase'
import { updateFoodItems } from '@/lib/foodItems'
import type { Order, OrderItem } from '@/types'

function formatCurrency(amount: number, currency: string) {
  if (currency === 'IDR') {
    return `Rp ${amount.toLocaleString('id-ID')}`
  }
  return `$${amount.toFixed(2)}`
}

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Edit state
  const [restaurantName, setRestaurantName] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [orderedAt, setOrderedAt] = useState('')

  useEffect(() => {
    async function fetchOrder() {
      if (!id) return
      try {
        const docRef = doc(db, 'orders', id)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data() as Order
          // Handle Firestore Timestamp
          const date = data.ordered_at instanceof Timestamp 
            ? data.ordered_at.toDate() 
            : new Date(data.ordered_at)
          
          setOrder({ ...data, id: docSnap.id, ordered_at: date })
          setRestaurantName(data.restaurant_name)
          setItems(data.items || [])
          setOrderedAt(date.toISOString().split('T')[0])
        } else {
          toast.error('Order not found')
          navigate('/')
        }
      } catch (err) {
        console.error('Error fetching order:', err)
        toast.error('Failed to load order')
      } finally {
        setLoading(false)
      }
    }
    fetchOrder()
  }, [id, navigate])

  const handleUpdateItem = (index: number, field: keyof OrderItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const handleSave = async (confirmReview = false) => {
    if (!order || !id) return
    setSaving(true)

    try {
      const firestoreData: any = {
        restaurant_name: restaurantName,
        items: items,
        ordered_at: Timestamp.fromDate(new Date(orderedAt)),
        updated_at: serverTimestamp(),
      }

      if (confirmReview) {
        firestoreData.status = 'confirmed'
      }

      await updateDoc(doc(db, 'orders', id), firestoreData)
      
      const fullUpdatedOrder: Order = { 
        ...order, 
        restaurant_name: restaurantName,
        items: items,
        ordered_at: new Date(orderedAt),
        status: confirmReview ? 'confirmed' : order.status,
      }
      
      if (confirmReview) {
        await updateFoodItems(fullUpdatedOrder)
        toast.success('Order reviewed and confirmed!')
      } else {
        toast.success('Order updated')
      }
      
      setOrder(fullUpdatedOrder)
      if (confirmReview) navigate('/')
    } catch (err) {
      console.error('Error saving order:', err)
      toast.error('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!order) return null

  return (
    <div className="page-container flex-col gap-xl">
      <div className="section-header">
        <h2 className="section-title">Order Details</h2>
        {order.status === 'pending_review' && (
          <span className="tag" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
            Needs review
          </span>
        )}
      </div>

      <div className="card flex-col gap-lg">
        {order.image_url && (
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <img 
              src={order.image_url} 
              alt="Receipt" 
              style={{ width: '100%', borderRadius: 'var(--radius-md)', maxHeight: '300px', objectFit: 'contain', background: 'var(--color-bg-primary)' }} 
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Restaurant</label>
          <input
            className="form-input"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Date</label>
          <input
            className="form-input"
            type="date"
            value={orderedAt}
            onChange={(e) => setOrderedAt(e.target.value)}
          />
        </div>

        <div className="flex-col gap-md">
          <label className="form-label">Items & Ratings</label>
          {items.map((item, i) => (
            <div key={i} className="card card--glass flex-col gap-sm" style={{ padding: 'var(--spacing-md)' }}>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                <input
                  className="form-input"
                  value={item.name}
                  onChange={(e) => handleUpdateItem(i, 'name', e.target.value)}
                  style={{ flex: 2 }}
                />
                <input
                  className="form-input"
                  type="number"
                  value={item.price}
                  onChange={(e) => handleUpdateItem(i, 'price', parseFloat(e.target.value) || 0)}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Rating:</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleUpdateItem(i, 'rating', r)}
                      style={{
                        background: item.rating === r ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s',
                        color: item.rating === r ? '#1a1a22' : 'var(--color-text-primary)'
                      }}
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
            </div>
          ))}
        </div>

        <div className="order-card__total" style={{ fontSize: 'var(--font-size-lg)' }}>
          <span>Total</span>
          <span>{formatCurrency(order.total_amount, order.currency)}</span>
        </div>
      </div>

      <div className="flex-col gap-md">
        {order.status === 'pending_review' ? (
          <button 
            className="btn btn--primary btn--full btn--lg" 
            onClick={() => handleSave(true)}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Confirm Review & Save'}
          </button>
        ) : (
          <button 
            className="btn btn--primary btn--full" 
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
        <button className="btn btn--secondary btn--full" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
