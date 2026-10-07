/** Deep link to one vehicle on Floor Work (opens in new tab from list). */
export function floorWorkVehicleDetailPath(jobCardKey: string): string {
  const key = String(jobCardKey ?? '').trim()
  if (!key) return '/bodyshop-floor-work'
  return `/bodyshop-floor-work/v/${encodeURIComponent(key)}`
}

export function decodeFloorWorkVehicleRouteParam(raw: string | undefined): string {
  const key = String(raw ?? '').trim()
  if (!key) return ''
  try {
    return decodeURIComponent(key).trim().toUpperCase()
  } catch {
    return key.toUpperCase()
  }
}
