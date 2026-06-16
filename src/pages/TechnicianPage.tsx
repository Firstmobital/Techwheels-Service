import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import { listFloorInchargeEntries, listReceptionEntries, type ReceptionEntryRow } from '../lib/api'
import { sendTechnicianDailyEarningsTestEmail } from '../lib/api/email'
import * as XLSX from 'xlsx'

type TechnicianAssignmentRow = {
  id: number
  job_card_number: string
  technician_code: string
  technician_name: string
  assigned_at: string
  assigned_by: string | null
  bay_no: string | null
  work_status: string | null
  out_ts: string | null
  time_diff: string | null
  remark: string | null
  created_at?: string | null
  updated_at?: string | null
  reg_number?: string | null
  branch?: string | null
  fuel_type?: string | null
  gross_labour_amount?: number
  technician_income?: number
  assignment_split_count?: number
  invoice_date?: string | null
}

type SupportAssignmentRow = {
  job_card_number: string | null
  support_role: string | null
  employee_code: string | null
  employee_name: string | null
  assigned_at: string | null
  is_active: boolean | null
}

type RevenueRow = {
  job_card_number: string | null
  closed_date_time: string | null
  invoice_date: string | null
  final_labour_amount: number | string | null
}

type TechnicianSummaryCard = {
  code: string
  name: string
  rowCount: number
  dayCount: number
  totalIncome: number
}

type DayWiseCard = {
  dateKey: string
  label: string
  rowCount: number
  completedCount: number
  totalIncome: number
}

type VehicleOnDayCard = {
  regKey: string
  label: string
  rowCount: number
  completedCount: number
  totalIncome: number
}

type YesterdayRow = {
  technician_name: string
  technician_code: string
  job_card_number: string
  reg_number: string
  branch: string
  fuel_type: string
  bay_no: string
  gross_labour_amount: number
  technician_income: number
  assignment_split_count: number
  work_status: string
}

const QUERY_PAGE_SIZE = 1000
const IN_FILTER_BATCH_SIZE = 200
const DEFAULT_PV_SHARE_PERCENT = 20
const DEFAULT_EV_SHARE_PERCENT = 25
const UNKNOWN_FUEL_TYPE = 'Unknown'
const UNKNOWN_LOCATION = 'Unknown location'

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

function normalizeStatus(status: string | null | undefined): string {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (!normalized) return 'work_inprocess'
  if (normalized === 'work inprocess') return 'work_inprocess'
  return normalized
}

function statusLabel(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'hold') return 'Hold'
  return 'Work Inprocess'
}

function statusPill(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return 'g'
  if (normalized === 'hold') return 'w'
  return 'b'
}

function extractFuelFromBay(bayNo: string | null | undefined): 'PV' | 'EV' | null {
  const normalized = String(bayNo ?? '').trim().toUpperCase()
  if (normalized.startsWith('PV-')) return 'PV'
  if (normalized.startsWith('EV-')) return 'EV'
  return null
}

function getBranchLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || UNKNOWN_LOCATION
}

function getFuelTypeLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || UNKNOWN_FUEL_TYPE
}

function getAssignmentFuelTypeLabel(row: TechnicianAssignmentRow): string {
  const mappedFuelType = getFuelTypeLabel(row.fuel_type)
  if (mappedFuelType !== UNKNOWN_FUEL_TYPE) return mappedFuelType
  const fallbackFuel = extractFuelFromBay(row.bay_no)
  return fallbackFuel ?? UNKNOWN_FUEL_TYPE
}

function inferBranchFromAssignment(row: TechnicianAssignmentRow): string | null {
  const technicianCode = String(row.technician_code ?? '').trim().toUpperCase()
  if (technicianCode.includes('3000840') || technicianCode.includes('500A840')) return 'Sitapura'
  if (technicianCode.includes('3001440')) return 'Ajmer Road'

  const jc = String(row.job_card_number ?? '').trim().toUpperCase()
  if (jc.includes('-JP2-')) return 'Sitapura'
  if (jc.includes('-JP1-')) return 'Ajmer Road'

  return null
}

function parseRevenueAmount(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (value == null) return 0

  const raw = String(value).trim()
  if (!raw) return 0

  const isParenthesizedNegative = raw.startsWith('(') && raw.endsWith(')')
  const cleaned = raw
    .replace(/[₹,]/g, '')
    .replace(/\bRS\.?\b/gi, '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return 0
  return isParenthesizedNegative ? -parsed : parsed
}

function normalizeJobCardNumber(value: string | null | undefined): string {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return ''

  const normalizedDashes = raw.replace(/[–—−]/g, '-')
  const compact = normalizedDashes.replace(/\s+/g, '')

  // Some imported rows have repeated prefixes like JC-JC-...; collapse to canonical JC-...
  return compact.replace(/^JC-(JC-)+/, 'JC-')
}

function normalizeSupportRole(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

function isTechnicianSupportRole(value: string | null | undefined): boolean {
  return normalizeSupportRole(value) === 'TECHNICIAN'
}

function buildSupportTechnicianMap(rows: SupportAssignmentRow[]): Map<string, SupportAssignmentRow[]> {
  const supportByJc = new Map<string, SupportAssignmentRow[]>()

  rows.forEach((row) => {
    if (row.is_active === false) return
    if (!isTechnicianSupportRole(row.support_role)) return

    const jc = normalizeJobCardNumber(row.job_card_number)
    if (!jc) return

    const code = normalizeJobCardNumber(row.employee_code)
    if (!code) return

    const existing = supportByJc.get(jc) ?? []
    const alreadyExists = existing.some((item) => normalizeJobCardNumber(item.employee_code) === code)
    if (!alreadyExists) {
      existing.push(row)
      supportByJc.set(jc, existing)
    }
  })

  return supportByJc
}

function buildSplitCountByJobCard(
  primaryAssignments: TechnicianAssignmentRow[],
  supportByJc: Map<string, SupportAssignmentRow[]>,
): Map<string, number> {
  const splitByJc = new Map<string, number>()

  primaryAssignments.forEach((row) => {
    const jc = normalizeJobCardNumber(row.job_card_number)
    if (!jc) return

    const participants = new Set<string>()
    const primaryCode = normalizeJobCardNumber(row.technician_code)
    if (primaryCode) participants.add(primaryCode)

    const supportRows = supportByJc.get(jc) ?? []
    supportRows.forEach((supportRow) => {
      const supportCode = normalizeJobCardNumber(supportRow.employee_code)
      if (supportCode) participants.add(supportCode)
    })

    splitByJc.set(jc, Math.max(1, participants.size))
  })

  return splitByJc
}

function expandAssignmentsWithSupportTechnicians(
  primaryAssignments: TechnicianAssignmentRow[],
  supportByJc: Map<string, SupportAssignmentRow[]>,
): TechnicianAssignmentRow[] {
  const expanded: TechnicianAssignmentRow[] = []
  let syntheticId = -1

  primaryAssignments.forEach((row) => {
    expanded.push(row)

    const jc = normalizeJobCardNumber(row.job_card_number)
    if (!jc) return

    const supportRows = supportByJc.get(jc) ?? []
    if (supportRows.length === 0) return

    const seenCodes = new Set<string>()
    const primaryCode = normalizeJobCardNumber(row.technician_code)
    if (primaryCode) seenCodes.add(primaryCode)

    supportRows.forEach((supportRow) => {
      const supportCode = normalizeJobCardNumber(supportRow.employee_code)
      if (!supportCode || seenCodes.has(supportCode)) return
      seenCodes.add(supportCode)

      expanded.push({
        ...row,
        id: syntheticId,
        technician_code: supportCode,
        technician_name: String(supportRow.employee_name ?? '').trim() || supportCode,
        assigned_at: supportRow.assigned_at ?? row.assigned_at,
      })

      syntheticId -= 1
    })
  })

  return expanded
}

function toIstDateKey(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed)
}

function normalizeInvoiceDate(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  return raw.slice(0, 10)
}

function getAssignmentRecencyMs(row: TechnicianAssignmentRow): number {
  const source = row.updated_at ?? row.out_ts ?? row.assigned_at ?? row.created_at ?? null
  const parsed = source ? new Date(source).getTime() : Number.NaN
  if (Number.isFinite(parsed)) return parsed
  return Number(row.id ?? 0)
}

function dedupeLatestAssignments(rows: TechnicianAssignmentRow[]): TechnicianAssignmentRow[] {
  const latestByJc = new Map<string, TechnicianAssignmentRow>()

  rows.forEach((row) => {
    const jc = normalizeJobCardNumber(row.job_card_number)
    if (!jc) return

    const existing = latestByJc.get(jc)
    if (!existing) {
      latestByJc.set(jc, row)
      return
    }

    const existingTs = getAssignmentRecencyMs(existing)
    const candidateTs = getAssignmentRecencyMs(row)
    if (candidateTs > existingTs || (candidateTs === existingTs && row.id > existing.id)) {
      latestByJc.set(jc, row)
    }
  })

  return Array.from(latestByJc.values())
}

function getIncomeDateKey(assignment: TechnicianAssignmentRow, revenue: RevenueRow): string | null {
  // Prefer invoice_date from both sources (authoritative). Falls back only for backward compatibility.
  const source =
    revenue.invoice_date ??
    assignment.invoice_date ??
    revenue.closed_date_time

  if (!source) return null

  const parsedDate = new Date(source)
  if (Number.isNaN(parsedDate.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsedDate)
}

function normalizeSharePercentInput(value: string, fallback: number): number {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return fallback
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(0, parsed))
}

function getSplitLabel(splitCount: number | null | undefined): string {
  const parsed = Number(splitCount ?? 1)
  const safeCount = Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : 1
  return `Split: 1/${safeCount}`
}

function getAssignmentDateKey(row: TechnicianAssignmentRow): string | null {
  // Use ONLY invoice_date from job_card_closed_data (no fallback to assigned_at or out_ts)
  const dateSource = row.invoice_date
  if (!dateSource) return null

  const parsed = new Date(dateSource)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed)
}

function calculateTechnicianIncome(
  grossLabourAmount: number,
  bayNo: string | null | undefined,
  pvSharePercent: number,
  evSharePercent: number,
  splitCount = 1,
): number {
  if (!Number.isFinite(grossLabourAmount) || grossLabourAmount <= 0) return 0
  const fuel = extractFuelFromBay(bayNo)
  const sharePercent = fuel === 'EV' ? evSharePercent : pvSharePercent
  const netBeforeShare = grossLabourAmount / 1.18
  const income = netBeforeShare * (sharePercent / 100)
  const safeSplitCount = Number.isFinite(splitCount) && splitCount > 0 ? splitCount : 1
  return income / safeSplitCount
}

// ── Yesterday Report Generator ────────────────────────────────────────────────
async function fetchYesterdayReportData(pvPct: number, evPct: number): Promise<{ rows: YesterdayRow[]; date: string }> {
  // Yesterday in IST
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)
  const yest = new Date(istNow)
  yest.setUTCDate(yest.getUTCDate() - 1)
  const dateStr = yest.toISOString().slice(0, 10)
  const fromTs = dateStr + 'T00:00:00+05:30'
  const toTs = dateStr + 'T23:59:59+05:30'

  // Fetch assignments for yesterday
  const assignRes = await supabase
    .from('technician_assignments')
    .select('*')
    .gte('assigned_at', fromTs)
    .lte('assigned_at', toTs)
    .order('assigned_at', { ascending: true })

  if (assignRes.error) throw new Error(assignRes.error.message)
  const assignmentRows = dedupeLatestAssignments((assignRes.data ?? []) as TechnicianAssignmentRow[])

  const completedJcs = Array.from(new Set(
    assignmentRows
      .filter(r => normalizeStatus(r.work_status) === 'completed')
      .map(r => normalizeJobCardNumber(r.job_card_number))
      .filter(Boolean)
  ))

  const supportRows: SupportAssignmentRow[] = []
  for (let from = 0; from < completedJcs.length; from += QUERY_PAGE_SIZE) {
    const batch = completedJcs.slice(from, from + QUERY_PAGE_SIZE)
    if (batch.length === 0) continue

    const supportRes = await supabase
      .from('job_card_support_assignments')
      .select('job_card_number, support_role, employee_code, employee_name, assigned_at, is_active')
      .in('job_card_number', batch)
      .eq('is_active', true)

    if (!supportRes.error && supportRes.data) {
      supportRows.push(...(supportRes.data as SupportAssignmentRow[]))
    }
  }

  const supportByJc = buildSupportTechnicianMap(supportRows)
  const splitCountByJc = buildSplitCountByJobCard(assignmentRows, supportByJc)
  const expandedAssignmentRows = expandAssignmentsWithSupportTechnicians(assignmentRows, supportByJc)

  // Fetch revenue for completed JCs
  const revenueMap = new Map<string, number>()
  if (completedJcs.length > 0) {
    const revRes = await supabase
      .from('job_card_closed_data')
      .select('job_card_number, final_labour_amount')
      .in('job_card_number', completedJcs)
    if (!revRes.error && revRes.data) {
      revRes.data.forEach((r: any) => {
        const key = normalizeJobCardNumber(r.job_card_number)
        const amt = parseRevenueAmount(r.final_labour_amount)
        if (amt > 0 && !revenueMap.has(key)) revenueMap.set(key, amt)
      })
    }
  }

  // Fetch reg numbers from reception entries
  const regMap = new Map<string, string>()
  const branchMap = new Map<string, string>()
  const fuelMap = new Map<string, string>()
  const allJcs = new Set(assignmentRows.map(r => normalizeJobCardNumber(r.job_card_number)).filter(Boolean))

  const floorRes = await listFloorInchargeEntries()
  if (!floorRes.error && floorRes.data) {
    floorRes.data.forEach((r: any) => {
      const key = String(r.jc_number ?? '').trim().toUpperCase()
      if (!allJcs.has(key)) return
      if (r.reg_number && !regMap.has(key)) regMap.set(key, String(r.reg_number).trim())
      if (r.branch && !branchMap.has(key)) branchMap.set(key, String(r.branch).trim())
      if (r.fuel_type && !fuelMap.has(key)) fuelMap.set(key, String(r.fuel_type).trim().toUpperCase())
    })
  }

  // Build rows
  const rows: YesterdayRow[] = expandedAssignmentRows
    .filter(r => normalizeStatus(r.work_status) === 'completed')
    .map(r => {
      const jc = normalizeJobCardNumber(r.job_card_number)
      const gross = revenueMap.get(jc) ?? 0
      const splitCount = splitCountByJc.get(jc) ?? 1
      const income = calculateTechnicianIncome(gross, r.bay_no, pvPct, evPct, splitCount)
      return {
        technician_name: String(r.technician_name ?? '').trim() || r.technician_code,
        technician_code: String(r.technician_code ?? '').trim(),
        job_card_number: jc,
        reg_number: regMap.get(jc) ?? '—',
        branch: branchMap.get(jc) ?? inferBranchFromAssignment(r) ?? '—',
        fuel_type: fuelMap.get(jc) ?? (extractFuelFromBay(r.bay_no) ?? '—'),
        bay_no: String(r.bay_no ?? '').trim(),
        gross_labour_amount: gross,
        technician_income: income,
        assignment_split_count: splitCount,
        work_status: String(r.work_status ?? '').trim(),
      }
    })
    .sort((a, b) => a.technician_name.localeCompare(b.technician_name) || b.technician_income - a.technician_income)

  return { rows, date: dateStr }
}

function buildWAText(rows: YesterdayRow[], date: string, pvPct: number, evPct: number): string {
  if (rows.length === 0) return `📊 *Technician Report — ${date}*\n\nNo completed jobs yesterday.`

  // Group by technician
  const byTech = new Map<string, YesterdayRow[]>()
  rows.forEach(r => {
    const key = r.technician_name
    if (!byTech.has(key)) byTech.set(key, [])
    byTech.get(key)!.push(r)
  })

  const totalLabour = rows.reduce((s, r) => s + r.gross_labour_amount, 0)
  const totalPaid = rows.reduce((s, r) => s + r.technician_income, 0)

  let msg = `📊 *Technician Report — ${date}*\n`
  msg += `⚙️ PV: ${pvPct}% | EV: ${evPct}%\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`

  byTech.forEach((techRows, name) => {
    const techLabour = techRows.reduce((s, r) => s + r.gross_labour_amount, 0)
    const techPaid = techRows.reduce((s, r) => s + r.technician_income, 0)
    msg += `🔧 *${name}*\n`
    techRows.forEach(r => {
      msg += `  🚗 ${r.reg_number}  Labour: ₹${Math.round(r.gross_labour_amount).toLocaleString('en-IN')}  Paid: *₹${Math.round(r.technician_income).toLocaleString('en-IN')}*\n`
    })
    msg += `  Total Labour: ₹${Math.round(techLabour).toLocaleString('en-IN')} | *Paid: ₹${Math.round(techPaid).toLocaleString('en-IN')}*\n\n`
  })

  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `🏆 Total Labour: ₹${Math.round(totalLabour).toLocaleString('en-IN')}\n`
  msg += `💰 Total Paid: *₹${Math.round(totalPaid).toLocaleString('en-IN')}*`

  return msg
}

export default function TechnicianPage() {
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [error, setError] = useState<string | null>(null)
  const [reportEmailState, setReportEmailState] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [sendingReportEmail, setSendingReportEmail] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [yesterdayReport, setYesterdayReport] = useState<{ rows: YesterdayRow[]; date: string; waText: string } | null>(null)
  const [showPivotReport, setShowPivotReport] = useState(false)
  const [assignments, setAssignments] = useState<TechnicianAssignmentRow[]>([])
  const [canEditSharePercent, setCanEditSharePercent] = useState(false)
  const [pvSharePercent, setPvSharePercent] = useState(DEFAULT_PV_SHARE_PERCENT)
  const [evSharePercent, setEvSharePercent] = useState(DEFAULT_EV_SHARE_PERCENT)
  const [draftPvSharePercent, setDraftPvSharePercent] = useState(String(DEFAULT_PV_SHARE_PERCENT))
  const [draftEvSharePercent, setDraftEvSharePercent] = useState(String(DEFAULT_EV_SHARE_PERCENT))
  const [selectedTechnicianCode, setSelectedTechnicianCode] = useState('')
  const [selectedDayKey, setSelectedDayKey] = useState('')
  const [selectedVehicleOnDayKey, setSelectedVehicleOnDayKey] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [fuelTypeFilter, setFuelTypeFilter] = useState('all')

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const authRes = await supabase.auth.getUser()
      const userId = authRes.data.user?.id
      if (!userId) {
        setAssignments([])
        setCanEditSharePercent(false)
        setSelectedTechnicianCode('')
        setSelectedDayKey('')
        setSelectedVehicleOnDayKey('')
        setLoading(false)
        return
      }

      const profileRes = await supabase
        .from('users')
        .select('role, is_active')
        .eq('id', userId)
        .maybeSingle()

      const role = String((profileRes.data as { role?: string | null } | null)?.role ?? '').trim().toLowerCase()
      const isActive = (profileRes.data as { is_active?: boolean | null } | null)?.is_active
      const roleCanEdit = role === 'super_admin' || role === 'super admin' || role === 'admin'
      setCanEditSharePercent(roleCanEdit && isActive !== false)

      // ── Load earnings percentages from DB ───────────────────────────────────
      const settingsRes = await supabase
        .from('technician_earnings_settings')
        .select('key, value')
      if (!settingsRes.error && settingsRes.data) {
        for (const row of settingsRes.data as { key: string; value: string }[]) {
          const parsed = parseFloat(row.value)
          if (!Number.isFinite(parsed) || parsed <= 0) continue
          if (row.key === 'pv_share_percent') {
            setPvSharePercent(parsed)
            setDraftPvSharePercent(String(parsed))
          }
          if (row.key === 'ev_share_percent') {
            setEvSharePercent(parsed)
            setDraftEvSharePercent(String(parsed))
          }
        }
      }
      // ───────────────────────────────────────────────────────────────────────

      // Fetch all technician assignments for the date range
      const assignmentRowsRaw: TechnicianAssignmentRow[] = []
      let from = 0

      while (true) {
        // Fetch technician assignments (no join - will map invoice_date separately)
        let assignQuery = supabase
          .from('technician_assignments')
          .select('*')
          .order('assigned_at', { ascending: false })
          .range(from, from + QUERY_PAGE_SIZE - 1)

        const assignRes = await assignQuery

        if (assignRes.error) {
          setError(assignRes.error.message)
          setAssignments([])
          setLoading(false)
          return
        }

        const batch = (assignRes.data ?? []) as TechnicianAssignmentRow[]
        assignmentRowsRaw.push(...batch)

        if (batch.length < QUERY_PAGE_SIZE) {
          break
        }

        from += QUERY_PAGE_SIZE
      }

      // Build map of invoice_date by job_card_number
      const jcNumbers = Array.from(new Set(
        assignmentRowsRaw
          .map((row) => normalizeJobCardNumber(row.job_card_number))
          .filter(Boolean),
      ))

      const invoiceDateMap = new Map<string, string | null>()
      if (jcNumbers.length > 0) {
        for (let i = 0; i < jcNumbers.length; i += IN_FILTER_BATCH_SIZE) {
          const jcBatch = jcNumbers.slice(i, i + IN_FILTER_BATCH_SIZE)
          if (jcBatch.length === 0) continue

          const invoiceRes = await supabase
            .from('job_card_closed_data')
            .select('job_card_number, invoice_date')
            .in('job_card_number', jcBatch)

          if (invoiceRes.error) {
            setError(invoiceRes.error.message)
            setAssignments([])
            setLoading(false)
            return
          }

          ;(invoiceRes.data ?? []).forEach((row: any) => {
            const key = normalizeJobCardNumber((row as { job_card_number?: string | null }).job_card_number)
            if (!key) return
            invoiceDateMap.set(key, row.invoice_date ?? null)
          })
        }
      }

      // Map invoice_date to assignments and filter by date range
      const primaryAssignmentRows = dedupeLatestAssignments(
        assignmentRowsRaw
          .map((row) => ({
            ...row,
            invoice_date: invoiceDateMap.get(normalizeJobCardNumber(row.job_card_number)) ?? null,
          }))
          .filter((row) => {
            if (!row.invoice_date) return false
            if (row.invoice_date < dateRange.from) return false
            if (row.invoice_date > dateRange.to) return false
            return true
          }),
      )

      const assignmentJcNumbers = Array.from(new Set(
        primaryAssignmentRows
          .map((row) => normalizeJobCardNumber(row.job_card_number))
          .filter(Boolean),
      ))

      const supportRows: SupportAssignmentRow[] = []
      for (let i = 0; i < assignmentJcNumbers.length; i += IN_FILTER_BATCH_SIZE) {
        const jcBatch = assignmentJcNumbers.slice(i, i + IN_FILTER_BATCH_SIZE)
        if (jcBatch.length === 0) continue

        const supportRes = await supabase
          .from('job_card_support_assignments')
          .select('job_card_number, support_role, employee_code, employee_name, assigned_at, is_active')
          .in('job_card_number', jcBatch)
          .eq('is_active', true)

        if (!supportRes.error && supportRes.data) {
          supportRows.push(...(supportRes.data as SupportAssignmentRow[]))
        }
      }

      const supportByJc = buildSupportTechnicianMap(supportRows)
      const splitCountByJc = buildSplitCountByJobCard(primaryAssignmentRows, supportByJc)
      const assignmentRows = expandAssignmentsWithSupportTechnicians(primaryAssignmentRows, supportByJc)

      // Get completed assignments to query revenue data
      const completedMap = new Map<string, TechnicianAssignmentRow>()
      primaryAssignmentRows
        .filter((row) => normalizeStatus(row.work_status) === 'completed')
        .forEach((row) => {
          const jc = normalizeJobCardNumber(row.job_card_number)
          if (!jc) return

          const existing = completedMap.get(jc)
          if (!existing) {
            completedMap.set(jc, row)
            return
          }

          const existingTs = new Date(existing.out_ts ?? existing.assigned_at ?? 0).getTime()
          const candidateTs = new Date(row.out_ts ?? row.assigned_at ?? 0).getTime()
          if (candidateTs > existingTs) {
            completedMap.set(jc, row)
          }
        })

      const completed = Array.from(completedMap.values())
      const completedJcNumbers = Array.from(new Set(
        completed
          .map((row) => normalizeJobCardNumber(row.job_card_number))
          .filter(Boolean),
      ))

      // Reuse Floor Incharge API enrichment path to keep branch/fuel logic consistent.
      let regNumberMap = new Map<string, string>()
      let branchMap = new Map<string, string>()
      let fuelTypeMap = new Map<string, string>()
      let revenueMap = new Map<string, RevenueRow>()

      if (assignmentJcNumbers.length > 0) {
        const assignmentJcSet = new Set(assignmentJcNumbers)
        const floorEntriesRes = await listFloorInchargeEntries()
        if (!floorEntriesRes.error && floorEntriesRes.data) {
          ;(floorEntriesRes.data ?? []).forEach((row) => {
            const key = String(row.jc_number ?? '').trim().toUpperCase()
            if (!key) return
            if (!assignmentJcSet.has(key)) return

            const regNum = String((row as ReceptionEntryRow).reg_number ?? '').trim()
            if (regNum && !regNumberMap.has(key)) {
              regNumberMap.set(key, regNum)
            }

            const branch = String((row as ReceptionEntryRow).branch ?? '').trim()
            if (branch && !branchMap.has(key)) {
              branchMap.set(key, branch)
            }

            const fuelType = String((row as ReceptionEntryRow).fuel_type ?? '').trim().toUpperCase()
            if (fuelType && !fuelTypeMap.has(key)) {
              fuelTypeMap.set(key, fuelType)
            }
          })
        }

        // Fallback for technician JC rows outside Floor Incharge allowed service types.
        const unresolvedJcNumbers = assignmentJcNumbers.filter((jc) => !branchMap.has(jc) || !regNumberMap.has(jc) || !fuelTypeMap.has(jc))
        if (unresolvedJcNumbers.length > 0) {
          const unresolvedSet = new Set(unresolvedJcNumbers)
          const receptionEntriesRes = await listReceptionEntries()
          if (!receptionEntriesRes.error && receptionEntriesRes.data) {
            ;(receptionEntriesRes.data ?? []).forEach((row) => {
              const key = String(row.jc_number ?? '').trim().toUpperCase()
              if (!key) return
              if (!unresolvedSet.has(key)) return

              const regNum = String((row as ReceptionEntryRow).reg_number ?? '').trim()
              if (regNum && !regNumberMap.has(key)) {
                regNumberMap.set(key, regNum)
              }

              const branch = String((row as ReceptionEntryRow).branch ?? '').trim()
              if (branch && !branchMap.has(key)) {
                branchMap.set(key, branch)
              }

              const fuelType = String((row as ReceptionEntryRow).fuel_type ?? '').trim().toUpperCase()
              if (fuelType && !fuelTypeMap.has(key)) {
                fuelTypeMap.set(key, fuelType)
              }
            })
          }
        }
      }

      if (completedJcNumbers.length > 0) {
        for (let i = 0; i < completedJcNumbers.length; i += IN_FILTER_BATCH_SIZE) {
          const jcBatch = completedJcNumbers.slice(i, i + IN_FILTER_BATCH_SIZE)
          if (jcBatch.length === 0) continue

          const revenueRes = await supabase
            .from('job_card_closed_data')
            .select('job_card_number, closed_date_time, invoice_date, final_labour_amount')
            .in('job_card_number', jcBatch)

          if (revenueRes.error) {
            setError(revenueRes.error.message)
            setLoading(false)
            return
          }

          ;(revenueRes.data ?? []).forEach((row: any) => {
            const key = normalizeJobCardNumber((row as { job_card_number?: string | null }).job_card_number)
            if (!key) return

            const existing = revenueMap.get(key)
            const candidate = row as RevenueRow
            if (!existing) {
              revenueMap.set(key, candidate)
            } else {
              const existingTs = new Date(existing.closed_date_time ?? existing.invoice_date ?? 0).getTime()
              const candidateTs = new Date(candidate.closed_date_time ?? candidate.invoice_date ?? 0).getTime()
              if (candidateTs > existingTs) {
                revenueMap.set(key, candidate)
              }
            }
          })
        }
      }

      // Add reg_number to assignment rows
      const grossByJc = new Map<string, number>()

      completed.forEach((assignment) => {
        const jc = normalizeJobCardNumber(assignment.job_card_number)
        if (!jc) return
        const revenue = revenueMap.get(jc)
        if (!revenue) return

        const gross = parseRevenueAmount(revenue.final_labour_amount)
        if (!Number.isFinite(gross) || gross <= 0) return

        const dateKey = getIncomeDateKey(assignment, revenue)
        if (!dateKey) return

        grossByJc.set(jc, gross)
      })

      const enrichedAssignmentRows = assignmentRows.map((row) => {
        const jc = normalizeJobCardNumber(row.job_card_number)
        const inferredBranch = inferBranchFromAssignment(row)
        return {
          ...row,
          reg_number: regNumberMap.get(jc) ?? null,
          branch: branchMap.get(jc) ?? inferredBranch,
          fuel_type: fuelTypeMap.get(jc) ?? null,
          gross_labour_amount: grossByJc.get(jc) ?? 0,
          assignment_split_count: splitCountByJc.get(jc) ?? 1,
        }
      })
      setAssignments(enrichedAssignmentRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load technician data')
      setAssignments([])
      setCanEditSharePercent(false)
      setSelectedTechnicianCode('')
      setSelectedDayKey('')
      setSelectedVehicleOnDayKey('')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateYesterdayReport() {
    setGeneratingReport(true)
    try {
      const { rows, date } = await fetchYesterdayReportData(pvSharePercent, evSharePercent)
      const waText = buildWAText(rows, date, pvSharePercent, evSharePercent)
      setYesterdayReport({ rows, date, waText })
    } catch (e: any) {
      alert('Failed to generate report: ' + (e.message ?? 'Unknown error'))
    } finally {
      setGeneratingReport(false)
    }
  }

  async function handleExportIssues() {
    if (!fromDate || !toDate) {
      alert('Select both start and end dates')
      return
    }

    try {
      // Primary filter: Fetch job_card_closed_data where invoice_date is in the range
      const jccRes = await supabase
        .from('job_card_closed_data')
        .select('job_card_number, sr_type, branch, invoice_date, closed_date_time, vehicle_registration_number, final_labour_amount')
        .gte('invoice_date', fromDate)
        .lte('invoice_date', toDate)

      if (jccRes.error) {
        alert('Failed to fetch closed data: ' + jccRes.error.message)
        return
      }

      const excludedSrTypes = new Set(['ACCIDENT', 'PDI'])
      const jccRecords = (jccRes.data ?? []).filter((row: any) => {
        const srType = String(row?.sr_type ?? '').trim().toUpperCase()
        return !excludedSrTypes.has(srType)
      })
      if (jccRecords.length === 0) {
        alert('No records found after excluding Accident and PDI in the selected invoice date range.')
        return
      }

      // Get unique job card numbers from source records for a reliable DB lookup.
      const sourceJcNumbers = Array.from(new Set(
        jccRecords
          .map((row: any) => String(row.job_card_number ?? '').trim())
          .filter(Boolean),
      ))

      // Fetch assignment timestamps and status for those job cards in batches (Supabase .in() limit ~100 items)
      const assignmentsByJc = new Map<string, TechnicianAssignmentRow[]>()
      const BATCH_SIZE = 100
      for (let i = 0; i < sourceJcNumbers.length; i += BATCH_SIZE) {
        const batch = sourceJcNumbers.slice(i, i + BATCH_SIZE)
        const taRes = await supabase
          .from('technician_assignments')
          .select('*')
          .in('job_card_number', batch)

        if (taRes.error) {
          alert('Failed to fetch assignment data: ' + taRes.error.message)
          return
        }

        ;(taRes.data ?? []).forEach((row: any) => {
          const key = normalizeJobCardNumber(row.job_card_number)
          if (!key) return
          const candidate = row as TechnicianAssignmentRow
          const list = assignmentsByJc.get(key) ?? []
          list.push(candidate)
          assignmentsByJc.set(key, list)
        })
      }

      // Sort latest-first so exported rows are stable and easy to review.
      assignmentsByJc.forEach((list, key) => {
        list.sort((a, b) => {
          const aTs = getAssignmentRecencyMs(a)
          const bTs = getAssignmentRecencyMs(b)
          if (bTs !== aTs) return bTs - aTs
          return Number(b.id ?? 0) - Number(a.id ?? 0)
        })
        assignmentsByJc.set(key, list)
      })

      // Build SA name map (Service Advisor page source) by JC number.
      const saNameMap = new Map<string, string>()
      const receptionRes = await listReceptionEntries()
      if (!receptionRes.error && receptionRes.data) {
        const sourceJcSet = new Set(sourceJcNumbers.map((jc) => normalizeJobCardNumber(jc)))
        ;(receptionRes.data ?? []).forEach((row) => {
          const key = normalizeJobCardNumber(row.jc_number)
          if (!key || !sourceJcSet.has(key)) return

          const saName = String(row.sa_display_name ?? row.sa_name ?? '').trim()
          if (saName && !saNameMap.has(key)) {
            saNameMap.set(key, saName)
          }
        })
      }

      // Combine data and include all assignment statuses; export only non-match issues.
      const issues = jccRecords
        .flatMap((row: any) => {
          const jc = normalizeJobCardNumber(row.job_card_number)
          const assignments = assignmentsByJc.get(jc) ?? []

          if (assignments.length === 0) {
            return [{
              job_card_number: row.job_card_number ?? '',
              service_type: row.sr_type ?? '',
              branch: row.branch ?? '',
              out_ts: null,
              invoice_date: row.invoice_date ?? '',
              closed_date_time: row.closed_date_time ?? '',
              sa_name: saNameMap.get(jc) ?? '',
              technician_name: '',
              status: 'Unassigned',
              match_status: 'NO ASSIGNMENT',
              vehicle_registration_number: row.vehicle_registration_number ?? '',
              labour: parseRevenueAmount(row.final_labour_amount) / 1.18,
            }]
          }

          return assignments.map((assignment) => {
            const outTs = assignment.out_ts ?? null
            const workStatus = assignment.work_status ?? null

            const invDate = normalizeInvoiceDate(row.invoice_date ?? '')
            const outDate = toIstDateKey(outTs)

            let matchStatus = '❌ MISMATCH'
            if (!invDate) {
              matchStatus = 'NO INVOICE DATE'
            } else if (!outTs) {
              matchStatus = 'NO OUT TS'
            } else if (outDate && outDate === invDate) {
              matchStatus = 'MATCH'
            }

            return {
              job_card_number: row.job_card_number ?? '',
              service_type: row.sr_type ?? '',
              branch: row.branch ?? '',
              out_ts: outTs,
              invoice_date: row.invoice_date ?? '',
              closed_date_time: row.closed_date_time ?? '',
              sa_name: saNameMap.get(jc) ?? '',
              technician_name: String(assignment.technician_name ?? '').trim(),
              status: workStatus ? statusLabel(workStatus) : 'Unassigned',
              match_status: matchStatus,
              vehicle_registration_number: row.vehicle_registration_number ?? '',
              labour: parseRevenueAmount(row.final_labour_amount) / 1.18,
            }
          })
        })
        .filter((row: any) => row.match_status !== 'MATCH')

      if (issues.length === 0) {
        alert('No issues found. All assignment rows match invoice dates in the selected range.')
        return
      }

      // Export to Excel
      const sheetData = [
        ['Job Card Number', 'Service Type', 'Reg No', 'Branch', 'SA Name', 'Technician Name', 'Status', 'Out TS', 'Invoice Date', 'Closed Date Time', 'Labour', 'Match Status'],
        ...issues.map((r: any) => [
          r.job_card_number,
          r.service_type,
          r.vehicle_registration_number,
          r.branch,
          r.sa_name,
          r.technician_name,
          r.status,
          r.out_ts ? new Date(r.out_ts).toLocaleString('en-IN') : '',
          r.invoice_date,
          r.closed_date_time ? new Date(r.closed_date_time).toLocaleString('en-IN') : '',
          Number((Number(r.labour ?? 0)).toFixed(2)),
          r.match_status,
        ]),
      ]
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      ws['!cols'] = [18, 20, 14, 16, 26, 24, 15, 25, 15, 25, 14, 15].map(w => ({ wch: w }))
      XLSX.utils.book_append_sheet(wb, ws, 'Date Issues')
      XLSX.writeFile(wb, `JC_Date_Issues_${fromDate}_to_${toDate}.xlsx`)
    } catch (e: any) {
      alert('Export failed: ' + (e.message ?? 'Unknown error'))
    }
  }

  function downloadExcel(rows: YesterdayRow[], date: string) {
    const sheetData = [
      ['Technician Name', 'Technician Code', 'Job Card No', 'Reg No', 'Branch', 'Fuel Type', 'Bay No', 'Labour Amount (₹)', 'Amount Paid (₹)'],
      ...rows.map(r => [
        r.technician_name,
        r.technician_code,
        r.job_card_number,
        r.reg_number,
        r.branch,
        r.fuel_type,
        r.bay_no,
        Math.round(r.gross_labour_amount),
        Math.round(r.technician_income),
      ])
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    // Column widths
    ws['!cols'] = [22,18,18,14,14,10,8,20,20].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, 'Technician Report')
    XLSX.writeFile(wb, `Technician_Report_${date}.xlsx`)
  }

  function downloadPivotExcel(
    dates: string[],
    techs: string[],
    pivot: Map<string, Map<string, number>>,
    rowTotals: Map<string, number>,
    colTotals: Map<string, number>,
    grandTotal: number
  ) {
    const header = ['Date', ...techs, 'Day Total']
    const rows2: (string | number)[][] = dates.map(d => {
      const row: (string | number)[] = [d]
      techs.forEach(t => row.push(Math.round(pivot.get(d)?.get(t) ?? 0)))
      row.push(Math.round(rowTotals.get(d) ?? 0))
      return row
    })
    const totalRow: (string | number)[] = ['TOTAL', ...techs.map(t => Math.round(colTotals.get(t) ?? 0)), Math.round(grandTotal)]
    const sheetData = [header, ...rows2, totalRow]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = [12, ...techs.map(() => ({ wch: 18 })), { wch: 14 }].map((v, i) => i === 0 ? { wch: 12 } : v as {wch:number})
    XLSX.utils.book_append_sheet(wb, ws, 'Pivot Report')
    XLSX.writeFile(wb, `Technician_Pivot_Report.xlsx`)
  }

  useEffect(() => {
    void loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  const assignmentsWithIncome = useMemo<TechnicianAssignmentRow[]>(() => {
    return assignments.map((row) => ({
      ...row,
      technician_income: calculateTechnicianIncome(
        Number(row.gross_labour_amount ?? 0),
        row.bay_no,
        pvSharePercent,
        evSharePercent,
        Number(row.assignment_split_count ?? 1),
      ),
    }))
  }, [assignments, pvSharePercent, evSharePercent])

  const dateScopedAssignmentsWithIncome = useMemo(() => {
    const hasFrom = Boolean(fromDate)
    const hasTo = Boolean(toDate)
    if (!hasFrom && !hasTo) return assignmentsWithIncome

    return assignmentsWithIncome.filter((row) => {
      const dateKey = getAssignmentDateKey(row)
      if (!dateKey) return false
      if (hasFrom && dateKey < fromDate) return false
      if (hasTo && dateKey > toDate) return false
      return true
    })
  }, [assignmentsWithIncome, fromDate, toDate])

  const branches = useMemo(() => {
    const values = new Set(dateScopedAssignmentsWithIncome.map((row) => getBranchLabel(row.branch)))
    return Array.from(values).sort((a, b) => {
      if (a === UNKNOWN_LOCATION) return 1
      if (b === UNKNOWN_LOCATION) return -1
      return a.localeCompare(b)
    })
  }, [dateScopedAssignmentsWithIncome])

  useEffect(() => {
    if (branchFilter === 'all') return
    if (!branches.includes(branchFilter)) {
      setBranchFilter('all')
    }
  }, [branchFilter, branches])

  const branchScopedAssignmentsWithIncome = useMemo(() => {
    if (branchFilter === 'all') return dateScopedAssignmentsWithIncome
    return dateScopedAssignmentsWithIncome.filter((row) => getBranchLabel(row.branch) === branchFilter)
  }, [dateScopedAssignmentsWithIncome, branchFilter])

  const fuelTypeOptions = useMemo(() => {
    const values = new Set(branchScopedAssignmentsWithIncome.map((row) => getAssignmentFuelTypeLabel(row)))
    return Array.from(values).sort((a, b) => {
      if (a === UNKNOWN_FUEL_TYPE) return 1
      if (b === UNKNOWN_FUEL_TYPE) return -1
      return a.localeCompare(b)
    })
  }, [branchScopedAssignmentsWithIncome])

  useEffect(() => {
    if (fuelTypeFilter === 'all') return
    if (!fuelTypeOptions.includes(fuelTypeFilter)) {
      setFuelTypeFilter('all')
    }
  }, [fuelTypeFilter, fuelTypeOptions])

  const filteredAssignmentsWithIncome = useMemo(() => {
    if (fuelTypeFilter === 'all') return branchScopedAssignmentsWithIncome
    return branchScopedAssignmentsWithIncome.filter((row) => getAssignmentFuelTypeLabel(row) === fuelTypeFilter)
  }, [branchScopedAssignmentsWithIncome, fuelTypeFilter])

  const parsedDraftPvSharePercent = useMemo(
    () => normalizeSharePercentInput(draftPvSharePercent, pvSharePercent),
    [draftPvSharePercent, pvSharePercent],
  )

  const parsedDraftEvSharePercent = useMemo(
    () => normalizeSharePercentInput(draftEvSharePercent, evSharePercent),
    [draftEvSharePercent, evSharePercent],
  )

  const hasPendingShareChanges =
    parsedDraftPvSharePercent !== pvSharePercent || parsedDraftEvSharePercent !== evSharePercent

  const technicianCards = useMemo<TechnicianSummaryCard[]>(() => {
    const byTechnician = new Map<string, TechnicianSummaryCard & { days: Set<string> }>()

    filteredAssignmentsWithIncome.forEach((row) => {
      const code = String(row.technician_code ?? '').trim().toUpperCase()
      if (!code) return

      const name = String(row.technician_name ?? '').trim() || code
      const dateKey = getAssignmentDateKey(row) ?? 'unknown'
      
      const existing = byTechnician.get(code) ?? {
        code,
        name,
        rowCount: 0,
        dayCount: 0,
        totalIncome: 0,
        days: new Set<string>(),
      }

      existing.rowCount += 1
      existing.totalIncome += Number(row.technician_income ?? 0)
      existing.days.add(dateKey)
      existing.dayCount = existing.days.size
      byTechnician.set(code, existing)
    })

    return Array.from(byTechnician.values())
      .map(({ days: _days, ...card }) => card)
      .sort((a, b) => {
        if (b.totalIncome !== a.totalIncome) return b.totalIncome - a.totalIncome
        return b.rowCount - a.rowCount
      })
  }, [filteredAssignmentsWithIncome])

  useEffect(() => {
    if (technicianCards.length === 0) {
      if (selectedTechnicianCode) setSelectedTechnicianCode('')
      return
    }

    const hasSelected = technicianCards.some((card) => card.code === selectedTechnicianCode)
    if (!hasSelected && selectedTechnicianCode) {
      setSelectedTechnicianCode('')
      setSelectedDayKey('')
    }
  }, [selectedTechnicianCode, technicianCards])

  const selectedTechnicianName = useMemo(() => {
    const selected = technicianCards.find((card) => card.code === selectedTechnicianCode)
    return selected?.name ?? ''
  }, [selectedTechnicianCode, technicianCards])

  const selectedTechnicianRows = useMemo(() => {
    const code = String(selectedTechnicianCode ?? '').trim().toUpperCase()
    if (!code) return []
    return filteredAssignmentsWithIncome.filter((row) => String(row.technician_code ?? '').trim().toUpperCase() === code)
  }, [filteredAssignmentsWithIncome, selectedTechnicianCode])

  const dayCards = useMemo<DayWiseCard[]>(() => {
    const byDay = new Map<string, DayWiseCard>()

    selectedTechnicianRows.forEach((row) => {
      const dateKey = getAssignmentDateKey(row) ?? 'unknown'
      const label = dateKey === 'unknown' ? 'No date' : new Date(dateKey).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })

      const existing = byDay.get(dateKey) ?? {
        dateKey,
        label,
        rowCount: 0,
        completedCount: 0,
        totalIncome: 0,
      }

      existing.rowCount += 1
      existing.totalIncome += Number(row.technician_income ?? 0)
      if (normalizeStatus(row.work_status) === 'completed') {
        existing.completedCount += 1
      }

      byDay.set(dateKey, existing)
    })

    return Array.from(byDay.values()).sort((a, b) => {
      if (a.dateKey === 'unknown') return 1
      if (b.dateKey === 'unknown') return -1
      return b.dateKey.localeCompare(a.dateKey)
    })
  }, [selectedTechnicianRows])

  useEffect(() => {
    if (dayCards.length === 0) {
      if (selectedDayKey) setSelectedDayKey('')
      return
    }

    const hasSelected = dayCards.some((card) => card.dateKey === selectedDayKey)
    if (!hasSelected && selectedDayKey) {
      setSelectedDayKey('')
    }
  }, [selectedDayKey, dayCards])

  const dayRowsForSelectedDay = useMemo(() => {
    if (!selectedDayKey) return []
    return selectedTechnicianRows.filter((row) => {
      const dateKey = getAssignmentDateKey(row) ?? 'unknown'
      return dateKey === selectedDayKey
    })
  }, [selectedTechnicianRows, selectedDayKey])

  const vehicleOnDayCards = useMemo<VehicleOnDayCard[]>(() => {
    const byVehicle = new Map<string, VehicleOnDayCard>()

    dayRowsForSelectedDay.forEach((row) => {
      const reg = String(row.reg_number ?? '').trim().toUpperCase()
      const jc = String(row.job_card_number ?? '').trim().toUpperCase()
      const regKey = reg || `UNREG-${jc}`
      const label = reg || `No Reg (${jc})`

      const existing = byVehicle.get(regKey) ?? {
        regKey,
        label,
        rowCount: 0,
        completedCount: 0,
        totalIncome: 0,
      }

      existing.rowCount += 1
      existing.totalIncome += Number(row.technician_income ?? 0)
      if (normalizeStatus(row.work_status) === 'completed') {
        existing.completedCount += 1
      }

      byVehicle.set(regKey, existing)
    })

    return Array.from(byVehicle.values()).sort((a, b) => {
      if (b.totalIncome !== a.totalIncome) return b.totalIncome - a.totalIncome
      return b.rowCount - a.rowCount
    })
  }, [dayRowsForSelectedDay])

  useEffect(() => {
    if (vehicleOnDayCards.length === 0) {
      if (selectedVehicleOnDayKey) setSelectedVehicleOnDayKey('')
      return
    }

    const hasSelected = vehicleOnDayCards.some((card) => card.regKey === selectedVehicleOnDayKey)
    if (!hasSelected && selectedVehicleOnDayKey) {
      setSelectedVehicleOnDayKey('')
    }
  }, [selectedVehicleOnDayKey, vehicleOnDayCards])

  const finalRows = useMemo(() => {
    let rows = dayRowsForSelectedDay

    if (selectedVehicleOnDayKey) {
      rows = rows.filter((row) => {
        const reg = String(row.reg_number ?? '').trim().toUpperCase()
        const jc = String(row.job_card_number ?? '').trim().toUpperCase()
        const regKey = reg || `UNREG-${jc}`
        return regKey === selectedVehicleOnDayKey
      })
    }

    return rows.sort((a, b) => {
      const aTs = new Date(a.assigned_at ?? 0).getTime()
      const bTs = new Date(b.assigned_at ?? 0).getTime()
      return bTs - aTs
    })
  }, [dayRowsForSelectedDay, selectedVehicleOnDayKey])

  const totalIncome = useMemo(
    () => technicianCards.reduce((sum, row) => sum + row.totalIncome, 0),
    [technicianCards],
  )

  const hasEmailRange = Boolean(fromDate) && Boolean(toDate)
  const hasFilteredRowsForEmail = technicianCards.length > 0
  const canSendRangeReportEmail = hasEmailRange && hasFilteredRowsForEmail

  async function handleSendRangeReportEmail() {
    if (!hasEmailRange) {
      setReportEmailState({
        type: 'error',
        message: 'Select both start and end dates in \'Range\' before sending email report.',
      })
      return
    }

    if (!hasFilteredRowsForEmail) {
      setReportEmailState({
        type: 'error',
        message: 'No filtered technician rows available for the selected range.',
      })
      return
    }

    setSendingReportEmail(true)
    setReportEmailState(null)

    const reportScopeLabel = [
      fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`,
      `Loc: ${branchFilter === 'all' ? 'All' : branchFilter}`,
      `Portal: ${fuelTypeFilter === 'all' ? 'All' : fuelTypeFilter}`,
    ].join(' | ')

    const res = await sendTechnicianDailyEarningsTestEmail({
      runFromIst: fromDate,
      runToIst: toDate,
      reportScopeLabel,
      rows: technicianCards.map((card) => ({
        technicianCode: card.code,
        technicianName: card.name,
        earnings: Number(card.totalIncome.toFixed(2)),
      })),
    })
    if (res.error || !res.data) {
      setReportEmailState({
        type: 'error',
        message: res.error ?? 'Failed to send technician report email.',
      })
      setSendingReportEmail(false)
      return
    }

    setReportEmailState({
      type: 'success',
      message: `Email sent for ${res.data.reportLabel ?? `${fromDate} to ${toDate}`}. Rows: ${res.data.rowCount}, Total: ${formatCurrency(res.data.totalEarnings)}.`,
    })
    setSendingReportEmail(false)
  }

  return (
    <div style={{ padding: '0.75rem' }}>
      {/* ── TOP CONTROL BAR ───────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 0.85rem', marginBottom: '0.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>🔧 Technician Tracker</span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{dateScopedAssignmentsWithIncome.length} JCs</span>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Loc:</span>
        <button type="button" onClick={() => setBranchFilter('all')}
          className={`btn btn--sm ${branchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
          All ({dateScopedAssignmentsWithIncome.length})
        </button>
        {branches.map((branch) => (
          <button key={branch} type="button" onClick={() => setBranchFilter(branch)}
            className={`btn btn--sm ${branchFilter === branch ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            {branch} ({dateScopedAssignmentsWithIncome.filter((row) => getBranchLabel(row.branch) === branch).length})
          </button>
        ))}

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Portal:</span>
        <button type="button" onClick={() => setFuelTypeFilter('all')}
          className={`btn btn--sm ${fuelTypeFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
          All ({branchScopedAssignmentsWithIncome.length})
        </button>
        {fuelTypeOptions.map((fuelType) => (
          <button key={fuelType} type="button" onClick={() => setFuelTypeFilter(fuelType)}
            className={`btn btn--sm ${fuelTypeFilter === fuelType ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            {fuelType} ({branchScopedAssignmentsWithIncome.filter((row) => getAssignmentFuelTypeLabel(row) === fuelType).length})
          </button>
        ))}

        <span style={{ flex: 1 }} />

        <button type="button" onClick={() => void handleGenerateYesterdayReport()} disabled={generatingReport}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', opacity: generatingReport ? 0.7 : 1 }}>
          📥 {generatingReport ? 'Loading…' : 'Yesterday'}
        </button>
        <button type="button" onClick={() => setShowPivotReport(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
          📊 Pivot
        </button>
        {canEditSharePercent && (
          <button
            type="button"
            onClick={() => void handleSendRangeReportEmail()}
              disabled={sendingReportEmail || !canSendRangeReportEmail}
              title={
                !hasEmailRange
                  ? 'Select both start and end date in Range to enable'
                  : hasFilteredRowsForEmail
                    ? 'Send report for currently filtered rows'
                    : 'No filtered rows to send'
              }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.3rem 0.75rem',
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: sendingReportEmail || !canSendRangeReportEmail ? 'not-allowed' : 'pointer',
              opacity: sendingReportEmail || !canSendRangeReportEmail ? 0.45 : 1,
            }}>
            ✉️ {sendingReportEmail ? 'Sending…' : 'Email Report'}
          </button>
        )}
      </div>

      {error && (
        <div className="toast error">
          <Icon name="alert" size={14} />
          {error}
        </div>
      )}

      {reportEmailState && (
        <div className={`toast ${reportEmailState.type === 'error' ? 'error' : ''}`} style={reportEmailState.type === 'success' ? { borderColor: 'rgba(34,197,94,.35)', color: '#166534', background: '#f0fdf4' } : undefined}>
          <Icon name={reportEmailState.type === 'error' ? 'alert' : 'checksm'} size={14} />
          {reportEmailState.message}
        </div>
      )}

      {/* ── Pivot Report Modal ───────────────────────────────────── */}
      {showPivotReport && (() => {
        // Build pivot: date → techName → totalIncome
        const pivot = new Map<string, Map<string, number>>()
        const colTotals = new Map<string, number>()
        const rowTotals = new Map<string, number>()
        let grandTotal = 0

        filteredAssignmentsWithIncome.forEach(row => {
          const dateKey = getAssignmentDateKey(row)
          if (!dateKey) return
          const techName = String(row.technician_name ?? '').trim() || String(row.technician_code ?? '').trim()
          const income = Number(row.technician_income ?? 0)
          if (income <= 0) return

          if (!pivot.has(dateKey)) pivot.set(dateKey, new Map())
          pivot.get(dateKey)!.set(techName, (pivot.get(dateKey)!.get(techName) ?? 0) + income)
          colTotals.set(techName, (colTotals.get(techName) ?? 0) + income)
          rowTotals.set(dateKey, (rowTotals.get(dateKey) ?? 0) + income)
          grandTotal += income
        })

        const dates = Array.from(pivot.keys()).sort()
        const techs = Array.from(colTotals.entries())
          .sort((a, b) => b[1] - a[1])  // sort by highest earning first
          .map(([t]) => t)

        const fmtAmt = (n: number) => n > 0 ? '₹' + Math.round(n).toLocaleString('en-IN') : '—'

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            onClick={e => { if (e.target === e.currentTarget) setShowPivotReport(false) }}>
            <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '98vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>📊 Technician Pivot Report</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Dates (rows) × Technicians (columns) · Value = Earning Amount · {dates.length} days · {techs.length} technicians
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <button
                    onClick={() => downloadPivotExcel(dates, techs, pivot, rowTotals, colTotals, grandTotal)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                    📥 Download Excel
                  </button>
                  <button onClick={() => setShowPivotReport(false)} style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
                </div>
              </div>

              {/* Table */}
              <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                {dates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>No earning data in the selected range.</div>
                ) : (
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {/* Date col header */}
                        <th style={{ padding: '0.65rem 0.9rem', textAlign: 'left', fontWeight: 700, color: '#1e293b', borderBottom: '2px solid #e2e8f0', borderRight: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>
                          📅 Date
                        </th>
                        {techs.map(t => (
                          <th key={t} style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontSize: '0.75rem', minWidth: '120px' }}>
                            🔧 {t}
                          </th>
                        ))}
                        {/* Day Total */}
                        <th style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#1e293b', borderBottom: '2px solid #e2e8f0', borderLeft: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc', position: 'sticky', right: 0, zIndex: 2 }}>
                          Day Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dates.map((date, di) => {
                        const dayMap = pivot.get(date) ?? new Map()
                        const rowTotal = rowTotals.get(date) ?? 0
                        return (
                          <tr key={date} style={{ background: di % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.55rem 0.9rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', borderRight: '2px solid #e2e8f0', position: 'sticky', left: 0, background: di % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1 }}>
                              {date}
                            </td>
                            {techs.map(t => {
                              const val = dayMap.get(t) ?? 0
                              return (
                                <td key={t} style={{ padding: '0.55rem 0.75rem', textAlign: 'right', borderRight: '1px solid #f1f5f9', color: val > 0 ? '#0f172a' : '#cbd5e1', fontWeight: val > 0 ? 600 : 400 }}>
                                  {fmtAmt(val)}
                                </td>
                              )
                            })}
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#1e293b', borderLeft: '2px solid #e2e8f0', position: 'sticky', right: 0, background: di % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1 }}>
                              {fmtAmt(rowTotal)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f0f9ff', borderTop: '2px solid #0369a1' }}>
                        <td style={{ padding: '0.65rem 0.9rem', fontWeight: 800, color: '#0369a1', borderRight: '2px solid #e2e8f0', position: 'sticky', left: 0, background: '#f0f9ff', zIndex: 1, whiteSpace: 'nowrap' }}>
                          🏆 TOTAL
                        </td>
                        {techs.map(t => (
                          <td key={t} style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 800, color: '#16a34a', borderRight: '1px solid #e2e8f0', fontSize: '0.83rem' }}>
                            {fmtAmt(colTotals.get(t) ?? 0)}
                          </td>
                        ))}
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 900, color: '#16a34a', fontSize: '0.9rem', borderLeft: '2px solid #0369a1', position: 'sticky', right: 0, background: '#f0f9ff', zIndex: 1 }}>
                          {fmtAmt(grandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Yesterday Report Modal ─────────────────────────────── */}
      {yesterdayReport && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setYesterdayReport(null) }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '860px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>📊 Yesterday&apos;s Report — {yesterdayReport.date}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>{yesterdayReport.rows.length} completed jobs</div>
              </div>
              <button onClick={() => setYesterdayReport(null)} style={{ border: 'none', background: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.65rem', padding: '0.85rem 1.25rem', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              <button
                onClick={() => downloadExcel(yesterdayReport.rows, yesterdayReport.date)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer' }}>
                📥 Download Excel
              </button>
              <a
                href={'https://wa.me/?text=' + encodeURIComponent(yesterdayReport.waText)}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: '#25D366', color: '#fff', borderRadius: '7px', fontWeight: 600, fontSize: '0.83rem', textDecoration: 'none' }}>
                📤 Share on WhatsApp
              </a>
              <button
                onClick={() => { navigator.clipboard.writeText(yesterdayReport.waText); alert('Copied to clipboard!') }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '7px', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer' }}>
                📋 Copy Text
              </button>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem' }}>
              {yesterdayReport.rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>No completed jobs found for yesterday.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      {['Technician', 'Job Card', 'Reg No', 'Branch', 'Fuel', 'Labour Amount', 'Amount Paid'].map(h => (
                        <th key={h} style={{ padding: '0.55rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.76rem', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let lastTech = ''
                      return yesterdayReport.rows.map((r, i) => {
                        const isNewTech = r.technician_name !== lastTech
                        lastTech = r.technician_name
                        const techRows = yesterdayReport.rows.filter(x => x.technician_name === r.technician_name)
                        const techTotal = techRows.reduce((s, x) => s + x.technician_income, 0)
                        const techLabour = techRows.reduce((s, x) => s + x.gross_labour_amount, 0)
                        return (
                          <>
                            {isNewTech && (
                              <tr key={'hdr-' + i} style={{ background: '#f0f9ff' }}>
                                <td colSpan={5} style={{ padding: '0.45rem 0.75rem', fontWeight: 700, color: '#0369a1', fontSize: '0.83rem' }}>
                                  🔧 {r.technician_name} <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem' }}>({r.technician_code})</span>
                                </td>
                                <td style={{ padding: '0.45rem 0.75rem', fontWeight: 700, color: '#0369a1', fontSize: '0.83rem' }}>₹{Math.round(techLabour).toLocaleString('en-IN')}</td>
                                <td style={{ padding: '0.45rem 0.75rem', fontWeight: 800, color: '#16a34a', fontSize: '0.85rem' }}>₹{Math.round(techTotal).toLocaleString('en-IN')}</td>
                              </tr>
                            )}
                            <tr key={r.job_card_number + '-' + i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                              <td style={{ padding: '0.5rem 0.75rem 0.5rem 1.5rem', color: '#64748b', fontSize: '0.78rem' }}>{r.technician_name}</td>
                              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.76rem', color: '#334155' }}>{r.job_card_number}</td>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#1e293b' }}>{r.reg_number}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#64748b', fontSize: '0.78rem' }}>{r.branch}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#64748b', fontSize: '0.78rem' }}>{r.fuel_type}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#334155' }}>₹{Math.round(r.gross_labour_amount).toLocaleString('en-IN')}</td>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: '#16a34a' }}>
                                ₹{Math.round(r.technician_income).toLocaleString('en-IN')}
                                <div style={{ marginTop: '0.15rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>{getSplitLabel(r.assignment_split_count)}</div>
                              </td>
                            </tr>
                          </>
                        )
                      })
                    })()}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={5} style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#1e293b' }}>TOTAL ({yesterdayReport.rows.length} jobs)</td>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#1e293b' }}>
                        ₹{Math.round(yesterdayReport.rows.reduce((s, r) => s + r.gross_labour_amount, 0)).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 800, color: '#16a34a', fontSize: '0.9rem' }}>
                        ₹{Math.round(yesterdayReport.rows.reduce((s, r) => s + r.technician_income, 0)).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STATS + DATE RANGE BAR ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem', marginBottom: '0.6rem' }}>
        <div style={{ background: '#eef2ff', borderRadius: '8px', padding: '0.5rem 0.75rem', border: '1px solid #6366f122' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#6366f1' }}>{technicianCards.length}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.1rem' }}>Technicians</div>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '0.5rem 0.75rem', border: '1px solid #16a34a22', gridColumn: 'span 2' }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16a34a' }}>{formatCurrency(totalIncome)}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.1rem' }}>Total Earnings</div>
        </div>
        {/* Date range fine-filter */}
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.45rem 0.65rem', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', gridColumn: 'span 3' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>📅 Range:</span>
          <input type="date" className="inp" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: '130px' }}
            value={fromDate}
            onChange={(e) => { const v = e.target.value; setFromDate(v); if (toDate && v && v > toDate) setToDate(v) }} />
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>→</span>
          <input type="date" className="inp" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: '130px' }}
            value={toDate}
            onChange={(e) => { const v = e.target.value; setToDate(v); if (fromDate && v && v < fromDate) setFromDate(v) }} />
          {(fromDate || toDate) && (
            <button type="button" className="btn btn--ghost btn--sm"
              style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
              onClick={() => { setFromDate(''); setToDate('') }}>✕</button>
          )}
          <button type="button"
            onClick={() => void handleExportIssues()}
            disabled={!fromDate || !toDate}
            title={fromDate && toDate ? 'Export date mismatch issues' : 'Select both start and end dates'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.3rem 0.7rem',
              background: fromDate && toDate ? '#ef4444' : '#fca5a5',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: fromDate && toDate ? 'pointer' : 'not-allowed',
              opacity: fromDate && toDate ? 1 : 0.6,
            }}>
            📥 Export Issues
          </button>
        </div>
      </div>

      {/* Technician cards */}
      {!loading && technicianCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>Earnings by technician</h3>
              <div className="sub">Sorted highest to lowest. Income = (Labour ÷ 1.18) × {pvSharePercent}% (PV) or {evSharePercent}% (EV).</div>
            </div>
            {canEditSharePercent && (
              <div className="tech-share-corner">
                <h3>Earnings percentage settings</h3>
                <div className="tech-share-controls">
                  <label className="field field--no-gap tech-share-field">
                    <span className="label">PV %</span>
                    <input
                      className="inp"
                      inputMode="decimal"
                      value={draftPvSharePercent}
                      onChange={(e) => setDraftPvSharePercent(e.target.value)}
                      onBlur={() => setDraftPvSharePercent(String(parsedDraftPvSharePercent))}
                      placeholder="20"
                    />
                  </label>

                  <label className="field field--no-gap tech-share-field">
                    <span className="label">EV %</span>
                    <input
                      className="inp"
                      inputMode="decimal"
                      value={draftEvSharePercent}
                      onChange={(e) => setDraftEvSharePercent(e.target.value)}
                      onBlur={() => setDraftEvSharePercent(String(parsedDraftEvSharePercent))}
                      placeholder="25"
                    />
                  </label>

                  <div className="tech-share-actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={async () => {
                        setPvSharePercent(parsedDraftPvSharePercent)
                        setEvSharePercent(parsedDraftEvSharePercent)
                        // Persist to DB
                        await supabase.from('technician_earnings_settings').upsert([
                          { key: 'pv_share_percent', value: String(parsedDraftPvSharePercent) },
                          { key: 'ev_share_percent', value: String(parsedDraftEvSharePercent) },
                        ], { onConflict: 'key' })
                      }}
                      disabled={!hasPendingShareChanges}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => {
                        setPvSharePercent(DEFAULT_PV_SHARE_PERCENT)
                        setEvSharePercent(DEFAULT_EV_SHARE_PERCENT)
                        setDraftPvSharePercent(String(DEFAULT_PV_SHARE_PERCENT))
                        setDraftEvSharePercent(String(DEFAULT_EV_SHARE_PERCENT))
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid">
              {technicianCards.map((card) => (
                <button
                  key={card.code}
                  type="button"
                  className={`tech-drill-btn ${selectedTechnicianCode === card.code ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedTechnicianCode === card.code) {
                      setSelectedTechnicianCode('')
                      setSelectedDayKey('')
                    } else {
                      setSelectedTechnicianCode(card.code)
                      setSelectedDayKey('')
                    }
                  }}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.name}</div>
                    <div className="tech-drill-btn__code">{card.code}</div>
                  </div>
                  <div className="tech-drill-btn__value">{formatCurrency(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta">{card.dayCount} days • {card.rowCount} rows</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Day-wise cards */}
      {!loading && selectedTechnicianCode && dayCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedTechnicianName} — day-wise earnings</h3>
              <div className="sub">Select a day to view job card details.</div>
            </div>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid tech-drill-grid--sm">
              {dayCards.map((card) => (
                <button
                  key={card.dateKey}
                  type="button"
                  className={`tech-drill-btn ${selectedDayKey === card.dateKey ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedDayKey === card.dateKey) {
                      setSelectedDayKey('')
                    } else {
                      setSelectedDayKey(card.dateKey)
                    }
                  }}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.label}</div>
                  </div>
                  <div className="tech-drill-btn__value">{formatCurrency(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta">{card.rowCount} rows • {card.completedCount} done</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Vehicle-on-day cards */}
      {!loading && selectedDayKey && vehicleOnDayCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>Vehicle-wise earnings for {dayCards.find((d) => d.dateKey === selectedDayKey)?.label}</h3>
              <div className="sub">Select a vehicle to view its job cards on this day.</div>
            </div>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid tech-drill-grid--sm">
              {vehicleOnDayCards.map((card) => (
                <button
                  key={card.regKey}
                  type="button"
                  className={`tech-drill-btn ${selectedVehicleOnDayKey === card.regKey ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedVehicleOnDayKey === card.regKey) {
                      setSelectedVehicleOnDayKey('')
                    } else {
                      setSelectedVehicleOnDayKey(card.regKey)
                    }
                  }}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.label}</div>
                  </div>
                  <div className="tech-drill-btn__value">{formatCurrency(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta">{card.rowCount} rows • {card.completedCount} done</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Final JC rows */}
      {!loading && selectedTechnicianCode && (
        <div className="card">
          <div className="card__head">
            <div>
              <h3>Job card details</h3>
              <div className="sub">
                JC #, Reg #, Bay, Status, IN TS, OUT TS, Invoice Date, Time Diff, Labour ÷ 1.18, Remark
                {selectedDayKey && ` — ${dayCards.find((d) => d.dateKey === selectedDayKey)?.label || 'selected day'}`}
                {selectedVehicleOnDayKey && ` — ${vehicleOnDayCards.find((v) => v.regKey === selectedVehicleOnDayKey)?.label || 'selected vehicle'}`}
              </div>
            </div>
          </div>
          <div className="card__body dense">
            {!selectedDayKey ? (
              <div className="empty-state">Select a day card above to view rows.</div>
            ) : finalRows.length === 0 ? (
              <div className="empty-state">{selectedVehicleOnDayKey ? 'No job card rows for this vehicle on this day.' : 'No job card rows for this day.'}</div>
            ) : (
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="mono">JC Number</th>
                      <th className="mono">Reg No</th>
                      <th>Bay No</th>
                      <th className="ctr">Status</th>
                      <th className="ts-cell">IN TS</th>
                      <th className="ts-cell">OUT TS</th>
                      <th className="ts-cell">Invoice Date</th>
                      <th className="ctr">Time Diff</th>
                      <th className="ctr">Labour ÷ 1.18</th>
                      <th className="ctr">Split</th>
                      <th>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalRows.map((row) => (
                      <tr key={row.id}>
                        <td className="mono ts-cell">{row.job_card_number}</td>
                        <td className="mono ts-cell">{row.reg_number ?? '—'}</td>
                        <td className="type-cell">{row.bay_no ?? '—'}</td>
                        <td className="ctr">
                          <span className={`pill ${statusPill(row.work_status)}`}>
                            {statusLabel(row.work_status)}
                          </span>
                        </td>
                        <td className="ts-cell">{formatDateTime(row.assigned_at)}</td>
                        <td className="ts-cell">{formatDateTime(row.out_ts)}</td>
                        <td className="ts-cell">{formatDateOnly(row.invoice_date)}</td>
                        <td className="ctr ts-cell">{row.time_diff ?? '—'}</td>
                        <td className="ctr ts-cell">{formatCurrency(Number(row.gross_labour_amount ?? 0) / 1.18)}</td>
                        <td className="ctr ts-cell">{getSplitLabel(row.assignment_split_count)}</td>
                        <td className="remark-cell">{row.remark ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
