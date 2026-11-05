import { normalizeBodyshopPhysicalFloor } from './bodyshopFloorInchargeScope'

/** Vehicles in floor ops: stage 11–14, on Floor 2/3, or open bodyshop assignment. */
export function isLiveOnFloorRepairCard(input: {
  current_stage?: number | null
  overall_status?: string | null
  bodyshop_floor?: string | null
  /** When true, incharge has started floor work (matches DB live list RPC). */
  hasOpenFloorAssignment?: boolean
}): boolean {
  const status = String(input.overall_status ?? 'active').trim().toLowerCase()
  if (status === 'closed' || status === 'cancelled' || status === 'delivered') return false
  if (input.hasOpenFloorAssignment) return true
  if (normalizeBodyshopPhysicalFloor(input.bodyshop_floor)) return true
  const stage = Number(input.current_stage)
  if (!Number.isFinite(stage)) return false
  return stage >= 11 && stage <= 14
}

export type BodyshopFloorVehicleListMode = 'live_on_floor' | 'intake_period'

export const BODYSHOP_FLOOR_LIVE_LIST_LABEL = 'On Floor (Live)'
export const BODYSHOP_FLOOR_TOTAL_KPI_LABEL = 'Total On Floor'
