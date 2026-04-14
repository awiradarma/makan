/**
 * Clean an address string to improve Nominatim geocoding success.
 * Removes unit/suite numbers and specific formatting that confuses the API.
 */
function cleanAddress(address: string): string {
  let cleaned = address;
  
  // Remove Suite, Apt, Unit, Ste, #, etc.
  // Expanded to handle full words and common abbreviations better
  // We use \b to match word boundaries and handle cases like "Suite 100" but not "Suitcase"
  cleaned = cleaned.replace(/\b(suite|ste|apt|atp|unit|room|floor|fl|level|building|bldg|#)\.?\s*[a-z0-9-]+/gi, '');
  
  // Remove Indonesian "No. 123", "Blok A", etc.
  cleaned = cleaned.replace(/\bno\.?\s*[0-9-]+/gi, '');
  cleaned = cleaned.replace(/\bblok\s*[a-z0-9-]+/gi, '');
  
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
  
  // Extract postal code if present (Indonesian postal codes are 5 digits)
  const postalMatch = originalAddress.match(/\b\d{5}\b/);
  const postalCode = postalMatch ? postalMatch[0] : null;

  const attemptGeocode = async (query: string, params: Record<string, string> = {}) => {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format', 'json')
      url.searchParams.set('q', query)
      url.searchParams.set('limit', '1')
      
      // Add extra params if provided
      Object.entries(params).forEach(([k, v]) => {
        url.searchParams.set(k, v)
      })

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MakanFamilyApp/1.0',
        },
      })
      
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

  // Attempt 1: Original address (raw)
  let result = await attemptGeocode(originalAddress);
  if (result) return result;

  // Attempt 2: Cleaned address
  result = await attemptGeocode(cleanedAddress);
  if (result) return result;

  // Attempt 3: If it looks like US (State abbreviations or Zip Code pattern)
  const looksUS = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|USA)\b/i.test(originalAddress);
  if (looksUS) {
    result = await attemptGeocode(cleanedAddress, { countrycodes: 'us' });
    if (result) return result;
  }

  // Attempt 4: If it looks Indonesian (City names or 5-digit zip with ID hint)
  const looksID = /jakarta|bali|denpasar|bandung|surabaya|yogyakarta|indonesia/i.test(originalAddress) || postalCode;
  if (looksID) {
    result = await attemptGeocode(cleanedAddress, { countrycodes: 'id' });
    if (result) return result;
  }

  // Attempt 5: Fallback - components only
  const segments = cleanedAddress.split(',').map(s => s.trim());
  if (segments.length >= 2) {
    // Try just first and last meaningful segment
    const minimalQuery = `${segments[0]}, ${segments[segments.length - 1]}`;
    result = await attemptGeocode(minimalQuery);
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
