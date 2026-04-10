/**
 * Geocoding service using OpenStreetMap Nominatim.
 * Note: Subject to usage policy (1 request/second).
 */

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || !address.trim()) return null
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MakanFamilyApp/1.0',
        },
      }
    )
    
    if (!response.ok) {
      throw new Error(`Geocoding request failed: ${response.statusText}`)
    }

    const data = await response.json()
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      }
    }
  } catch (err) {
    console.error('Geocoding error:', err)
  }
  return null
}

/**
 * Utility to wait for a specified duration.
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
