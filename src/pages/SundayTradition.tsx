import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useProfile } from '@/contexts/ProfileContext'
import { useLocation } from '@/contexts/LocationContext'
import { calculateDistance, formatDistance } from '@/lib/geocoding'
import type { Restaurant } from '@/types'

const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', 
  '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc', '#f472b6'
]

export default function SundayTradition() {
  const { activeProfile, activeMember, distanceUnit } = useProfile()
  const { location } = useLocation()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [isSpinning, setIsSpinning] = useState(false)
  const [winner, setWinner] = useState<Restaurant | null>(null)
  const [maxDistance, setMaxDistance] = useState<number | null>(null)
  
  // Animation state
  const rotationRef = useRef(0)
  const velocityRef = useRef(0)
  const requestRef = useRef<number | null>(null)

  useEffect(() => {
    async function fetchRotation() {
      if (!activeProfile) return
      
      const q = query(
        collection(db, 'restaurants'),
        where('profile_id', '==', activeProfile.id)
      )
      const snap = await getDocs(q)
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Restaurant))
      
      // Filter by "Rotation" logic (not disliked, and potentially liked or neutral)
      let inRotation = all.filter(r => !r.disliked_by?.includes(activeMember || ''))
      
      // Proximity filter
      if (maxDistance !== null && location) {
        const limitKm = distanceUnit === 'us' ? maxDistance / 0.621371 : maxDistance
        inRotation = inRotation.filter(r => {
          if (!r.lat || !r.lng) return false
          const dist = calculateDistance(location.lat, location.lng, r.lat, r.lng)
          return dist <= limitKm
        })
      }

      setRestaurants(inRotation.slice(0, 12)) // Limit to 12 for good wheel visibility
      setLoading(false)
    }
    fetchRotation()
  }, [activeProfile, activeMember, location, maxDistance])

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || restaurants.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const radius = Math.min(centerX, centerY) - 10
    const sliceAngle = (2 * Math.PI) / restaurants.length

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    restaurants.forEach((r, i) => {
      const angle = rotationRef.current + i * sliceAngle
      
      // Draw slice
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, angle, angle + sliceAngle)
      ctx.fillStyle = COLORS[i % COLORS.length]
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.stroke()

      // Draw text
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(angle + sliceAngle / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = 'white'
      ctx.font = 'bold 14px Inter, sans-serif'
      ctx.fillText(r.name.length > 15 ? r.name.substring(0, 12) + '...' : r.name, radius - 20, 5)
      ctx.restore()
    })

    // Draw center peg
    ctx.beginPath()
    ctx.arc(centerX, centerY, 15, 0, 2 * Math.PI)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.shadowBlur = 10
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.stroke()
  }, [restaurants])

  const animate = useCallback(() => {
    if (velocityRef.current > 0.001) {
      rotationRef.current += velocityRef.current
      velocityRef.current *= 0.985 // Friction
      drawWheel()
      requestRef.current = requestAnimationFrame(animate)
    } else {
      setIsSpinning(false)
      // Calculate winner
      // The arrow is at the top (angle = -PI/2)
      const normalizedRotation = (rotationRef.current % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
      const sliceAngle = (2 * Math.PI) / restaurants.length
      
      // Angle 0 is at 3 o'clock. Arrow is at 12 o'clock (-PI/2)
      // So relative to rotationRef.current, the arrow points to:
      // (-PI/2 - rotationRef.current) normalized
      const pointerAngle = (1.5 * Math.PI - normalizedRotation) % (2 * Math.PI)
      const index = Math.floor(pointerAngle / sliceAngle)
      setWinner(restaurants[index] || null)
    }
  }, [drawWheel, restaurants])

  const handleSpin = () => {
    if (isSpinning || restaurants.length < 2) return
    setIsSpinning(true)
    setWinner(null)
    velocityRef.current = 0.3 + Math.random() * 0.4
    requestRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    drawWheel()
  }, [drawWheel])

  if (loading) {
    return <div className="page-container flex-center" style={{ paddingTop: '8rem' }}><div className="spinner" /></div>
  }

  return (
    <div className="page-container flex-col align-center gap-xl" style={{ overflow: 'hidden' }}>
      <div className="section-header align-center">
        <h2 className="section-title">Sunday Tradition</h2>
        <p className="section-subtitle">Let the wheel decide your next feast</p>
        
        <div className="flex-row align-center gap-xs mt-lg" style={{ background: 'var(--color-bg-secondary)', padding: '4px 12px', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: '1.2rem' }}>📍</span>
          <select 
            className="search-input" 
            style={{ width: 'auto', background: 'transparent', border: 'none', padding: '0', fontSize: 'var(--font-size-sm)' }}
            value={maxDistance || ''}
            onChange={(e) => setMaxDistance(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Any distance</option>
            <option value="1">{distanceUnit === 'us' ? '< 1 mi' : '< 1 km'}</option>
            <option value="3">{distanceUnit === 'us' ? '< 3 mi' : '< 3 km'}</option>
            <option value="5">{distanceUnit === 'us' ? '< 5 mi' : '< 5 km'}</option>
            <option value="10">{distanceUnit === 'us' ? '< 10 mi' : '< 10 km'}</option>
            <option value="25">{distanceUnit === 'us' ? '< 25 mi' : '< 25 km'}</option>
          </select>
        </div>
      </div>

      <div className="wheel-container" style={{ position: 'relative' }}>
        <div className="wheel-pointer" />
        <canvas 
          ref={canvasRef} 
          width={window.innerWidth > 400 ? 360 : 300} 
          height={window.innerWidth > 400 ? 360 : 300}
          style={{ borderRadius: '50%', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}
        />
      </div>

      <div className="flex-col align-center gap-lg">
        <button 
          className="btn btn--primary btn--lg" 
          onClick={handleSpin}
          disabled={isSpinning || restaurants.length < 2}
          style={{ padding: '16px 48px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xl)' }}
        >
          {isSpinning ? 'Good luck...' : 'SPIN!'}
        </button>

        {restaurants.length < 2 && (
          <p className="empty-text">Add at least 2 restaurants to the rotation to spin!</p>
        )}

        <button className="btn btn--ghost" onClick={() => navigate('/rotation')}>
          Back to list
        </button>
      </div>

      {winner && (
        <div className="winner-overlay">
          <div className="card winner-card flex-col align-center gap-lg">
            <div className="winner-card__confetti">🎉</div>
            <h2 className="winner-card__title">The winner is...</h2>
            <div className="winner-card__name">{winner.name}</div>
            {location && winner.lat && winner.lng && (
              <div className="tag tag--accent" style={{ marginTop: '-8px' }}>
                📍 {formatDistance(calculateDistance(location.lat, location.lng, winner.lat, winner.lng), distanceUnit)} away
              </div>
            )}
            <div className="flex-row gap-md">
              <button 
                className="btn btn--primary" 
                onClick={() => {
                  // Find last order for this restaurant to pre-fill?
                  // Or just go to dashboard and search
                  navigate('/')
                }}
              >
                Let's go!
              </button>
              <button className="btn btn--secondary" onClick={() => setWinner(null)}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
