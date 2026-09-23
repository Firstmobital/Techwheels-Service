export interface ParsedLocation {
  cleanAddress: string
  lat: number | null
  lng: number | null
  mapsUrl: string
  navUrl: string
  hasGps: boolean
  rawText: string
}

/**
 * Robust parser for customer pickup/drop addresses.
 * Extracts GPS coordinates from:
 * 1. [GPS: 26.912433, 75.787270 | https://maps.google.com/?q=26.912433,75.787270]
 * 2. [GPS: 26.912433, 75.787270]
 * 3. Maps URLs with query or destination (?q=lat,lng, @lat,lng, destination=lat,lng)
 * 4. geo:lat,lng
 * 5. Standalone lat, lng coordinates
 */
export function parseLocationDetails(rawAddress: string | null | undefined): ParsedLocation {
  const text = (rawAddress || '').trim()
  if (!text) {
    return {
      cleanAddress: 'Address not specified',
      lat: null,
      lng: null,
      mapsUrl: '',
      navUrl: '',
      hasGps: false,
      rawText: '',
    }
  }

  let lat: number | null = null
  let lng: number | null = null

  // 1. Check for [GPS: 26.912433, 75.787270] or [GPS: lat, lng | https://...]
  const gpsBracketMatch = text.match(/\[GPS:\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/i)
  if (gpsBracketMatch) {
    lat = parseFloat(gpsBracketMatch[1])
    lng = parseFloat(gpsBracketMatch[2])
  } else {
    // 2. Check for URL with coordinates like ?q=26.912433,75.787270 or @26.912433,75.787270 or destination=
    const urlCoordsMatch = text.match(/(?:[?&]q=|@|destination=)(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (urlCoordsMatch) {
      lat = parseFloat(urlCoordsMatch[1])
      lng = parseFloat(urlCoordsMatch[2])
    } else {
      // 3. Check for geo: URI
      const geoMatch = text.match(/geo:(-?\d+\.\d+),(-?\d+\.\d+)/)
      if (geoMatch) {
        lat = parseFloat(geoMatch[1])
        lng = parseFloat(geoMatch[2])
      } else {
        // 4. Check for standalone lat, lng pattern
        const rawCoordsMatch = text.match(/(-?\d{1,3}\.\d{4,8})[,\s]+(-?\d{1,3}\.\d{4,8})/)
        if (rawCoordsMatch) {
          const testLat = parseFloat(rawCoordsMatch[1])
          const testLng = parseFloat(rawCoordsMatch[2])
          if (testLat >= -90 && testLat <= 90 && testLng >= -180 && testLng <= 180) {
            lat = testLat
            lng = testLng
          }
        }
      }
    }
  }

  // Clean the human-readable text by stripping bracketed [GPS: ...] and URLs
  let cleanAddress = text.replace(/\[GPS:[^\]]+\]/gi, '').trim()
  cleanAddress = cleanAddress.replace(/https?:\/\/(?:maps\.google\.com|goo\.gl|maps\.app\.goo\.gl)\S*/gi, '').trim()
  cleanAddress = cleanAddress.replace(/^[,\s-]+|[,\s-]+$/g, '').trim()

  const hasGps = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)

  if (!cleanAddress) {
    cleanAddress = hasGps ? `GPS Pin: ${lat?.toFixed(6)}, ${lng?.toFixed(6)}` : text
  }

  const mapsUrl = hasGps
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : cleanAddress && cleanAddress !== 'Address not specified'
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddress)}`
      : ''

  const navUrl = hasGps
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : cleanAddress && cleanAddress !== 'Address not specified'
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanAddress)}`
      : ''

  return {
    cleanAddress,
    lat,
    lng,
    mapsUrl,
    navUrl,
    hasGps,
    rawText: text,
  }
}
