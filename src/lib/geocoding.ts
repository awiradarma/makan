/**
 * Clean an address string to improve Nominatim geocoding success.
 * Removes unit/suite numbers and specific formatting that confuses the API.
 */
function cleanAddress(address: string): string {
  let cleaned = address;
  
  // Remove Suite, Apt, Unit, Ste, #, etc.
  // Patterns like "Suite 100", "Ste 100", "Apt 5", "Unit B", "#101"
  cleaned = cleaned.replace(/(suite|ste|apt|atp|unit|room|floor|fl|#)\.?\s*[a-z0-9-]+/gi, '');
  
  // Remove Indonesian "No. 123", "Blok A", etc.
  cleaned = cleaned.replace(/no\.?\s*[0-9-]+/gi, '');
  cleaned = cleaned.replace(/blok\s*[a-z0-9-]+/gi, '');
  
  // Remove multiple spaces and trim
  cleaned = cleaned.replace(/\s\s+/g, ' ').trim();
  
  // Remove trailing/leading punctuation
  cleaned = cleaned.replace(/^[\s,]+|[\s,]+$/g, '');
  
  return cleaned;
}

/**
 * Geocoding service using OpenStreetMap Nominatim.
 * Note: Subject to usage policy (1 request/second).
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || !address.trim()) return null
  
  const originalAddress = address.trim();
  const cleanedAddress = cleanAddress(originalAddress);
  
  const attemptGeocode = async (query: string) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'MakanFamilyApp/1.0',
          },
        }
      )
      
      if (!response.ok) {
        console.warn(`Geocoding request failed for "${query}": ${response.statusText}`);
        return null;
      }

      const data = await response.json()
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        }
      }
    } catch (err) {
      console.error(`Geocoding error for "${query}":`, err)
    }
    return null;
  }

  // Attempt 1: Original address
  let result = await attemptGeocode(originalAddress);
  if (result) return result;

  // Attempt 2: Cleaned address (if different)
  if (cleanedAddress && cleanedAddress !== originalAddress) {
    result = await attemptGeocode(cleanedAddress);
    if (result) return result;
  }

  // Attempt 3: Street and City/State only (fallback for very specific addresses)
  const segments = originalAddress.split(',').map(s => s.trim());
  if (segments.length > 2) {
    // Try taking the first segment (usually street) and the last two (city/state/zip)
    const fallbackQuery = [segments[0], segments[segments.length - 1]].join(', ');
    result = await attemptGeocode(fallbackQuery);
    if (result) return result;
  }

  return null;
}

/**
 * Utility to wait for a specified duration.
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Calculate the distance between two points in kilometers using the Haversine formula.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function kmToMiles(km: number): number {
  return km * 0.621371
}

export function formatDistance(km: number, unit: 'metric' | 'us'): string {
  if (unit === 'us') {
    const mi = kmToMiles(km)
    return mi < 0.1 ? '< 0.1 mi' : `${mi.toFixed(1)} mi`
  }
  return km < 0.1 ? '< 0.1 km' : `${km.toFixed(1)} km`
}
