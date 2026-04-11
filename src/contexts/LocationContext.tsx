import React, { createContext, useContext, useState, useEffect } from 'react'

interface Location {
  lat: number
  lng: number
}

interface LocationContextType {
  location: Location | null
  error: string | null
  loading: boolean
}

const LocationContext = createContext<LocationContextType | undefined>(undefined)

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Location | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
      setLoading(false)
      return
    }

    const handleSuccess = (position: GeolocationPosition) => {
      setLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      })
      setLoading(false)
      setError(null)
    }

    const handleError = (err: GeolocationPositionError) => {
      setError(err.message)
      setLoading(false)
    }

    // Initial fetch
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    })

    // Watch for changes
    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return (
    <LocationContext.Provider value={{ location, error, loading }}>
      {children}
    </LocationContext.Provider>
  )
}

export function useLocation() {
  const context = useContext(LocationContext)
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider')
  }
  return context
}
