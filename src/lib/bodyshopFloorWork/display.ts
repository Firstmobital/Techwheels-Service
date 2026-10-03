import type { BodyshopFloorWorkTask } from './roles'

export type FloorWorkVehicleMeta = {
  reg: string | null
  customer: string | null
  model?: string | null
  /** When this vehicle was first assigned on Bodyshop Floor (assignment row). */
  floorSinceAt?: string | null
  bodyshopFloor?: string | null
}

export function isSystemJobCardKey(value: string): boolean {
  const v = String(value ?? '').trim().toUpperCase()
  return v.startsWith('JC-') || v.startsWith('JC_') || v.includes('-MBTPLT-')
}

/** When Bodyshop Floor stores the plate as job_card_number on the assignment row. */
export function normalizeFloorWorkAssignmentKey(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase()
}

/** Job card keys that may appear on daily logs (plate-as-JC vs system JC). */
export function floorWorkJobCardLookupKeys(
  assignmentKey: string,
  meta: FloorWorkVehicleMeta | undefined,
): string[] {
  const keys = new Set<string>()
  const primary = normalizeFloorWorkAssignmentKey(assignmentKey)
  if (primary) keys.add(primary)
  const reg = normalizeFloorWorkAssignmentKey(meta?.reg ?? inferRegistrationFromAssignmentKey(assignmentKey))
  if (reg) keys.add(reg)
  return [...keys]
}

export function inferRegistrationFromAssignmentKey(jobCardNumber: string): string | null {
  const v = String(jobCardNumber ?? '').trim()
  if (!v || isSystemJobCardKey(v)) return null
  const compact = v.replace(/\s+/g, '').toUpperCase()
  if (compact.length >= 6 && compact.length <= 13 && /^[A-Z0-9]+$/.test(compact)) {
    return compact
  }
  return null
}

export function resolveFloorWorkRegistration(
  meta: FloorWorkVehicleMeta | undefined,
  assignmentKey: string,
): string | null {
  const fromMeta = String(meta?.reg ?? '').trim()
  if (fromMeta) return fromMeta.toUpperCase()
  return inferRegistrationFromAssignmentKey(assignmentKey)
}

/** Primary line — always registration, never internal JC. */
export function floorWorkVehicleTitle(meta: FloorWorkVehicleMeta | undefined, assignmentKey: string): string {
  return resolveFloorWorkRegistration(meta, assignmentKey) ?? 'Registration pending'
}

/** Secondary — customer / model only (no JC for floor staff). */
export function floorWorkVehicleSubtitle(meta: FloorWorkVehicleMeta | undefined, assignmentKey: string): string {
  const reg = resolveFloorWorkRegistration(meta, assignmentKey)
  const customer = String(meta?.customer ?? '').trim()
  const model = String(meta?.model ?? '').trim()
  const parts: string[] = []
  if (customer) parts.push(customer)
  if (model) parts.push(model)
  if (parts.length > 0) return parts.join(' · ')
  if (!reg) return 'Reg missing — update on Bodyshop Repair / Reception'
  return ''
}

/** Human-readable time on bodyshop floor (IST calendar days + hours). */
export function formatFloorStandingDuration(sinceIso: string | null | undefined, now = new Date()): string | null {
  if (!sinceIso) return null
  const start = new Date(sinceIso)
  if (Number.isNaN(start.getTime())) return null
  const ms = now.getTime() - start.getTime()
  if (ms < 0) return null
  const totalHours = Math.floor(ms / 3_600_000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ${hours}h on floor`
  if (hours > 0) return `${hours} hr on floor`
  const mins = Math.max(1, Math.floor(ms / 60_000))
  return `${mins} min on floor`
}

export function floorWorkStandingLine(meta: FloorWorkVehicleMeta | undefined): string | null {
  const standing = formatFloorStandingDuration(meta?.floorSinceAt)
  if (!standing) return null
  const floor = String(meta?.bodyshopFloor ?? '').trim()
  if (floor) return `${standing} · ${floor}`
  return standing
}

function sortKeyReg(meta: FloorWorkVehicleMeta | undefined, assignmentKey: string): string {
  return resolveFloorWorkRegistration(meta, assignmentKey) ?? `\uffff${assignmentKey}`
}

export function sortFloorWorkTasksByVehicle(
  tasks: BodyshopFloorWorkTask[],
  vehicleByJc: Record<string, FloorWorkVehicleMeta>,
): BodyshopFloorWorkTask[] {
  return [...tasks].sort((a, b) => {
    const ra = sortKeyReg(vehicleByJc[a.jobCardNumber], a.jobCardNumber)
    const rb = sortKeyReg(vehicleByJc[b.jobCardNumber], b.jobCardNumber)
    if (ra !== rb) return ra.localeCompare(rb, 'en')
    return a.jobCardNumber.localeCompare(b.jobCardNumber)
  })
}

export function sortJobCardsByVehicle(
  assignmentKeys: string[],
  vehicleByJc: Record<string, FloorWorkVehicleMeta>,
): string[] {
  return [...assignmentKeys].sort((a, b) => {
    const ra = sortKeyReg(vehicleByJc[a], a)
    const rb = sortKeyReg(vehicleByJc[b], b)
    if (ra !== rb) return ra.localeCompare(rb, 'en')
    return a.localeCompare(b)
  })
}

export function edpVehicleOptionLabel(
  assignmentKey: string,
  meta: FloorWorkVehicleMeta | undefined,
): string {
  const reg = resolveFloorWorkRegistration(meta, assignmentKey)
  if (reg) return reg
  return 'Registration pending'
}
