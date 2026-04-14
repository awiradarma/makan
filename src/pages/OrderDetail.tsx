import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, Timestamp, increment } from 'firebase/firestore'
import { toast } from 'react-hot-toast'
import { db } from '@/lib/firebase'
import { updateFoodItems } from '@/lib/foodItems'
import { useProfile } from '@/contexts/ProfileContext'
import { TagInput } from '@/components/TagInput'
import { geocodeAddress } from '@/lib/geocoding'
import type { Order, OrderItem } from '@/types'


export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeMember } = useProfile()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Edit state
  const [restaurantName, setRestaurantName] = useState('')
  const [restaurantAddress, setRestaurantAddress] = useState('')
  const [restaurantTags, setRestaurantTags] = useState<string[]>([])
  const [items, setItems] = useState<OrderItem[]>([])
  const [orderedAt, setOrderedAt] = useState('')
  const [totalAmount, setTotalAmount] = useState(0)
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(true)

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
          setRestaurantAddress(data.restaurant_address || '')
          setItems(data.items?.map(item => ({ ...item, tags: item.tags || [] })) || [])
          setTotalAmount(data.total_amount)
          setOrderedAt(date.toISOString().split('T')[0])

          // Fetch restaurant tags
          const restId = `${data.profile_id}_${data.restaurant_name.trim().toLowerCase()}`
          const restSnap = await getDoc(doc(db, 'restaurants', restId))
          if (restSnap.exists()) {
            const restData = restSnap.data()
            const existingTags = restData.tags || []
            if (existingTags.length > 0) {
              setRestaurantTags(existingTags)
            } else if (data.items) {
              // Fallback to item tags if restaurant has none
              const itemTags = Array.from(new Set(data.items.flatMap(it => it.tags || [])))
              setRestaurantTags(itemTags)
            }
          } else if (data.items) {
            // New restaurant, pre-fill from items
            const itemTags = Array.from(new Set(data.items.flatMap(it => it.tags || [])))
            setRestaurantTags(itemTags)
          }
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
        restaurant_address: restaurantAddress,
        items: items,
        total_amount: totalAmount,
        ordered_at: Timestamp.fromDate(new Date(orderedAt)),
        updated_at: serverTimestamp(),
      }

      if (confirmReview) {
        firestoreData.status = 'confirmed'
      }

      await updateDoc(doc(db, 'orders', id), firestoreData)
      
      // Upsert restaurant info
      const restId = `${order.profile_id}_${restaurantName.trim().toLowerCase()}`
      const restRef = doc(db, 'restaurants', restId)
      const restSnap = await getDoc(restRef)
      
      const restData: any = {
        name: restaurantName,
        address: restaurantAddress,
        tags: restaurantTags,
        updated_at: serverTimestamp(),
      }

      // Geocode if address has changed or coordinates are missing
      if (restaurantAddress && (!restSnap.exists() || !restSnap.data().lat || restSnap.data().address !== restaurantAddress)) {
        const coords = await geocodeAddress(restaurantAddress)
        if (coords) {
          restData.lat = coords.lat
          restData.lng = coords.lng
        }
      }

      if (restSnap.exists()) {
        const currentData = restSnap.data()
        const currentLastOrderedAt = currentData.last_ordered_at?.toDate() || new Date(0)
        
        // Only update last_ordered_at if the order being saved is newer
        const updates: any = { ...restData }
        const newOrderDate = new Date(orderedAt)
        
        if (newOrderDate > currentLastOrderedAt) {
          updates.last_ordered_at = Timestamp.fromDate(newOrderDate)
        }
        
        await updateDoc(restRef, {
          ...updates,
          order_count: increment(1)
        })
      } else {
        await setDoc(restRef, {
          ...restData,
          profile_id: order.profile_id,
          is_disliked: false,
          order_count: 1,
          last_ordered_at: Timestamp.fromDate(new Date(orderedAt)),
        })
      }

      const fullUpdatedOrder: Order = { 
        ...order, 
        restaurant_name: restaurantName,
        restaurant_address: restaurantAddress,
        items: items,
        total_amount: totalAmount,
        ordered_at: new Date(orderedAt),
        status: confirmReview ? 'confirmed' : order.status,
      }
      
      if (confirmReview) {
        await updateFoodItems(fullUpdatedOrder, activeMember)
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
        <div className="flex-row gap-sm align-center">
          {order.status === 'pending_review' && (
            <span className="tag" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
              Needs review
            </span>
          )}
          <button 
            className="order-card__btn-toggle"
            onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
          >
            {isHeaderCollapsed ? 'Show Info' : 'Hide Info'}
          </button>
        </div>
      </div>

      <div className="card flex-col gap-lg">
        <div className="flex-row justify-between align-center" style={{ borderBottom: isHeaderCollapsed ? 'none' : '1px solid var(--color-border)', paddingBottom: isHeaderCollapsed ? 0 : 'var(--spacing-md)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{restaurantName}</h3>
        </div>

        <div className={`order-card__header-collapsible ${isHeaderCollapsed ? 'order-card__header-collapsible--collapsed' : ''}`}>
          {order.image_url && (
            <div style={{ marginBottom: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
              <img 
                src={order.image_url} 
                alt="Receipt" 
                style={{ width: '100%', borderRadius: 'var(--radius-md)', maxHeight: '300px', objectFit: 'contain', background: 'var(--color-bg-primary)' }} 
              />
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
            <label className="form-label">Restaurant Name</label>
            <input
              className="form-input"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
            <label className="form-label">Restaurant Address</label>
            <input
              className="form-input"
              value={restaurantAddress}
              onChange={(e) => setRestaurantAddress(e.target.value)}
              placeholder="e.g., 123 Main St, Jakarta"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
            <label className="form-label">Restaurant Tags</label>
            <TagInput 
              tags={restaurantTags} 
              onChange={setRestaurantTags} 
              placeholder="Add cuisine or vibe tags..."
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
        </div>

        <div className="flex-col gap-md">
          <label className="form-label">Items, Ratings & Tags</label>
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
              <div>
                <TagInput 
                  tags={item.tags || []} 
                  onChange={(newTags) => handleUpdateItem(i, 'tags', newTags)}
                  placeholder="item tags (e.g., #spicy)"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="order-card__total" style={{ fontSize: 'var(--font-size-lg)' }}>
          <span>Total</span>
          <div className="flex-row gap-sm align-center">
            <div style={{ fontSize: 'var(--font-size-sm)', opacity: 0.7 }}>
              {order.currency === 'IDR' ? 'Rp' : '$'}
            </div>
            <input
              type="number"
              className="form-input"
              style={{ width: '120px', textAlign: 'right', padding: '4px 8px' }}
              value={totalAmount}
              onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
              step="0.01"
            />
            <button 
              className="btn btn--ghost" 
              style={{ padding: '4px', fontSize: '10px' }}
              onClick={() => setTotalAmount(items.reduce((sum, i) => sum + (i.price || 0), 0))}
              title="Recalculate from items"
            >
              🔄
            </button>
          </div>
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
