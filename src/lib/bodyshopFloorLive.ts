/** Vehicles still in floor ops (Stage 11–14), regardless of intake month. */
export function isLiveOnFloorRepairCard(input: {
  current_stage?: number | null
  overall_status?: string | null
}): boolean {
  const status = String(input.overall_status ?? 'active').trim().toLowerCase()
  if (status === 'closed' || status === 'cancelled' || status === 'delivered') return false
  const stage = Number(input.current_stage)
  if (!Number.isFinite(stage)) return false
  return stage >= 11 && stage <= 14
}

export type BodyshopFloorVehicleListMode = 'live_on_floor' | 'intake_period'

export const BODYSHOP_FLOOR_LIVE_LIST_LABEL = 'On Floor (Live)'
export const BODYSHOP_FLOOR_TOTAL_KPI_LABEL = 'Total On Floor'
