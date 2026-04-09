import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { db, storage, functions } from '@/lib/firebase'
import { useProfile } from '@/contexts/ProfileContext'
import type { OrderItem, ParsedReceipt } from '@/types'

type Mode = 'choose' | 'photo' | 'manual' | 'review'

export default function AddOrder() {
  const navigate = useNavigate()
  const { activeProfile } = useProfile()
  const [mode, setMode] = useState<Mode>('choose')
  const [loading, setLoading] = useState(false)

  // Photo flow
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Parsed / manual data
  const [restaurantName, setRestaurantName] = useState('')
  const [restaurantAddress, setRestaurantAddress] = useState('')
  const [items, setItems] = useState<OrderItem[]>([{ name: '', price: 0 }])
  const [totalAmount, setTotalAmount] = useState(0)
  const [currency, setCurrency] = useState<'USD' | 'IDR'>(
    activeProfile?.default_currency || 'USD'
  )
  const [orderedAt, setOrderedAt] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [orderType, setOrderType] = useState<'Photo' | 'Manual'>('Manual')

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handlePhotoSubmit = async () => {
    if (!photoFile || !activeProfile) return
    setLoading(true)

    try {
      // Upload to Firebase Storage
      const storageRef = ref(
        storage,
        `receipts/${activeProfile.id}/${Date.now()}_${photoFile.name}`
      )
      await uploadBytes(storageRef, photoFile)
      const url = await getDownloadURL(storageRef)
      setImageUrl(url)

      // Convert to base64
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1]

        // Call Cloud Function
        const parseReceipt = httpsCallable<
          { base64_image: string; profile_id: string },
          ParsedReceipt
        >(functions, 'parseReceiptPhoto')

        const result = await parseReceipt({
          base64_image: base64,
          profile_id: activeProfile.id,
        })

        const parsed = result.data
        console.log('Parsed Receipt Data:', parsed)
        setRestaurantName(parsed.restaurant_name)
        setRestaurantAddress(parsed.restaurant_address || '')
        setItems(parsed.items.length > 0 ? parsed.items : [{ name: '', price: 0 }])
        setTotalAmount(parsed.total_amount)
        setCurrency(parsed.currency)
        if (parsed.date) setOrderedAt(parsed.date)
        setOrderType('Photo')
        setMode('review')
        setLoading(false)
      }
      reader.readAsDataURL(photoFile)
    } catch (err) {
      console.error('Photo parse error:', err)
      // Fallback to manual mode with the uploaded image
      setOrderType('Photo')
      setMode('review')
      setLoading(false)
    }
  }

  const addItem = () => {
    setItems([...items, { name: '', price: 0 }])
  }

  const updateItem = (index: number, field: 'name' | 'price', value: string) => {
    const updated = [...items]
    if (field === 'price') {
      updated[index] = { ...updated[index], price: parseFloat(value) || 0 }
    } else {
      updated[index] = { ...updated[index], name: value }
    }
    setItems(updated)
  }

  const removeItem = (index: number) => {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!activeProfile || !restaurantName.trim()) return
    setLoading(true)

    try {
      const validItems = items.filter((item) => item.name.trim())
      const orderedDate = new Date(orderedAt)

      // Save the order
      await addDoc(collection(db, 'orders'), {
        profile_id: activeProfile.id,
        restaurant_name: restaurantName.trim(),
        restaurant_address: restaurantAddress.trim() || null,
        order_type: orderType,
        image_url: imageUrl || null,
        items: validItems,
        total_amount: totalAmount,
        currency,
        ordered_at: Timestamp.fromDate(orderedDate),
        created_at: serverTimestamp(),
        status: 'confirmed',
      })

      // Upsert restaurant
      const restQuery = `${activeProfile.id}_${restaurantName.trim().toLowerCase()}`
      const restRef = doc(db, 'restaurants', restQuery)
      const restSnap = await getDoc(restRef)

      if (restSnap.exists()) {
        const data = restSnap.data()
        await setDoc(
          restRef,
          {
            last_ordered_at: Timestamp.fromDate(orderedDate),
            order_count: (data.order_count || 0) + 1,
            address: restaurantAddress.trim() || data.address || null,
          },
          { merge: true }
        )
      } else {
        await setDoc(restRef, {
          profile_id: activeProfile.id,
          name: restaurantName.trim(),
          address: restaurantAddress.trim() || null,
          is_disliked: false,
          tags: [],
          last_ordered_at: Timestamp.fromDate(orderedDate),
          order_count: 1,
        })
      }

      navigate('/')
    } catch (err) {
      console.error('Save error:', err)
      alert(`Error saving order: ${err instanceof Error ? err.message : String(err)}`)
      setLoading(false)
    }
  }

  if (!activeProfile) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-state__icon">⚠️</div>
          <div className="empty-state__title">No profile selected</div>
          <div className="empty-state__text">
            Create a profile in Settings first.
          </div>
        </div>
      </div>
    )
  }

  // Choose mode
  if (mode === 'choose') {
    return (
      <div className="page-container flex-col gap-xl">
        <div className="section-header">
          <h2 className="section-title">Add Order</h2>
        </div>
        <button
          className="card"
          onClick={() => setMode('photo')}
          style={{ cursor: 'pointer', textAlign: 'left' }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 'var(--spacing-sm)' }}>📷</div>
          <div style={{ fontWeight: 600, marginBottom: 'var(--spacing-xs)' }}>Upload Receipt Photo</div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
            Take a photo or upload an image of a receipt. AI will extract the details.
          </div>
        </button>
        <button
          className="card"
          onClick={() => {
            setOrderType('Manual')
            setMode('manual')
          }}
          style={{ cursor: 'pointer', textAlign: 'left' }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 'var(--spacing-sm)' }}>✏️</div>
          <div style={{ fontWeight: 600, marginBottom: 'var(--spacing-xs)' }}>Manual Entry</div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
            Type in the restaurant and order details yourself.
          </div>
        </button>
        <button className="btn btn--secondary btn--full" onClick={() => navigate('/')}>
          Cancel
        </button>
      </div>
    )
  }

  // Photo upload
  if (mode === 'photo') {
    return (
      <div className="page-container flex-col gap-xl">
        <div className="section-header">
          <h2 className="section-title">Upload Receipt</h2>
        </div>

        {photoPreview ? (
          <div>
            <img
              src={photoPreview}
              alt="Receipt preview"
              style={{
                width: '100%',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>
        ) : (
          <label
            className="card"
            style={{
              cursor: 'pointer',
              textAlign: 'center',
              padding: 'var(--spacing-3xl) var(--spacing-xl)',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>📸</div>
            <div style={{ fontWeight: 600, marginBottom: 'var(--spacing-xs)' }}>
              Tap to take a photo or choose from gallery
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
            />
          </label>
        )}

        <div className="flex-col gap-md">
          {photoFile && (
            <button
              className="btn btn--primary btn--full btn--lg"
              onClick={handlePhotoSubmit}
              disabled={loading}
            >
              {loading ? 'Analyzing receipt…' : 'Parse with AI'}
            </button>
          )}
          <button
            className="btn btn--secondary btn--full"
            onClick={() => {
              setPhotoFile(null)
              setPhotoPreview(null)
              setMode('choose')
            }}
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // Manual entry or Review (same form, different heading)
  return (
    <div className="page-container flex-col gap-xl">
      <div className="section-header">
        <h2 className="section-title">
          {mode === 'review' ? 'Review Order' : 'Manual Entry'}
        </h2>
      </div>

      {mode === 'review' && (
        <div className="card card--glass" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-accent)' }}>
            ✨ AI-parsed — please verify the details below
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="flex-col gap-lg">
        <div className="form-group">
          <label className="form-label">Restaurant</label>
          <input
            className="form-input"
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="e.g., Nasi Goreng Pak Haji"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Restaurant Address</label>
          <input
            className="form-input"
            type="text"
            value={restaurantAddress}
            onChange={(e) => setRestaurantAddress(e.target.value)}
            placeholder="e.g., 123 Main St, Jakarta"
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

        <div className="form-group">
          <label className="form-label">Currency</label>
          <select
            className="form-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as 'USD' | 'IDR')}
          >
            <option value="USD">USD ($)</option>
            <option value="IDR">IDR (Rp)</option>
          </select>
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="form-label">Items</label>
            <button type="button" className="btn btn--ghost" onClick={addItem}>
              + Add item
            </button>
          </div>
          <div className="flex-col gap-sm">
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                <input
                  className="form-input"
                  type="text"
                  value={item.name}
                  onChange={(e) => updateItem(i, 'name', e.target.value)}
                  placeholder="Item name"
                  style={{ flex: 2 }}
                />
                <input
                  className="form-input"
                  type="number"
                  value={item.price || ''}
                  onChange={(e) => updateItem(i, 'price', e.target.value)}
                  placeholder="Price"
                  style={{ flex: 1 }}
                  step="0.01"
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => removeItem(i)}
                    style={{ padding: 'var(--spacing-sm)' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Total</label>
          <input
            className="form-input"
            type="number"
            value={totalAmount || ''}
            onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
            placeholder="Total amount"
            step="0.01"
          />
        </div>

        <div className="flex-col gap-md mt-lg">
          <button
            type="submit"
            className="btn btn--primary btn--full btn--lg"
            disabled={loading || !restaurantName.trim()}
          >
            {loading ? 'Saving…' : 'Save Order'}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--full"
            onClick={() => {
              if (mode === 'review') {
                setMode('choose')
              } else {
                navigate('/')
              }
            }}
          >
            {mode === 'review' ? 'Back' : 'Cancel'}
          </button>
        </div>
      </form>
    </div>
  )
}
