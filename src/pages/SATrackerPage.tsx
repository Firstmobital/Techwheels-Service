import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

// ── Types ──────────────────────────────────────────────────────────────────────

type ClosedJCRow = {
  id: number
  job_card_number: string
  sr_assigned_to: string | null
  final_labour_amount: number | string | null
  final_spares_amount: number | string | null
  total_invoice_amount: number | string | null
  closed_date_time: string | null
  invoice_date: string | null
  branch: string | null
  location: string | null
  portal: string | null
  branch_label: string | null
  vehicle_registration_number: string | null
  sr_type: string | null
  product_line: string | null
}

type SASummaryCard = {
  name: string
  jcCount: number
  dayCount: number
  totalLabour: number
  totalSpares: number
  totalInvoice: number
  totalIncome: number
}

type DayWiseCard = {
  dateKey: string
  label: string
  jcCount: number
  totalLabour: number
  totalSpares: number
  totalInvoice: number
  totalIncome: number
}

type JCDetailRow = ClosedJCRow & {
  labourAmt: number
  sparesAmt: number
  invoiceAmt: number
  dateKey: string | null
}

// SA employee → department mapping (from settings_employees)
type SaEmployee = {
  employee_name: string
  department: string | null
}

const QUERY_PAGE_SIZE = 1000
const UNKNOWN_BRANCH = 'Unknown location'
const UNKNOWN_PORTAL = 'Unknown portal'
type YesterdaySARow = {
  sa_name: string
  job_card_number: string
  reg_number: string
  branch: string
  labour_amount: number
  sa_income: number
  date_key: string
}

const DEFAULT_SA_SHARE_PERCENT = 3
const DEFAULT_EV_SHARE_PERCENT = 4

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value == null) return 0
  const raw = String(value).trim()
  if (!raw) return 0
  const neg = raw.startsWith('(') && raw.endsWith(')')
  const cleaned = raw.replace(/[₹,\s()]/g, '').replace(/RS\.?/gi, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return 0
  return neg ? -n : n
}

function getDateKey(row: ClosedJCRow): string | null {
  const src = row.closed_date_time ?? row.invoice_date
  if (!src) return null
  const d = new Date(src)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function dateLabel(key: string): string {
  if (key === 'unknown') return 'No date'
  return new Date(key).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })
}


function calculateSAIncome(labourAmount: number, saSharePercent: number): number {
  if (!Number.isFinite(labourAmount) || labourAmount <= 0) return 0
  return labourAmount * (saSharePercent / 100)
}

function normalizeShareInput(value: string, fallback: number): number {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return fallback
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(0, parsed))
}

function getBranchLabel(v: string | null | undefined): string {
  return String(v ?? '').trim() || UNKNOWN_BRANCH
}

function getPortalLabel(v: string | null | undefined): string {
  const normalized = String(v ?? '').trim().toUpperCase()
  if (normalized === 'EV' || normalized === 'PV') return normalized
  return UNKNOWN_PORTAL
}

// ── Component ──────────────────────────────────────────────────────────────────

// ── SA Yesterday Report helpers ───────────────────────────────────────────────
function buildSAWAText(rows: YesterdaySARow[], date: string, saSharePct: number): string {
  if (rows.length === 0) return `📊 *SA Report — ${date}*\n\nNo closed jobs yesterday.`

  const bySA = new Map<string, YesterdaySARow[]>()
  rows.forEach(r => {
    if (!bySA.has(r.sa_name)) bySA.set(r.sa_name, [])
    bySA.get(r.sa_name)!.push(r)
  })

  const totalLabour = rows.reduce((s, r) => s + r.labour_amount, 0)
  const totalPaid   = rows.reduce((s, r) => s + r.sa_income, 0)

  let msg = `📊 *SA Earnings Report — ${date}*\n`
  msg += `⚙️ SA Share: ${saSharePct}%\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`

  bySA.forEach((saRows, name) => {
    const techLabour = saRows.reduce((s, r) => s + r.labour_amount, 0)
    const techPaid   = saRows.reduce((s, r) => s + r.sa_income, 0)
    msg += `🧑‍💼 *${name}*\n`
    saRows.forEach(r => {
      msg += `  🚗 ${r.reg_number}  Labour: ₹${Math.round(r.labour_amount).toLocaleString('en-IN')}  Paid: *₹${Math.round(r.sa_income).toLocaleString('en-IN')}*\n`
    })
    msg += `  Total Labour: ₹${Math.round(techLabour).toLocaleString('en-IN')} | *Paid: ₹${Math.round(techPaid).toLocaleString('en-IN')}*\n\n`
  })

  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `🏆 Total Labour: ₹${Math.round(totalLabour).toLocaleString('en-IN')}\n`
  msg += `💰 Total Paid: *₹${Math.round(totalPaid).toLocaleString('en-IN')}*`
  return msg
}

export default function SATrackerPage() {
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [periodPreset, setPeriodPreset] = useState<string>('this-month')
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ClosedJCRow[]>([])

  // Filters
  const fromDate: string = ''   // fine-filter retired; kept for dateScopedRows guard
  const toDate: string = ''
  const [branchFilter, setBranchFilter] = useState('all')
  const [portalFilter, setPortalFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')         // 'all' | 'Service' | 'Bodyshop'
  const [saEmployees, setSaEmployees] = useState<SaEmployee[]>([])

  // Share % settings
  const [canEditSharePercent, setCanEditSharePercent] = useState(false)
  const [saSharePercent, setSaSharePercent] = useState(DEFAULT_SA_SHARE_PERCENT)
  const [evSharePercent, setEvSharePercent] = useState(DEFAULT_EV_SHARE_PERCENT)
  const [draftSaShare, setDraftSaShare] = useState(String(DEFAULT_SA_SHARE_PERCENT))
  const [draftEvShare, setDraftEvShare] = useState(String(DEFAULT_EV_SHARE_PERCENT))
  // Drill-down state
  const [selectedSA, setSelectedSA] = useState('')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [yesterdaySAReport, setYesterdaySAReport] = useState<{ rows: YesterdaySARow[]; date: string; waText: string } | null>(null)
  const [showPivotReport, setShowPivotReport] = useState(false)
  const [selectedDayKey, setSelectedDayKey] = useState('')

  // ── Load ───────────────────────────────────────────────────────────────────

  // ── Period preset handler ────────────────────────────────────────────────
  function handlePeriodPreset(preset: string) {
    setPeriodPreset(preset)
    const now = new Date()
    const toIST = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const today = toIST(now)
    if (preset === 'today') {
      setDateRange({ from: today, to: today })
    } else if (preset === 'yesterday') {
      const d = new Date(now); d.setDate(now.getDate() - 1)
      const yest = toIST(d)
      setDateRange({ from: yest, to: yest })
    } else if (preset === 'this-month') {
      const y = today.slice(0, 4), m = today.slice(5, 7)
      const last = new Date(Number(y), Number(m), 0).getDate()
      setDateRange({ from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` })
    } else if (preset === 'last-month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const y = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4)
      const m = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(5, 7)
      const last = new Date(Number(y), Number(m), 0).getDate()
      setDateRange({ from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` })
    } else if (preset === 'this-week') {
      const day = now.getDay()
      const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7))
      setDateRange({ from: toIST(mon), to: today })
    } else if (preset === 'last-7') {
      const d = new Date(now); d.setDate(now.getDate() - 6)
      setDateRange({ from: toIST(d), to: today })
    } else if (preset === 'last-30') {
      const d = new Date(now); d.setDate(now.getDate() - 29)
      setDateRange({ from: toIST(d), to: today })
    }
    // 'custom' → user will pick dates below, don't change dateRange
  }

  // ── Load settings + role ONCE on mount ─────────────────────────────────
  async function loadSettings() {
    try {
      // Role check
      const authRes = await supabase.auth.getUser()
      const userId = authRes.data.user?.id
      if (userId) {
        const profileRes = await supabase
          .from('users')
          .select('role, is_active')
          .eq('id', userId)
          .maybeSingle()
        const role = String((profileRes.data as { role?: string | null } | null)?.role ?? '').trim().toLowerCase()
        const isActive = (profileRes.data as { is_active?: boolean | null } | null)?.is_active
        const roleCanEdit = role === 'super_admin' || role === 'super admin' || role === 'admin'
        setCanEditSharePercent(roleCanEdit && isActive !== false)
      }

      // Fetch earnings % from DB
      const { data, error: err } = await supabase
        .from('sa_earnings_settings')
        .select('key, value')
      if (err) {
        console.error('sa_earnings_settings fetch error:', err.message)
        return
      }
      if (data) {
        for (const row of data as { key: string; value: string }[]) {
          const parsed = parseFloat(row.value)
          if (!Number.isFinite(parsed) || parsed <= 0) continue
          if (row.key === 'sa_share_percent') {
            setSaSharePercent(parsed)
            setDraftSaShare(String(parsed))
          }
          if (row.key === 'ev_share_percent') {
            setEvSharePercent(parsed)
            setDraftEvShare(String(parsed))
          }
        }
      }
    } catch (e) {
      console.error('loadSettings error:', e)
    }
  }

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const allRows: ClosedJCRow[] = []
      let from = 0

      while (true) {
        const res = await supabase
          .from('job_card_closed_data')
          .select('id, job_card_number, sr_assigned_to, final_labour_amount, final_spares_amount, total_invoice_amount, closed_date_time, invoice_date, branch, location, portal, branch_label, vehicle_registration_number, sr_type, product_line')
          .not('sr_assigned_to', 'is', null)
          .gte('closed_date_time', dateRange.from + 'T00:00:00+05:30')
          .lte('closed_date_time', dateRange.to + 'T23:59:59+05:30')
          .order('closed_date_time', { ascending: false })
          .range(from, from + QUERY_PAGE_SIZE - 1)

        if (res.error) { setError(res.error.message); setLoading(false); return }
        const batch = (res.data ?? []) as ClosedJCRow[]
        allRows.push(...batch)
        if (batch.length < QUERY_PAGE_SIZE) break
        from += QUERY_PAGE_SIZE
      }

      setRows(allRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SA data')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  // ── Yesterday Report ──────────────────────────────────────────────────────
  async function handleGenerateSAYesterdayReport() {
    setGeneratingReport(true)
    try {
      const now = new Date()
      const istOffset = 5.5 * 60 * 60 * 1000
      const istNow = new Date(now.getTime() + istOffset)
      const yest = new Date(istNow)
      yest.setUTCDate(yest.getUTCDate() - 1)
      const dateStr = yest.toISOString().slice(0, 10)
      const fromTs = dateStr + 'T00:00:00+05:30'
      const toTs   = dateStr + 'T23:59:59+05:30'

      const { data, error: err } = await supabase
        .from('job_card_closed_data')
        .select('job_card_number, sr_assigned_to, final_labour_amount, vehicle_registration_number, branch_label, branch, closed_date_time, invoice_date')
        .gte('closed_date_time', fromTs)
        .lte('closed_date_time', toTs)
        .order('sr_assigned_to', { ascending: true })

      if (err) throw err

      const saRows: YesterdaySARow[] = (data ?? [])
        .filter((r: any) => r.sr_assigned_to)
        .map((r: any) => {
          const labour = parseAmount(r.final_labour_amount)
          const income = calculateSAIncome(labour, saSharePercent)
          return {
            sa_name: String(r.sr_assigned_to ?? '').trim(),
            job_card_number: String(r.job_card_number ?? '').trim(),
            reg_number: String(r.vehicle_registration_number ?? '—').trim(),
            branch: String(r.branch_label ?? r.branch ?? '—').trim(),
            labour_amount: labour,
            sa_income: income,
            date_key: dateStr,
          }
        })
        .sort((a: YesterdaySARow, b: YesterdaySARow) => a.sa_name.localeCompare(b.sa_name) || b.sa_income - a.sa_income)

      const waText = buildSAWAText(saRows, dateStr, saSharePercent)
      setYesterdaySAReport({ rows: saRows, date: dateStr, waText })
    } catch (e: any) {
      alert('Failed to generate SA report: ' + (e.message ?? 'Unknown error'))
    } finally {
      setGeneratingReport(false)
    }
  }

  function downloadSAYesterdayExcel(rows: YesterdaySARow[], date: string) {
    const sheetData = [
      ['SA Name', 'Job Card No', 'Reg No', 'Branch', 'Labour Amount (₹)', 'Amount Paid (₹)'],
      ...rows.map(r => [
        r.sa_name, r.job_card_number, r.reg_number, r.branch,
        Math.round(r.labour_amount), Math.round(r.sa_income),
      ])
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = [22, 18, 14, 16, 20, 20].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, 'SA Report')
    XLSX.writeFile(wb, `SA_Report_${date}.xlsx`)
  }

  function downloadSAPivotExcel(
    dates: string[], sas: string[],
    pivot: Map<string, Map<string, number>>,
    rowTotals: Map<string, number>,
    colTotals: Map<string, number>,
    grandTotal: number
  ) {
    const header = ['Date', ...sas, 'Day Total']
    const dataRows = dates.map(d => {
      const row: (string | number)[] = [d]
      sas.forEach(s => row.push(Math.round(pivot.get(d)?.get(s) ?? 0)))
      row.push(Math.round(rowTotals.get(d) ?? 0))
      return row
    })
    const totalRow: (string | number)[] = ['TOTAL', ...sas.map(s => Math.round(colTotals.get(s) ?? 0)), Math.round(grandTotal)]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totalRow])
    ws['!cols'] = [12, ...sas.map(() => ({ wch: 18 })), { wch: 14 }].map((v, i) => i === 0 ? { wch: 12 } : v as { wch: number })
    XLSX.utils.book_append_sheet(wb, ws, 'SA Pivot')
    XLSX.writeFile(wb, `SA_Pivot_Report.xlsx`)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  // ── Load SA department mapping from settings_employees ──────────────
  async function loadEmployees() {
    try {
      const { data, error: err } = await supabase
        .from('settings_employees')
        .select('employee_name, department')
        .not('employee_name', 'is', null)
      if (!err && data) {
        setSaEmployees((data as SaEmployee[]).filter(e => e.employee_name?.trim()))
      }
    } catch (e) {
      console.error('loadEmployees error:', e)
    }
  }

  useEffect(() => { void loadSettings(); void loadEmployees() }, [])  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadData() }, [dateRange])

  // ── Enriched rows ─────────────────────────────────────────────────────────

  const enrichedRows = useMemo<JCDetailRow[]>(() =>
    rows.map((r) => ({
      ...r,
      labourAmt: parseAmount(r.final_labour_amount),
      sparesAmt: parseAmount(r.final_spares_amount),
      invoiceAmt: parseAmount(r.total_invoice_amount),
      dateKey: getDateKey(r),
    })),
  [rows])

  // ── Date filter ───────────────────────────────────────────────────────────

  const dateScopedRows = useMemo(() => {
    if (!fromDate && !toDate) return enrichedRows
    return enrichedRows.filter((r) => {
      if (!r.dateKey) return false
      if (fromDate && r.dateKey < fromDate) return false
      if (toDate && r.dateKey > toDate) return false
      return true
    })
  }, [enrichedRows, fromDate, toDate])

  // ── Branch options + filter ───────────────────────────────────────────────

  const branches = useMemo(() => {
    const s = new Set(dateScopedRows.map((r) => getBranchLabel(r.location ?? r.branch)))
    return Array.from(s).sort((a, b) => {
      if (a === UNKNOWN_BRANCH) return 1
      if (b === UNKNOWN_BRANCH) return -1
      return a.localeCompare(b)
    })
  }, [dateScopedRows])

  useEffect(() => {
    if (branchFilter !== 'all' && !branches.includes(branchFilter)) setBranchFilter('all')
  }, [branchFilter, branches])

  const branchFilteredRows = useMemo(() =>
    branchFilter === 'all'
      ? dateScopedRows
      : dateScopedRows.filter((r) => getBranchLabel(r.location ?? r.branch) === branchFilter),
  [dateScopedRows, branchFilter])

  const portalOptions = useMemo(() => {
    const values = new Set(branchFilteredRows.map((r) => getPortalLabel(r.portal)))
    return Array.from(values).sort((a, b) => {
      if (a === UNKNOWN_PORTAL) return 1
      if (b === UNKNOWN_PORTAL) return -1
      return a.localeCompare(b)
    })
  }, [branchFilteredRows])

  useEffect(() => {
    if (portalFilter === 'all') return
    if (!portalOptions.includes(portalFilter)) setPortalFilter('all')
  }, [portalFilter, portalOptions])

  const filteredRows = useMemo(() =>
    portalFilter === 'all'
      ? branchFilteredRows
      : branchFilteredRows.filter((r) => getPortalLabel(r.portal) === portalFilter),
  [branchFilteredRows, portalFilter])

  // ── Department filter ──────────────────────────────────────────────────────
  // Build a map of SA name → department (case-insensitive match)
  const saNameToDept = useMemo(() => {
    const map = new Map<string, string>()
    saEmployees.forEach(e => {
      if (e.employee_name && e.department) {
        map.set(e.employee_name.trim().toUpperCase(), e.department.trim())
      }
    })
    return map
  }, [saEmployees])

  // Collect distinct departments present in current filteredRows
  const deptOptions = useMemo(() => {
    const depts = new Set<string>()
    filteredRows.forEach(r => {
      const name = String(r.sr_assigned_to ?? '').trim().toUpperCase()
      const dept = saNameToDept.get(name)
      if (dept) depts.add(dept)
    })
    return Array.from(depts).sort()
  }, [filteredRows, saNameToDept])

  const deptFilteredRows = useMemo(() => {
    if (deptFilter === 'all') return filteredRows
    return filteredRows.filter(r => {
      const name = String(r.sr_assigned_to ?? '').trim().toUpperCase()
      const dept = saNameToDept.get(name) ?? ''
      return dept.toLowerCase() === deptFilter.toLowerCase()
    })
  }, [filteredRows, deptFilter, saNameToDept])

  // ── SA summary cards ──────────────────────────────────────────────────────

  const saCards = useMemo<SASummaryCard[]>(() => {
    const map = new Map<string, SASummaryCard & { days: Set<string> }>()

    deptFilteredRows.forEach((r) => {
      const name = String(r.sr_assigned_to ?? '').trim()
      if (!name) return
      const dateKey = r.dateKey ?? 'unknown'

      const existing = map.get(name) ?? {
        name, jcCount: 0, dayCount: 0,
        totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0,
        days: new Set<string>(),
      }

      existing.jcCount += 1
      existing.totalLabour += r.labourAmt
      existing.totalSpares += r.sparesAmt
      existing.totalInvoice += r.invoiceAmt
      existing.days.add(dateKey)
      existing.dayCount = existing.days.size
      map.set(name, existing)
    })

    return Array.from(map.values())
      .map(({ days: _d, ...card }) => ({
        ...card,
        totalIncome: calculateSAIncome(card.totalLabour, saSharePercent),
      }))
      .sort((a, b) => b.totalInvoice - a.totalInvoice || b.jcCount - a.jcCount)
  }, [filteredRows, saSharePercent])

  // ── Day cards for selected SA ─────────────────────────────────────────────

  const selectedSARows = useMemo(() => {
    if (!selectedSA) return []
    return deptFilteredRows.filter((r) => String(r.sr_assigned_to ?? '').trim() === selectedSA)
  }, [deptFilteredRows, selectedSA])

  const dayCards = useMemo<DayWiseCard[]>(() => {
    const map = new Map<string, DayWiseCard>()
    selectedSARows.forEach((r) => {
      const dateKey = r.dateKey ?? 'unknown'
      const existing = map.get(dateKey) ?? {
        dateKey, label: dateLabel(dateKey),
        jcCount: 0, totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0,
      }
      existing.jcCount += 1
      existing.totalLabour += r.labourAmt
      existing.totalSpares += r.sparesAmt
      existing.totalInvoice += r.invoiceAmt
      existing.totalIncome = calculateSAIncome(existing.totalLabour, saSharePercent)
      map.set(dateKey, existing)
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.dateKey === 'unknown') return 1
      if (b.dateKey === 'unknown') return -1
      return b.dateKey.localeCompare(a.dateKey)
    })
  }, [selectedSARows, saSharePercent])

  // ── JC detail rows for selected day ──────────────────────────────────────

  const dayDetailRows = useMemo(() => {
    if (!selectedDayKey) return []
    return selectedSARows.filter((r) => (r.dateKey ?? 'unknown') === selectedDayKey)
  }, [selectedSARows, selectedDayKey])

  // ── Totals ────────────────────────────────────────────────────────────────

  const totals = useMemo(() => ({
    labour: deptFilteredRows.reduce((s, r) => s + r.labourAmt, 0),
    spares: deptFilteredRows.reduce((s, r) => s + r.sparesAmt, 0),
    invoice: deptFilteredRows.reduce((s, r) => s + r.invoiceAmt, 0),
    jcCount: deptFilteredRows.length,
    saCount: saCards.length,
  }), [deptFilteredRows, saCards])


  const parsedDraftSaShare = useMemo(
    () => normalizeShareInput(draftSaShare, saSharePercent),
    [draftSaShare, saSharePercent],
  )
  const parsedDraftEvShare = useMemo(
    () => normalizeShareInput(draftEvShare, evSharePercent),
    [draftEvShare, evSharePercent],
  )
  const hasPendingShareChanges = parsedDraftSaShare !== saSharePercent || parsedDraftEvShare !== evSharePercent

  // Reset drill-down when SA list changes
  useEffect(() => {
    if (selectedSA && !saCards.some((c) => c.name === selectedSA)) {
      setSelectedSA('')
      setSelectedDayKey('')
    }
  }, [saCards, selectedSA])

  useEffect(() => {
    if (selectedDayKey && !dayCards.some((c) => c.dateKey === selectedDayKey)) {
      setSelectedDayKey('')
    }
  }, [dayCards, selectedDayKey])

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-loading">
        <Icon name="spinner" size={24} className="spin" />
        <p>Loading SA tracker…</p>
      </div>
    )
  }

  return (
    <div className="page" style={{ padding: '0.75rem' }}>

      {/* ── TOP CONTROL BAR ───────────────────────────────────────────────── */}
      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '0.55rem 0.85rem',
        marginBottom: '0.6rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.45rem',
      }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.25rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>🧑‍💼 SA Tracker</span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>
            {totals.jcCount.toLocaleString('en-IN')} JCs
          </span>
        </div>

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        {/* Period dropdown */}
        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginRight: '2px' }}>Period:</label>
        <select
          value={periodPreset}
          onChange={e => handlePeriodPreset(e.target.value)}
          style={{
            fontSize: '0.78rem', fontWeight: 600,
            color: '#0f172a',
            border: '1.5px solid #3b82f6',
            borderRadius: '6px', padding: '0.22rem 1.6rem 0.22rem 0.5rem',
            background: '#eff6ff',
            outline: 'none', cursor: 'pointer', appearance: 'auto',
          }}>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="this-week">This Week</option>
          <option value="this-month">This Month</option>
          <option value="last-month">Last Month</option>
          <option value="custom">Custom Range</option>
        </select>
        {periodPreset === 'custom' && (
          <>
            <input type="date" className="inp"
              style={{ padding: '0.22rem 0.4rem', fontSize: '0.75rem', width: '126px', borderRadius: '6px' }}
              value={dateRange.from}
              onChange={e => setDateRange(r => ({ ...r, from: e.target.value }))}
            />
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>→</span>
            <input type="date" className="inp"
              style={{ padding: '0.22rem 0.4rem', fontSize: '0.75rem', width: '126px', borderRadius: '6px' }}
              value={dateRange.to}
              onChange={e => setDateRange(r => ({ ...r, to: e.target.value }))}
            />
          </>
        )}

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        {/* Location dropdown */}
        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginRight: '2px' }}>Loc:</label>
        <select
          value={branchFilter}
          onChange={e => setBranchFilter(e.target.value)}
          style={{
            fontSize: '0.78rem', fontWeight: branchFilter !== 'all' ? 600 : 400,
            color: branchFilter !== 'all' ? '#0f172a' : '#475569',
            border: `1.5px solid ${branchFilter !== 'all' ? '#3b82f6' : '#cbd5e1'}`,
            borderRadius: '6px', padding: '0.22rem 1.6rem 0.22rem 0.5rem',
            background: branchFilter !== 'all' ? '#eff6ff' : '#f8fafc',
            outline: 'none', cursor: 'pointer', appearance: 'auto',
          }}>
          <option value="all">All ({dateScopedRows.length})</option>
          {branches.map(b => (
            <option key={b} value={b}>
              {b} ({dateScopedRows.filter(r => getBranchLabel(r.location ?? r.branch) === b).length})
            </option>
          ))}
        </select>

        {/* Portal dropdown */}
        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginRight: '2px' }}>Portal:</label>
        <select
          value={portalFilter}
          onChange={e => setPortalFilter(e.target.value)}
          style={{
            fontSize: '0.78rem', fontWeight: portalFilter !== 'all' ? 600 : 400,
            color: portalFilter !== 'all' ? '#0f172a' : '#475569',
            border: `1.5px solid ${portalFilter !== 'all' ? '#3b82f6' : '#cbd5e1'}`,
            borderRadius: '6px', padding: '0.22rem 1.6rem 0.22rem 0.5rem',
            background: portalFilter !== 'all' ? '#eff6ff' : '#f8fafc',
            outline: 'none', cursor: 'pointer', appearance: 'auto',
          }}>
          <option value="all">All ({branchFilteredRows.length})</option>
          {portalOptions.map(portal => (
            <option key={portal} value={portal}>
              {portal} ({branchFilteredRows.filter(r => getPortalLabel(r.portal) === portal).length})
            </option>
          ))}
        </select>

        {/* Department dropdown */}
        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginRight: '2px' }}>Dept:</label>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          style={{
            fontSize: '0.78rem', fontWeight: deptFilter !== 'all' ? 600 : 400,
            color: deptFilter !== 'all' ? '#0f172a' : '#475569',
            border: `1.5px solid ${deptFilter !== 'all' ? '#8b5cf6' : '#cbd5e1'}`,
            borderRadius: '6px', padding: '0.22rem 1.6rem 0.22rem 0.5rem',
            background: deptFilter !== 'all' ? '#f5f3ff' : '#f8fafc',
            outline: 'none', cursor: 'pointer', appearance: 'auto',
          }}>
          <option value="all">All ({filteredRows.length})</option>
          {deptOptions.map(dept => (
            <option key={dept} value={dept}>
              {dept} ({filteredRows.filter(r => (saNameToDept.get(String(r.sr_assigned_to ?? '').trim().toUpperCase()) ?? '').toLowerCase() === dept.toLowerCase()).length})
            </option>
          ))}
        </select>

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Report buttons */}
        <button type="button" onClick={() => void handleGenerateSAYesterdayReport()} disabled={generatingReport}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', opacity: generatingReport ? 0.7 : 1 }}>
          📥 {generatingReport ? 'Loading…' : 'Yesterday'}
        </button>
        <button type="button" onClick={() => setShowPivotReport(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
          📊 Pivot
        </button>
      </div>

      {error && (
        <div className="toast error" style={{ marginBottom: '0.6rem' }}>
          <Icon name="alert" size={14} />
          {error}
        </div>
      )}

      {/* ── STATS BAR ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '0.45rem',
        marginBottom: '0.6rem',
      }}>
        {[
          { label: 'SAs', value: String(totals.saCount), color: '#6366f1', bg: '#eef2ff' },
          { label: 'Job Cards', value: totals.jcCount.toLocaleString('en-IN'), color: '#2563eb', bg: '#eff6ff' },
          { label: 'Total Labour', value: formatCurrency(totals.labour), color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Total Spares', value: formatCurrency(totals.spares), color: '#9333ea', bg: '#fdf4ff' },
          { label: 'Total Invoice', value: formatCurrency(totals.invoice), color: '#ea580c', bg: '#fff7ed' },
          { label: `SA Income (${saSharePercent}%)`, value: formatCurrency(totals.labour * saSharePercent / 100), color: '#2563eb', bg: '#eff6ff', bold: true },
        ].map(({ label, value, color, bg, bold }) => (
          <div key={label} style={{ background: bg, borderRadius: '8px', padding: '0.5rem 0.75rem', border: `1px solid ${color}22` }}>
            <div style={{ fontSize: bold ? '1rem' : '0.92rem', fontWeight: bold ? 800 : 700, color }}>{value}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.1rem' }}>{label}</div>
          </div>
        ))}


      </div>

      {/* ── SA Cards ── */}
      {!loading && saCards.length > 0 && (
        <div className="card mb-gap" style={{ marginBottom: '0.6rem' }}>
          <div className="card__head">
            <div>
              <h3>Earnings by Service Advisor</h3>
              <div className="sub">Sorted by total invoice value. Income = Labour × {saSharePercent}%. Click an SA to drill down by day.</div>
            </div>
            {canEditSharePercent && (
              <div className="tech-share-corner">
                <h3>Earnings percentage settings</h3>
                <div className="tech-share-controls">
                  <label className="field field--no-gap tech-share-field">
                    <span className="label">SA %</span>
                    <input
                      className="inp"
                      inputMode="decimal"
                      value={draftSaShare}
                      onChange={(e) => setDraftSaShare(e.target.value)}
                      onBlur={() => setDraftSaShare(String(parsedDraftSaShare))}
                      placeholder="3"
                    />
                  </label>
                  <label className="field field--no-gap tech-share-field">
                    <span className="label">EV %</span>
                    <input
                      className="inp"
                      inputMode="decimal"
                      value={draftEvShare}
                      onChange={(e) => setDraftEvShare(e.target.value)}
                      onBlur={() => setDraftEvShare(String(parsedDraftEvShare))}
                      placeholder="3"
                    />
                  </label>
                  <div className="tech-share-actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={async () => {
                        setSaSharePercent(parsedDraftSaShare)
                        setEvSharePercent(parsedDraftEvShare)
                        const { error: saveErr } = await supabase.from('sa_earnings_settings').upsert([
                          { key: 'sa_share_percent', value: String(parsedDraftSaShare) },
                          { key: 'ev_share_percent', value: String(parsedDraftEvShare) },
                        ], { onConflict: 'key' })
                        if (saveErr) alert('Save failed: ' + saveErr.message)
                      }}
                      disabled={!hasPendingShareChanges}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={async () => {
                        setSaSharePercent(DEFAULT_SA_SHARE_PERCENT)
                        setEvSharePercent(DEFAULT_EV_SHARE_PERCENT)
                        setDraftSaShare(String(DEFAULT_SA_SHARE_PERCENT))
                        setDraftEvShare(String(DEFAULT_EV_SHARE_PERCENT))
                        const { error: saveErr } = await supabase.from('sa_earnings_settings').upsert([
                          { key: 'sa_share_percent', value: String(DEFAULT_SA_SHARE_PERCENT) },
                          { key: 'ev_share_percent', value: String(DEFAULT_EV_SHARE_PERCENT) },
                        ], { onConflict: 'key' })
                        if (saveErr) alert('Reset failed: ' + saveErr.message)
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
              {saCards.map((card) => (
                <button
                  key={card.name}
                  type="button"
                  className={`tech-drill-btn ${selectedSA === card.name ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedSA === card.name) { setSelectedSA(''); setSelectedDayKey('') }
                    else { setSelectedSA(card.name); setSelectedDayKey('') }
                  }}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.name}</div>
                    <div className="tech-drill-btn__code">{card.jcCount} JCs • {card.dayCount} days</div>
                  </div>
                  <div className="tech-drill-btn__value" style={{ color: '#2563eb' }}>{formatCurrency(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Invoice: {formatCurrency(card.totalInvoice)}</span>
                    <span style={{ fontSize: '11px' }}>
                      <span style={{ color: '#16a34a' }}>L: {formatCurrency(card.totalLabour)}</span>
                      {' · '}
                      <span style={{ color: '#9333ea' }}>S: {formatCurrency(card.totalSpares)}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Day cards for selected SA ── */}
      {selectedSA && dayCards.length > 0 && (
        <div className="card mb-gap" style={{ marginBottom: '0.6rem' }}>
          <div className="card__head" style={{ padding: '0.5rem 0.85rem', minHeight: 'unset' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{selectedSA} — by Day</span>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>click a day to see job cards</span>
            </div>
            <button type="button" className="btn btn--ghost btn--sm"
              style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => { setSelectedSA(''); setSelectedDayKey('') }}>
              ✕
            </button>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid">
              {dayCards.map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  className={`tech-drill-btn ${selectedDayKey === day.dateKey ? 'is-active' : ''}`}
                  onClick={() => setSelectedDayKey(selectedDayKey === day.dateKey ? '' : day.dateKey)}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{day.label}</div>
                    <div className="tech-drill-btn__code">{day.jcCount} JCs</div>
                  </div>
                  <div className="tech-drill-btn__value" style={{ color: '#2563eb' }}>{formatCurrency(day.totalIncome)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Invoice: {formatCurrency(day.totalInvoice)}</span>
                    <span style={{ fontSize: '11px' }}>
                      <span style={{ color: '#16a34a' }}>L: {formatCurrency(day.totalLabour)}</span>
                      {' · '}
                      <span style={{ color: '#9333ea' }}>S: {formatCurrency(day.totalSpares)}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── JC detail table for selected day ── */}
      {selectedDayKey && dayDetailRows.length > 0 && (
        <div className="card mb-gap" style={{ marginBottom: '0.6rem' }}>
          <div className="card__head" style={{ padding: '0.5rem 0.85rem', minHeight: 'unset' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{selectedSA} — {dateLabel(selectedDayKey)}</span>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{dayDetailRows.length} JC{dayDetailRows.length !== 1 ? 's' : ''}</span>
            </div>
            <button type="button" className="btn btn--ghost btn--sm"
              style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => setSelectedDayKey('')}>
              ✕
            </button>
          </div>
          <div className="card__body" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job Card</th>
                  <th>Reg No</th>
                  <th>Branch</th>
                  <th>SR Type</th>
                  <th>Closed At</th>
                  <th style={{ textAlign: 'right' }}>Labour</th>
                  <th style={{ textAlign: 'right' }}>Spares</th>
                  <th style={{ textAlign: 'right' }}>Total Invoice</th>
                  <th style={{ textAlign: 'right', color: '#2563eb' }}>SA Income ({saSharePercent}%)</th>
                </tr>
              </thead>
              <tbody>
                {dayDetailRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code style={{ fontSize: '11px', background: '#eff6ff', color: '#2563eb', borderRadius: '4px', padding: '2px 6px' }}>
                        {r.job_card_number}
                      </code>
                    </td>
                    <td>{r.vehicle_registration_number ?? '—'}</td>
                    <td>{r.branch ?? '—'}</td>
                    <td>{r.sr_type ?? '—'}</td>
                    <td style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(r.closed_date_time)}</td>
                    <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{formatCurrency(r.labourAmt)}</td>
                    <td style={{ textAlign: 'right', color: '#9333ea', fontWeight: 600 }}>{formatCurrency(r.sparesAmt)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(r.invoiceAmt)}</td>
                    <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>{formatCurrency(calculateSAIncome(r.labourAmt, saSharePercent))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td colSpan={5}>Day Total</td>
                  <td style={{ textAlign: 'right', color: '#16a34a' }}>
                    {formatCurrency(dayDetailRows.reduce((s, r) => s + r.labourAmt, 0))}
                  </td>
                  <td style={{ textAlign: 'right', color: '#9333ea' }}>
                    {formatCurrency(dayDetailRows.reduce((s, r) => s + r.sparesAmt, 0))}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {formatCurrency(dayDetailRows.reduce((s, r) => s + r.invoiceAmt, 0))}
                  </td>
                  <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>
                    {formatCurrency(dayDetailRows.reduce((s, r) => s + calculateSAIncome(r.labourAmt, saSharePercent), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && saCards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No SA data found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {fromDate || toDate ? 'Try widening the date range.' : 'Upload job card data to see SA earnings.'}
          </div>
        </div>
      )}

      {/* ── SA Yesterday Report Modal ─────────────────────────── */}
      {yesterdaySAReport && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setYesterdaySAReport(null) }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '860px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>📊 SA Report — {yesterdaySAReport.date}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>{yesterdaySAReport.rows.length} job cards · SA Share: {saSharePercent}%</div>
              </div>
              <button onClick={() => setYesterdaySAReport(null)} style={{ border: 'none', background: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', padding: '0.85rem 1.25rem', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              <button onClick={() => downloadSAYesterdayExcel(yesterdaySAReport.rows, yesterdaySAReport.date)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer' }}>
                📥 Download Excel
              </button>
              <a href={'https://wa.me/?text=' + encodeURIComponent(yesterdaySAReport.waText)}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: '#25D366', color: '#fff', borderRadius: '7px', fontWeight: 600, fontSize: '0.83rem', textDecoration: 'none' }}>
                📤 Share on WhatsApp
              </a>
              <button onClick={() => { navigator.clipboard.writeText(yesterdaySAReport.waText); alert('Copied to clipboard!') }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '7px', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer' }}>
                📋 Copy Text
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem' }}>
              {yesterdaySAReport.rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>No closed jobs found for yesterday.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      {['Service Advisor', 'Job Card', 'Reg No', 'Branch', 'Labour Amount', 'Amount Paid'].map(h => (
                        <th key={h} style={{ padding: '0.55rem 0.75rem', textAlign: h === 'Labour Amount' || h === 'Amount Paid' ? 'right' : 'left', fontWeight: 600, color: '#475569', fontSize: '0.76rem', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let lastSA = ''
                      return yesterdaySAReport.rows.map((r, i) => {
                        const isNewSA = r.sa_name !== lastSA
                        lastSA = r.sa_name
                        const saRows = yesterdaySAReport.rows.filter(x => x.sa_name === r.sa_name)
                        const saTotal = saRows.reduce((s, x) => s + x.sa_income, 0)
                        const saLabour = saRows.reduce((s, x) => s + x.labour_amount, 0)
                        return (
                          <>
                            {isNewSA && (
                              <tr key={'hdr-' + i} style={{ background: '#f0f9ff' }}>
                                <td colSpan={4} style={{ padding: '0.45rem 0.75rem', fontWeight: 700, color: '#0369a1', fontSize: '0.83rem' }}>
                                  🧑‍💼 {r.sa_name}
                                </td>
                                <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#0369a1' }}>₹{Math.round(saLabour).toLocaleString('en-IN')}</td>
                                <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: 800, color: '#16a34a', fontSize: '0.85rem' }}>₹{Math.round(saTotal).toLocaleString('en-IN')}</td>
                              </tr>
                            )}
                            <tr key={r.job_card_number + i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                              <td style={{ padding: '0.5rem 0.75rem 0.5rem 1.5rem', color: '#64748b', fontSize: '0.78rem' }}>{r.sa_name}</td>
                              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.76rem', color: '#334155' }}>{r.job_card_number}</td>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#1e293b' }}>{r.reg_number}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#64748b', fontSize: '0.78rem' }}>{r.branch}</td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#334155' }}>₹{Math.round(r.labour_amount).toLocaleString('en-IN')}</td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>₹{Math.round(r.sa_income).toLocaleString('en-IN')}</td>
                            </tr>
                          </>
                        )
                      })
                    })()}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={4} style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#1e293b' }}>TOTAL ({yesterdaySAReport.rows.length} job cards)</td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>
                        ₹{Math.round(yesterdaySAReport.rows.reduce((s, r) => s + r.labour_amount, 0)).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 800, color: '#16a34a', fontSize: '0.9rem' }}>
                        ₹{Math.round(yesterdaySAReport.rows.reduce((s, r) => s + r.sa_income, 0)).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SA Pivot Report Modal ─────────────────────────────── */}
      {showPivotReport && (() => {
        const pivot     = new Map<string, Map<string, number>>()
        const colTotals = new Map<string, number>()
        const rowTotals = new Map<string, number>()
        let grandTotal  = 0

        filteredRows.forEach(r => {
          const dateKey = r.dateKey
          if (!dateKey) return
          const saName  = String(r.sr_assigned_to ?? '').trim()
          if (!saName) return
          const income  = calculateSAIncome(r.labourAmt, saSharePercent)
          if (income <= 0) return

          if (!pivot.has(dateKey)) pivot.set(dateKey, new Map())
          pivot.get(dateKey)!.set(saName, (pivot.get(dateKey)!.get(saName) ?? 0) + income)
          colTotals.set(saName, (colTotals.get(saName) ?? 0) + income)
          rowTotals.set(dateKey, (rowTotals.get(dateKey) ?? 0) + income)
          grandTotal += income
        })

        const dates = Array.from(pivot.keys()).sort()
        const sas   = Array.from(colTotals.entries()).sort((a, b) => b[1] - a[1]).map(([s]) => s)
        const fmt   = (n: number) => n > 0 ? '₹' + Math.round(n).toLocaleString('en-IN') : '—'

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            onClick={e => { if (e.target === e.currentTarget) setShowPivotReport(false) }}>
            <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '98vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>📊 SA Pivot Report</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Dates (rows) × Service Advisors (columns) · Value = Earning Amount · {dates.length} days · {sas.length} SAs
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <button onClick={() => downloadSAPivotExcel(dates, sas, pivot, rowTotals, colTotals, grandTotal)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                    📥 Download Excel
                  </button>
                  <button onClick={() => setShowPivotReport(false)} style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'auto' }}>
                {dates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>No earning data in the selected range.</div>
                ) : (
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ padding: '0.65rem 0.9rem', textAlign: 'left', fontWeight: 700, color: '#1e293b', borderBottom: '2px solid #e2e8f0', borderRight: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>📅 Date</th>
                        {sas.map(s => (
                          <th key={s} style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontSize: '0.75rem', minWidth: '130px' }}>
                            🧑‍💼 {s}
                          </th>
                        ))}
                        <th style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#1e293b', borderBottom: '2px solid #e2e8f0', borderLeft: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc', position: 'sticky', right: 0, zIndex: 2 }}>Day Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dates.map((date, di) => {
                        const dayMap   = pivot.get(date) ?? new Map()
                        const rowTotal = rowTotals.get(date) ?? 0
                        return (
                          <tr key={date} style={{ background: di % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.55rem 0.9rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', borderRight: '2px solid #e2e8f0', position: 'sticky', left: 0, background: di % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1 }}>{date}</td>
                            {sas.map(s => {
                              const val = dayMap.get(s) ?? 0
                              return (
                                <td key={s} style={{ padding: '0.55rem 0.75rem', textAlign: 'right', borderRight: '1px solid #f1f5f9', color: val > 0 ? '#0f172a' : '#cbd5e1', fontWeight: val > 0 ? 600 : 400 }}>
                                  {fmt(val)}
                                </td>
                              )
                            })}
                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#1e293b', borderLeft: '2px solid #e2e8f0', position: 'sticky', right: 0, background: di % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1 }}>{fmt(rowTotal)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f0f9ff', borderTop: '2px solid #0369a1' }}>
                        <td style={{ padding: '0.65rem 0.9rem', fontWeight: 800, color: '#0369a1', borderRight: '2px solid #e2e8f0', position: 'sticky', left: 0, background: '#f0f9ff', zIndex: 1, whiteSpace: 'nowrap' }}>🏆 TOTAL</td>
                        {sas.map(s => (
                          <td key={s} style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 800, color: '#16a34a', borderRight: '1px solid #e2e8f0', fontSize: '0.83rem' }}>{fmt(colTotals.get(s) ?? 0)}</td>
                        ))}
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 900, color: '#16a34a', fontSize: '0.9rem', borderLeft: '2px solid #0369a1', position: 'sticky', right: 0, background: '#f0f9ff', zIndex: 1 }}>{fmt(grandTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
