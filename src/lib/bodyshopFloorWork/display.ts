import type { BodyshopFloorWorkTask } from './roles'

export type FloorWorkVehicleMeta = {
  reg: string | null
  customer: string | null
  model?: string | null
  /** System job card no. when assignment key is the plate. */
  systemJobCardNo?: string | null
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
  const sys = normalizeFloorWorkAssignmentKey(meta?.systemJobCardNo ?? '')
  if (sys) keys.add(sys)
  return [...keys]
}

/** Any role submitted today's IST log for this vehicle (admin list / filters). */
export function floorWorkVehicleHasTodayLogUpdate(
  assignmentKey: string,
  meta: FloorWorkVehicleMeta | undefined,
  logsByKey: Record<string, { job_card_number?: string | null; note_text?: string | null }>,
): boolean {
  const keys = new Set(floorWorkJobCardLookupKeys(assignmentKey, meta))
  for (const log of Object.values(logsByKey)) {
    if (!String(log.note_text ?? '').trim()) continue
    const logJc = normalizeFloorWorkAssignmentKey(log.job_card_number)
    if (keys.has(logJc)) return true
  }
  return false
}

export function floorWorkPhotoBelongsToVehicle(
  assignmentKey: string,
  meta: FloorWorkVehicleMeta | undefined,
  photo: { log_job_card_number?: string | null; reg_number?: string | null },
): boolean {
  const logJc = normalizeFloorWorkAssignmentKey(photo.log_job_card_number)
  const keys = floorWorkJobCardLookupKeys(assignmentKey, meta)
  if (logJc && keys.includes(logJc)) return true
  const photoReg = normalizeFloorWorkAssignmentKey(photo.reg_number)
  const vehicleReg = normalizeFloorWorkAssignmentKey(resolveFloorWorkRegistration(meta, assignmentKey))
  return Boolean(photoReg && vehicleReg && photoReg === vehicleReg)
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

/** Calendar date (YYYY-MM-DD) in IST for an ISO timestamp. */
export function istDateFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function bodyshopFloorWorkYesterdayIstDate(todayIst: string): string {
  const [y, m, d] = todayIst.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

export function istYearMonthFromIso(iso: string | null | undefined): string | null {
  const day = istDateFromIso(iso)
  if (!day) return null
  return day.slice(0, 7)
}

export function currentIstYearMonth(todayIst: string): string {
  return todayIst.slice(0, 7)
}

export function shiftIstYearMonth(yearMonth: string, monthDelta: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + monthDelta, 1))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  return `${yy}-${mm}`
}

export function formatFloorWorkMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  if (!y || !m) return yearMonth
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function buildFloorWorkMonthFilterOptions(todayIst: string, pastMonths = 5): Array<{ value: string; label: string }> {
  const cur = currentIstYearMonth(todayIst)
  const opts: Array<{ value: string; label: string }> = [{ value: 'all', label: 'All months' }]
  let ym = cur
  for (let i = 0; i <= pastMonths; i += 1) {
    opts.push({ value: ym, label: formatFloorWorkMonthLabel(ym) })
    ym = shiftIstYearMonth(ym, -1)
  }
  return opts
}

export type FloorWorkFloorDayBucket = 'today' | 'yesterday' | 'older' | 'unknown'

export function floorWorkFloorDayBucket(
  floorSinceIso: string | null | undefined,
  todayIst: string,
): FloorWorkFloorDayBucket {
  const day = istDateFromIso(floorSinceIso)
  if (!day) return 'unknown'
  if (day === todayIst) return 'today'
  const yesterday = bodyshopFloorWorkYesterdayIstDate(todayIst)
  if (day === yesterday) return 'yesterday'
  if (day < yesterday) return 'older'
  return 'unknown'
}

function floorDaySortRank(bucket: FloorWorkFloorDayBucket): number {
  switch (bucket) {
    case 'today':
      return 0
    case 'yesterday':
      return 1
    case 'older':
      return 2
    default:
      return 3
  }
}

/** Today / yesterday on floor first, then longer-waiting vehicles. */
export function sortJobCardsByFloorDayRecency(
  assignmentKeys: string[],
  vehicleByJc: Record<string, FloorWorkVehicleMeta>,
  todayIst: string,
): string[] {
  return [...assignmentKeys].sort((a, b) => {
    const ba = floorWorkFloorDayBucket(vehicleByJc[a]?.floorSinceAt, todayIst)
    const bb = floorWorkFloorDayBucket(vehicleByJc[b]?.floorSinceAt, todayIst)
    const ra = floorDaySortRank(ba)
    const rb = floorDaySortRank(bb)
    if (ra !== rb) return ra - rb

    const ta = floorSinceMs(vehicleByJc[a])
    const tb = floorSinceMs(vehicleByJc[b])
    const regA = sortKeyReg(vehicleByJc[a], a)
    const regB = sortKeyReg(vehicleByJc[b], b)

    if (ba === 'today' || ba === 'yesterday') {
      if (ta === null && tb === null) return regA.localeCompare(regB, 'en')
      if (ta === null) return 1
      if (tb === null) return -1
      return tb - ta
    }

    if (ta === null && tb === null) return regA.localeCompare(regB, 'en')
    if (ta === null) return 1
    if (tb === null) return -1
    if (ta !== tb) return ta - tb
    return regA.localeCompare(regB, 'en')
  })
}

export function floorWorkFloorDayLabel(bucket: FloorWorkFloorDayBucket): string {
  switch (bucket) {
    case 'today':
      return 'On floor today'
    case 'yesterday':
      return 'On floor yesterday'
    case 'older':
      return 'On floor longer'
    default:
      return 'Floor date unknown'
  }
}

function floorSinceMs(meta: FloorWorkVehicleMeta | undefined): number | null {
  const iso = String(meta?.floorSinceAt ?? '').trim()
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

/** Longest on floor first (earliest floorSinceAt). Missing time last. */
export function sortJobCardsByFloorSinceAsc(
  assignmentKeys: string[],
  vehicleByJc: Record<string, FloorWorkVehicleMeta>,
): string[] {
  return [...assignmentKeys].sort((a, b) => {
    const ta = floorSinceMs(vehicleByJc[a])
    const tb = floorSinceMs(vehicleByJc[b])
    if (ta === null && tb === null) {
      const ra = sortKeyReg(vehicleByJc[a], a)
      const rb = sortKeyReg(vehicleByJc[b], b)
      return ra.localeCompare(rb, 'en')
    }
    if (ta === null) return 1
    if (tb === null) return -1
    if (ta !== tb) return ta - tb
    const ra = sortKeyReg(vehicleByJc[a], a)
    const rb = sortKeyReg(vehicleByJc[b], b)
    return ra.localeCompare(rb, 'en')
  })
}

/** Fast list shell before repair-card lookups (sort + reg title). */
export function buildMinimalFloorWorkVehicleMeta(
  assignmentKeys: string[],
  assignmentCreatedAtByJc?: Record<string, string | null | undefined>,
): Record<string, FloorWorkVehicleMeta> {
  const map: Record<string, FloorWorkVehicleMeta> = {}
  for (const raw of assignmentKeys) {
    const jc = normalizeFloorWorkAssignmentKey(raw)
    if (!jc) continue
    map[jc] = {
      reg: inferRegistrationFromAssignmentKey(jc),
      customer: null,
      floorSinceAt: String(assignmentCreatedAtByJc?.[jc] ?? '').trim() || null,
    }
  }
  return map
}

export function edpVehicleOptionLabel(
  assignmentKey: string,
  meta: FloorWorkVehicleMeta | undefined,
): string {
  const reg = resolveFloorWorkRegistration(meta, assignmentKey)
  if (reg) return reg
  return 'Registration pending'
}
