/**
 * GPS utility functions for web AutoDoc module
 * Handles geolocation capture, reverse geocoding, and metadata assembly
 */

export interface GpsMetadata {
  lat: number
  lng: number
  city: string | null
  addressLine: string | null
  capturedAtIso: string
  timezone: string
  stage: 'pre-repair' | 'under-repair' | 'post-repair'
  panelName: string
}

/**
 * Request user's current geolocation with timeout and accuracy constraints
 * Follows Phase 2 specs: maxAge 10-20s, timeout 12-15s, high accuracy
 */
export async function getCurrentLocation(
  options?: Partial<PositionOptions>
): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported by this browser'))
      return
    }

    const timeoutId = setTimeout(() => {
      reject(new Error('GPS location timeout - could not acquire position in 15 seconds'))
    }, 15000)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId)
        const { latitude, longitude, accuracy } = position.coords
        resolve({
          lat: latitude,
          lng: longitude,
          accuracy,
        })
      },
      (error) => {
        clearTimeout(timeoutId)
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('Location permission denied'))
        } else if (error.code === error.TIMEOUT) {
          reject(new Error('GPS location timeout'))
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error('GPS position unavailable'))
        } else {
          reject(new Error(`GPS error: ${error.message}`))
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 20000,
        ...options,
      }
    )
  })
}

/**
 * Reverse geocode coordinates to get city name (best-effort)
 * Uses public geolocation APIs with graceful fallback
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    // Try using Nominatim (OpenStreetMap) for reverse geocoding
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as {
      address?: {
        city?: string
        town?: string
        village?: string
        county?: string
        state?: string
      }
    }

    // Extract city name from address hierarchy
    const address = data.address
    if (!address) return null

    return address.city || address.town || address.village || address.county || null
  } catch {
    // Graceful fallback - return null if reverse geocoding fails
    return null
  }
}

/**
 * Get device timezone string
 */
export function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Assemble GPS metadata object ready for stamping and DB persistence
 */
export async function assembleGpsMetadata(
  lat: number,
  lng: number,
  stage: 'pre-repair' | 'under-repair' | 'post-repair',
  panelName: string
): Promise<GpsMetadata> {
  // Validate coordinates
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error('Invalid latitude')
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('Invalid longitude')
  }

  const city = await reverseGeocode(lat, lng)
  const capturedAtIso = new Date().toISOString()
  const timezone = getTimezone()

  return {
    lat,
    lng,
    city,
    addressLine: null,
    capturedAtIso,
    timezone,
    stage,
    panelName,
  }
}

/**
 * Format GPS metadata for display on image stamp card
 * Returns multi-line text ready for canvas rendering
 */
export function formatGpsStampText(metadata: GpsMetadata): {
  line1: string // Location/City
  line2: string // Lat, Lng
  line3: string // Date/Time and Timezone
  line4: string // Stage and Panel
} {
  const cityDisplay = metadata.city || 'Unknown Location'

  const latDisplay = metadata.lat.toFixed(6)
  const lngDisplay = metadata.lng.toFixed(6)

  const capturedDate = new Date(metadata.capturedAtIso)
  const timeStr = capturedDate.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })

  const stageLabel = metadata.stage.replace('-', ' ')

  return {
    line1: cityDisplay,
    line2: `Lat: ${latDisplay}°, Lng: ${lngDisplay}°`,
    line3: `${timeStr} (${metadata.timezone})`,
    line4: `${stageLabel} • ${metadata.panelName}`,
  }
}
