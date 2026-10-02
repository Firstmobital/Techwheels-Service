import type { BodyshopFloorWorkTask } from './roles'

export type FloorWorkVehicleMeta = {
  reg: string | null
  customer: string | null
  model?: string | null
}

export function isSystemJobCardKey(value: string): boolean {
  const v = String(value ?? '').trim().toUpperCase()
  return v.startsWith('JC-') || v.startsWith('JC_') || v.includes('-MBTPLT-')
}

/** When Bodyshop Floor stores the plate as job_card_number on the assignment row. */
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
