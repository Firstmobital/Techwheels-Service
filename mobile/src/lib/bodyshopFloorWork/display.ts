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

export function floorWorkVehicleTitle(meta: FloorWorkVehicleMeta | undefined, assignmentKey: string): string {
  return resolveFloorWorkRegistration(meta, assignmentKey) ?? 'Registration pending'
}

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
