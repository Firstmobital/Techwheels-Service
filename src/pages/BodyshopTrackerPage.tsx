import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Icon } from '../components/Icon'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

type AccidentJCRow = {
  id: number
  job_card_number: string
  sr_assigned_to: string | null
  final_labour_amount: number | string | null
  dms_final_labour_amount: number | string | null
  final_spares_amount: number | string | null
  total_invoice_amount: number | string | null
  dms_total_invoice_amount: number | string | null
  closed_date_time: string | null
  invoice_date: string | null
  location: string | null
  portal: string | null
  vehicle_registration_number: string | null
  sr_type: string | null
}

// One wide row per JC from bodyshop_assignments
type BSAssignmentRow = {
  job_card_number: string
  supervisor_employee_code: string | null
  supervisor_employee_name: string | null
  dentor_employee_code: string | null
  dentor_employee_name: string | null
  dentor_helper_employee_code: string | null
  dentor_helper_employee_name: string | null
  painter_employee_code: string | null
  painter_employee_name: string | null
  painter_helper_employee_code: string | null
  painter_helper_employee_name: string | null
  technician_employee_code: string | null
  technician_employee_name: string | null
  rubbing_employee_code: string | null
  rubbing_employee_name: string | null
  edp_employee_code: string | null
  edp_employee_name: string | null
  parts_incharge_employee_code: string | null
  parts_incharge_employee_name: string | null
}

// Enriched closed JC (used for SA tab)
type JCDetail = AccidentJCRow & {
  labourAmt: number
  analyticLabourAmt: number
  dmsLabourAmt: number
  sparesAmt: number
  invoiceAmt: number
  dmsInvoiceAmt: number
  dateKey: string | null
}

// Enriched technician row (Dentor / Painter / Technician tabs)
type TechJCRow = {
  job_card_number: string
  technician_name: string
  technician_code: string
  labourAmt: number
  analyticLabourAmt: number
  dmsLabourAmt: number
  sparesAmt: number
  invoiceAmt: number
  dmsInvoiceAmt: number
  location: string | null; sr_type: string | null
  closed_date_time: string | null; invoice_date: string | null
  vehicle_registration_number: string | null
  dateKey: string | null
  _role?: string
}

type MemberCard = {
  name: string; jcCount: number; dayCount: number
  totalLabour: number; totalSpares: number; totalInvoice: number; totalIncome: number
}
type DayCard = {
  dateKey: string; label: string; jcCount: number
  totalLabour: number; totalSpares: number; totalInvoice: number; totalIncome: number
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type TabKey = 'SA' | 'FLOOR_INCHARGE' | 'DENTOR' | 'DENTOR_HELPER' | 'PAINTER' | 'PAINTER_HELPER' | 'TECHNICIAN' | 'RUBBING' | 'EDP' | 'PARTS_INCHARGE'
type TabMeta = { key: TabKey; label: string; icon: string; defaultPct: number; mode: 'sa' | 'tech' }

// Mirrors Bodyshop Floor's current role set exactly (ROLE_META / ALL_ROLES in BodyshopFloorPage.tsx)
const TABS: TabMeta[] = [
  { key: 'SA',             label: 'SA',             icon: '🧑‍💼', defaultPct: 3, mode: 'sa'   },
  { key: 'FLOOR_INCHARGE', label: 'Floor Incharge', icon: '👷', defaultPct: 3, mode: 'tech' },
  { key: 'DENTOR',         label: 'Dentor',         icon: '🔨', defaultPct: 5, mode: 'tech' },
  { key: 'DENTOR_HELPER',  label: 'Dentor Helper',  icon: '🔩', defaultPct: 3, mode: 'tech' },
  { key: 'PAINTER',        label: 'Painter',        icon: '🎨', defaultPct: 5, mode: 'tech' },
  { key: 'PAINTER_HELPER', label: 'Painter Helper', icon: '🖌️', defaultPct: 3, mode: 'tech' },
  { key: 'TECHNICIAN',     label: 'Technician',     icon: '🔧', defaultPct: 4, mode: 'tech' },
  { key: 'RUBBING',        label: 'Rubbing',        icon: '🪣', defaultPct: 2, mode: 'tech' },
  { key: 'EDP',            label: 'EDP',            icon: '🧴', defaultPct: 2, mode: 'tech' },
  { key: 'PARTS_INCHARGE', label: 'Parts Incharge', icon: '📦', defaultPct: 2, mode: 'tech' },
]

const QUERY_PAGE = 1000
const UNKNOWN_LOCATION = 'Unknown location'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}
function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function parseAmt(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v == null) return 0
  const raw = String(v).trim()
  if (!raw) return 0
  const neg = raw.startsWith('(') && raw.endsWith(')')
  const n = Number(raw.replace(/[₹,\s()]/g, '').replace(/RS\.?/gi, ''))
  return Number.isFinite(n) ? (neg ? -n : n) : 0
}
function dateKey(row: { closed_date_time?: string | null; invoice_date?: string | null }): string | null {
  const src = row.closed_date_time ?? row.invoice_date
  if (!src) return null
  const d = new Date(src)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function dayLabel(key: string) {
  return key === 'unknown' ? 'No date' : new Date(key).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })
}
function locationOf(v: string | null | undefined) { return String(v ?? '').trim() || UNKNOWN_LOCATION }
function saIncome(dmsLabour: number, pct: number) {
  if (!Number.isFinite(dmsLabour) || dmsLabour <= 0) return 0
  return (dmsLabour / 1.18) * (pct / 100)
}
function normPct(s: string, fallback: number) {
  const n = Number(s.trim()); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BodyshopTrackerPage() {
  const [loading, setLoading]     = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [error, setError]         = useState<string | null>(null)

  // Raw data
  const [accidentJCs, setAccidentJCs]     = useState<AccidentJCRow[]>([])
  const [bsAssignments, setBsAssignments] = useState<BSAssignmentRow[]>([])

  // UI state
  const [activeTab, setActiveTab]     = useState<TabKey>('SA')
  const [fromDate, setFromDate]       = useState('')
  const [toDate, setToDate]           = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [selectedMember, setSelectedMember] = useState('')
  const [selectedDayKey, setSelectedDayKey] = useState('')

  // Per-tab earning %
  const [sharePct, setSharePct] = useState<Record<TabKey, number>>({
    SA: 3, FLOOR_INCHARGE: 3, DENTOR: 5, DENTOR_HELPER: 3, PAINTER: 5, PAINTER_HELPER: 3, TECHNICIAN: 4, RUBBING: 2, EDP: 2, PARTS_INCHARGE: 2
  })
  const [draftPct, setDraftPct] = useState<Record<TabKey, string>>({
    SA: '3', FLOOR_INCHARGE: '3', DENTOR: '5', DENTOR_HELPER: '3', PAINTER: '5', PAINTER_HELPER: '3', TECHNICIAN: '4', RUBBING: '2', EDP: '2', PARTS_INCHARGE: '2'
  })

  const curPct    = sharePct[activeTab]
  const curDraft  = draftPct[activeTab]
  const parsed    = normPct(curDraft, curPct)
  const hasPend   = parsed !== curPct
  const tabMeta   = TABS.find((t) => t.key === activeTab)!

  // ── Load ───────────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true); setError(null)
    try {
      // 1. Accident JCs in the selected period (SA tab source + join key for tech tabs)
      const accRows: AccidentJCRow[] = []
      let offset = 0
      while (true) {
        const res = await supabase.from('job_card_closed_data')
          .select('id, job_card_number, sr_assigned_to, final_labour_amount, dms_final_labour_amount, final_spares_amount, total_invoice_amount, dms_total_invoice_amount, closed_date_time, invoice_date, location, portal, vehicle_registration_number, sr_type')
          .eq('sr_type', 'Accident')
          .gte('closed_date_time', dateRange.from + 'T00:00:00+05:30')
          .lte('closed_date_time', dateRange.to + 'T23:59:59+05:30')
          .order('closed_date_time', { ascending: false })
          .range(offset, offset + QUERY_PAGE - 1)
        if (res.error) { setError(res.error.message); setLoading(false); return }
        const batch = (res.data ?? []) as AccidentJCRow[]
        accRows.push(...batch)
        if (batch.length < QUERY_PAGE) break
        offset += QUERY_PAGE
      }
      setAccidentJCs(accRows)

      // 2. bodyshop_assignments for tech tabs — one wide row per JC
      //    Use the same JC numbers as the accident JCs already fetched so period + Accident filters are respected
      const accJcNumbers = Array.from(new Set(accRows.map((r) => r.job_card_number).filter(Boolean)))
      const bsRows: BSAssignmentRow[] = []
      for (let i = 0; i < accJcNumbers.length; i += 100) {
        const batch = accJcNumbers.slice(i, i + 100)
        const res = await supabase.from('bodyshop_assignments')
          .select([
            'job_card_number',
            'supervisor_employee_code', 'supervisor_employee_name',
            'dentor_employee_code', 'dentor_employee_name',
            'dentor_helper_employee_code', 'dentor_helper_employee_name',
            'painter_employee_code', 'painter_employee_name',
            'painter_helper_employee_code', 'painter_helper_employee_name',
            'technician_employee_code', 'technician_employee_name',
            'rubbing_employee_code', 'rubbing_employee_name',
            'edp_employee_code', 'edp_employee_name',
            'parts_incharge_employee_code', 'parts_incharge_employee_name',
          ].join(', '))
          .eq('is_active', true)
          .in('job_card_number', batch)
        if (!res.error && res.data) bsRows.push(...(res.data as unknown as BSAssignmentRow[]))
      }
      setBsAssignments(bsRows)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bodyshop data')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadData() }, [dateRange])

  // ── Earning % settings (persisted) ─────────────────────────────────────────
  // Loaded once on mount from bodyshop_role_earning_settings so percentages
  // survive reloads and are shared across everyone viewing the tracker.
  async function loadEarningSettings() {
    const res = await supabase.from('bodyshop_role_earning_settings').select('role, percentage')
    if (!res.error && res.data) {
      const loadedPct: Partial<Record<TabKey, number>> = {}
      const loadedDraft: Partial<Record<TabKey, string>> = {}
      ;(res.data as Array<{ role: string; percentage: number | string }>).forEach((row) => {
        const key = row.role as TabKey
        if (!TABS.some((t) => t.key === key)) return
        const n = Number(row.percentage)
        if (!Number.isFinite(n)) return
        loadedPct[key] = n
        loadedDraft[key] = String(n)
      })
      setSharePct((p) => ({ ...p, ...loadedPct }))
      setDraftPct((p) => ({ ...p, ...loadedDraft }))
    }
  }

  useEffect(() => { void loadEarningSettings() }, [])

  async function persistPct(role: TabKey, pct: number) {
    await supabase.from('bodyshop_role_earning_settings')
      .upsert({ role, percentage: pct, updated_at: new Date().toISOString() }, { onConflict: 'role' })
  }

  // ── Role column mapping for BSAssignmentRow pivot ─────────────────────────

  const BS_ROLE_COLS: Record<Exclude<TabKey, 'SA'>, { code: keyof BSAssignmentRow; name: keyof BSAssignmentRow }> = {
    FLOOR_INCHARGE: { code: 'supervisor_employee_code',      name: 'supervisor_employee_name' },
    DENTOR:         { code: 'dentor_employee_code',          name: 'dentor_employee_name' },
    DENTOR_HELPER:  { code: 'dentor_helper_employee_code',   name: 'dentor_helper_employee_name' },
    PAINTER:        { code: 'painter_employee_code',         name: 'painter_employee_name' },
    PAINTER_HELPER: { code: 'painter_helper_employee_code',  name: 'painter_helper_employee_name' },
    TECHNICIAN:     { code: 'technician_employee_code',      name: 'technician_employee_name' },
    RUBBING:        { code: 'rubbing_employee_code',         name: 'rubbing_employee_name' },
    EDP:            { code: 'edp_employee_code',             name: 'edp_employee_name' },
    PARTS_INCHARGE: { code: 'parts_incharge_employee_code',  name: 'parts_incharge_employee_name' },
  } as const

  // ── Enrich accident JCs ────────────────────────────────────────────────────

  const enrichedAccident = useMemo<JCDetail[]>(() =>
    accidentJCs.map((r) => {
      const analyticL = parseAmt(r.final_labour_amount)
      const dmsL      = parseAmt(r.dms_final_labour_amount)
      return {
        ...r,
        analyticLabourAmt: analyticL,
        dmsLabourAmt:      dmsL,
        labourAmt:         dmsL > 0 ? dmsL : analyticL,  // income base: prefer DMS
        sparesAmt:         parseAmt(r.final_spares_amount),
        invoiceAmt:        parseAmt(r.total_invoice_amount),
        dmsInvoiceAmt:     parseAmt(r.dms_total_invoice_amount),
        dateKey:           dateKey(r),
      }
    }),
  [accidentJCs])

  // ── accidentJCMap: jc_number → AccidentJCRow ──────────────────────────────
  const accidentJCMap = useMemo(() => {
    const m = new Map<string, AccidentJCRow>()
    accidentJCs.forEach((r) => m.set(r.job_card_number, r))
    return m
  }, [accidentJCs])

  // ── Enrich tech assignments (pivot BSAssignmentRow wide cols) ─────────────
  const enrichedTechRows = useMemo<TechJCRow[]>(() => {
    const rows: TechJCRow[] = []
    const nonSaRoles = Object.keys(BS_ROLE_COLS) as Exclude<TabKey, 'SA'>[]
    for (const bsRow of bsAssignments) {
      const jc = accidentJCMap.get(bsRow.job_card_number)
      if (!jc) continue  // not an accident JC in this period
      const analyticL = parseAmt(jc.final_labour_amount)
      const dmsL      = parseAmt(jc.dms_final_labour_amount)
      const base = {
        job_card_number: bsRow.job_card_number,
        analyticLabourAmt: analyticL,
        dmsLabourAmt:      dmsL,
        labourAmt:         analyticL,
        sparesAmt:         parseAmt(jc.final_spares_amount),
        invoiceAmt:        parseAmt(jc.total_invoice_amount),
        dmsInvoiceAmt:     parseAmt(jc.dms_total_invoice_amount),
        location:          jc.location ?? null,
        sr_type:           jc.sr_type ?? null,
        closed_date_time:  jc.closed_date_time ?? null,
        invoice_date:      jc.invoice_date ?? null,
        vehicle_registration_number: jc.vehicle_registration_number ?? null,
        dateKey:           dateKey(jc),
      }
      for (const role of nonSaRoles) {
        const cols = BS_ROLE_COLS[role]
        const code = bsRow[cols.code] as string | null
        const name = bsRow[cols.name] as string | null
        if (!code) continue
        rows.push({ ...base, technician_code: code, technician_name: name ?? code, _role: role })
      }
    }
    return rows
  }, [bsAssignments, accidentJCMap])

  // ── Active rows (union of SA or Tech) ─────────────────────────────────────

  const activeRows = useMemo(() => {
    if (tabMeta.mode === 'sa') return enrichedAccident
    return enrichedTechRows.filter((r) => (r as TechJCRow & { _role?: string })._role === activeTab)
  }, [tabMeta, activeTab, enrichedAccident, enrichedTechRows])

  // ── Date scope ─────────────────────────────────────────────────────────────

  const dateScopedRows = useMemo(() => {
    if (!fromDate && !toDate) return activeRows
    return activeRows.filter((r) => {
      if (!r.dateKey) return false
      if (fromDate && r.dateKey < fromDate) return false
      if (toDate && r.dateKey > toDate) return false
      return true
    })
  }, [activeRows, fromDate, toDate])

  // ── Branch options ─────────────────────────────────────────────────────────

  const branches = useMemo(() => {
    const s = new Set(dateScopedRows.map((r) => locationOf(r.location)))
    return Array.from(s).sort((a, b) => {
      if (a === UNKNOWN_LOCATION) return 1; if (b === UNKNOWN_LOCATION) return -1
      return a.localeCompare(b)
    })
  }, [dateScopedRows])

  // ── Branch filter ──────────────────────────────────────────────────────────

  const filteredRows = useMemo(() =>
    branchFilter === 'all' ? dateScopedRows : dateScopedRows.filter((r) => locationOf(r.location) === branchFilter),
  [dateScopedRows, branchFilter])

  // ── Name extractor ─────────────────────────────────────────────────────────

  function nameOf(r: JCDetail | TechJCRow): string {
    if ('sr_assigned_to' in r) return String((r as JCDetail).sr_assigned_to ?? '').trim()
    return String((r as TechJCRow).technician_name ?? '').trim()
  }

  // ── Member cards ───────────────────────────────────────────────────────────

  const memberCards = useMemo<MemberCard[]>(() => {
    const map = new Map<string, MemberCard & { days: Set<string>; totalDmsLabour: number }>()
    filteredRows.forEach((r) => {
      const name = nameOf(r)
      if (!name) return
      const dk = r.dateKey ?? 'unknown'
      const ex = map.get(name) ?? {
        name, jcCount: 0, dayCount: 0,
        totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0,
        totalDmsLabour: 0, days: new Set<string>(),
      }
      ex.jcCount += 1
      ex.totalLabour += r.labourAmt
      ex.totalDmsLabour += r.dmsLabourAmt
      ex.totalSpares += r.sparesAmt
      ex.totalInvoice += r.invoiceAmt
      ex.days.add(dk)
      ex.dayCount = ex.days.size
      ex.totalIncome = saIncome(ex.totalDmsLabour, curPct)
      map.set(name, ex)
    })
    return Array.from(map.values())
      .map(({ days: _d, totalDmsLabour: _dm, ...c }) => c)
      .sort((a, b) => b.totalInvoice - a.totalInvoice || b.jcCount - a.jcCount)
  }, [filteredRows, curPct])

  // ── Day cards ──────────────────────────────────────────────────────────────

  const memberRows = useMemo(() =>
    filteredRows.filter((r) => nameOf(r) === selectedMember),
  [filteredRows, selectedMember])

  const dayCards = useMemo<DayCard[]>(() => {
    const dmsMap = new Map<string, number>()
    const map = new Map<string, DayCard>()
    memberRows.forEach((r) => {
      const dk = r.dateKey ?? 'unknown'
      const ex = map.get(dk) ?? { dateKey: dk, label: dayLabel(dk), jcCount: 0, totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0 }
      ex.jcCount += 1; ex.totalLabour += r.labourAmt; ex.totalSpares += r.sparesAmt; ex.totalInvoice += r.invoiceAmt
      dmsMap.set(dk, (dmsMap.get(dk) ?? 0) + r.dmsLabourAmt)
      ex.totalIncome = saIncome(dmsMap.get(dk) ?? 0, curPct)
      map.set(dk, ex)
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.dateKey === 'unknown') return 1; if (b.dateKey === 'unknown') return -1
      return b.dateKey.localeCompare(a.dateKey)
    })
  }, [memberRows, curPct])

  // ── JC detail ──────────────────────────────────────────────────────────────

  const dayDetailRows = useMemo(() =>
    memberRows.filter((r) => (r.dateKey ?? 'unknown') === selectedDayKey),
  [memberRows, selectedDayKey])

  // ── Totals ─────────────────────────────────────────────────────────────────

  const totals = useMemo(() => ({
    labour: filteredRows.reduce((s, r) => s + r.labourAmt, 0),
    spares: filteredRows.reduce((s, r) => s + r.sparesAmt, 0),
    invoice: filteredRows.reduce((s, r) => s + r.invoiceAmt, 0),
    jcCount: filteredRows.length,
    memberCount: memberCards.length,
  }), [filteredRows, memberCards])

  // Reset drill-down on tab/filter change
  useEffect(() => { setSelectedMember(''); setSelectedDayKey('') }, [activeTab, branchFilter, fromDate, toDate])

  // ── Branch counts ──────────────────────────────────────────────────────────
  // Use allDateScoped (before branch filter) for branch chip counts
  const allDateScoped = useMemo(() => {
    if (tabMeta.mode === 'sa') return enrichedAccident
    const rows = enrichedTechRows.filter((r) => (r as TechJCRow & { _role?: string })._role === activeTab)
    if (!fromDate && !toDate) return rows
    return rows.filter((r) => {
      if (!r.dateKey) return false
      if (fromDate && r.dateKey < fromDate) return false
      if (toDate && r.dateKey > toDate) return false
      return true
    })
  }, [tabMeta, activeTab, enrichedAccident, enrichedTechRows, fromDate, toDate])

  // ── Export Issues ──────────────────────────────────────────────────────────

  function handleExportIssues() {
    if (!fromDate || !toDate) {
      alert('Select both start and end dates in the Range filter before exporting.')
      return
    }
    if (filteredRows.length === 0) {
      alert('No data to export for the current tab and date range.')
      return
    }

    const label = tabMeta.label
    const isSA  = tabMeta.mode === 'sa'

    const headers = isSA
      ? ['Job Card', 'Reg No', 'SA Name', 'Location', 'SR Type', 'Closed At', 'Analytic Labour', 'Analytic Spares', 'Analytic Total Invoice', `SA Income (${curPct}%)`, 'DMS Labour', 'DMS Total Invoice']
      : ['Job Card', 'Reg No', `${label} Name`, `${label} Code`, 'Location', 'SR Type', 'Closed At', 'Analytic Labour', 'Analytic Spares', 'Analytic Total Invoice', `${label} Income (${curPct}%)`, 'DMS Labour', 'DMS Total Invoice']

    const rows = filteredRows.map((r) => {
      const inc = saIncome(r.dmsLabourAmt, curPct)
      if (isSA) {
        const jr = r as JCDetail
        return [
          jr.job_card_number,
          jr.vehicle_registration_number ?? '',
          String((jr as any).sr_assigned_to ?? '').trim(),
          locationOf(jr.location),
          jr.sr_type ?? '',
          jr.closed_date_time ? new Date(jr.closed_date_time).toLocaleString('en-IN') : '',
          jr.analyticLabourAmt,
          jr.sparesAmt,
          jr.invoiceAmt,
          Number(inc.toFixed(2)),
          jr.dmsLabourAmt,
          jr.dmsInvoiceAmt,
        ]
      } else {
        const tr = r as TechJCRow
        return [
          tr.job_card_number,
          tr.vehicle_registration_number ?? '',
          tr.technician_name,
          tr.technician_code,
          locationOf(tr.location),
          tr.sr_type ?? '',
          tr.closed_date_time ? new Date(tr.closed_date_time).toLocaleString('en-IN') : '',
          tr.analyticLabourAmt,
          tr.sparesAmt,
          tr.invoiceAmt,
          Number(inc.toFixed(2)),
          tr.dmsLabourAmt,
          tr.dmsInvoiceAmt,
        ]
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
    XLSX.utils.book_append_sheet(wb, ws, label)
    XLSX.writeFile(wb, `Bodyshop_${label}_${fromDate}_to_${toDate}.xlsx`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="page-loading">
      <Icon name="spinner" size={24} className="spin" />
      <p>Loading Bodyshop tracker…</p>
    </div>
  )

  return (
    <div className="page">

      {/* ── TOP CONTROL BAR ─────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 0.85rem', marginBottom: '0.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>🔨 Bodyshop Tracker</span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{allDateScoped.length} records</span>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Location:</span>
        <button type="button" onClick={() => setBranchFilter('all')}
          className={`btn btn--sm ${branchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
          All ({allDateScoped.length})
        </button>
        {branches.map((b) => (
          <button key={b} type="button" onClick={() => setBranchFilter(b)}
            className={`btn btn--sm ${branchFilter === b ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            {b} ({allDateScoped.filter((r) => locationOf(r.location) === b).length})
          </button>
        ))}
      </div>

      {error && (
        <div className="toast error"><Icon name="alert" size={14} />{error}</div>
      )}

      {/* ── Role tabs ── */}
      <div className="card mb-gap" style={{ padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {TABS.map((tab) => {
            const tabCount = (() => {
              if (tab.mode === 'sa') return enrichedAccident.length
              return enrichedTechRows.filter((r) => (r as TechJCRow & { _role?: string })._role === tab.key).length
            })()
            return (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: '0 0 auto', padding: '14px 20px', background: 'none', border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                  fontWeight: activeTab === tab.key ? 700 : 400,
                  color: activeTab === tab.key ? '#2563eb' : '#64748b',
                  cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap',
                }}>
                {tab.icon} {tab.label}
                <span style={{ marginLeft: 6, fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>({tabCount})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── STATS BAR ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem', marginBottom: '0.6rem' }}>
        {[
          { label: `${tabMeta.label}s`,             value: String(totals.memberCount),                      color: '#6366f1', bg: '#eef2ff' },
          { label: 'Job Cards',                      value: totals.jcCount.toLocaleString('en-IN'),           color: '#2563eb', bg: '#eff6ff' },
          { label: 'Total Labour',                   value: fmt(totals.labour),                               color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Total Spares',                   value: fmt(totals.spares),                               color: '#9333ea', bg: '#fdf4ff' },
          { label: 'Total Invoice',                  value: fmt(totals.invoice),                              color: '#ea580c', bg: '#fff7ed' },
          { label: `${tabMeta.label} Income (${curPct}%)`, value: fmt(saIncome(filteredRows.reduce((s, r) => s + r.dmsLabourAmt, 0), curPct)), color: '#2563eb', bg: '#eff6ff', bold: true },
        ].map(({ label, value, color, bg, bold }) => (
          <div key={label} style={{ background: bg, borderRadius: '8px', padding: '0.5rem 0.75rem', border: `1px solid ${color}22` }}>
            <div style={{ fontSize: bold ? '1rem' : '0.92rem', fontWeight: bold ? 800 : 700, color }}>{value}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.1rem' }}>{label}</div>
          </div>
        ))}
        {/* Date range fine-filter */}
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.45rem 0.65rem', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', gridColumn: 'span 3' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>📅 Range:</span>
          <input type="date" className="inp" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: '130px' }}
            value={fromDate} onChange={(e) => { const v = e.target.value; setFromDate(v); if (toDate && v > toDate) setToDate(v) }} />
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>→</span>
          <input type="date" className="inp" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: '130px' }}
            value={toDate} onChange={(e) => { const v = e.target.value; setToDate(v); if (fromDate && v < fromDate) setFromDate(v) }} />
          {(fromDate || toDate) && (
            <button type="button" className="btn btn--ghost btn--sm" style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
              onClick={() => { setFromDate(''); setToDate('') }}>✕</button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            style={{ padding: '0.2rem 0.75rem', fontSize: '0.72rem', opacity: (fromDate && toDate) ? 1 : 0.5 }}
            onClick={handleExportIssues}
          >
            📥 Export Issues
          </button>
        </div>
      </div>

      {/* ── Earnings % settings — always visible, regardless of whether this role has data yet ── */}
      <div className="card mb-gap">
        <div className="card__head">
          <div>
            <h3>{tabMeta.icon} {tabMeta.label} — Earnings %</h3>
            <div className="sub">Income = (DMS Labour ÷ 1.18) × {curPct}%. This is used to calculate payout for {tabMeta.label}.</div>
          </div>
          <div className="tech-share-corner">
            <h3>Earnings % — {tabMeta.label}</h3>
            <div className="tech-share-controls">
              <label className="field field--no-gap tech-share-field">
                <span className="label">{tabMeta.label} %</span>
                <input className="inp" inputMode="decimal" value={curDraft}
                  onChange={(e) => setDraftPct((p) => ({ ...p, [activeTab]: e.target.value }))}
                  onBlur={() => setDraftPct((p) => ({ ...p, [activeTab]: String(parsed) }))}
                  placeholder={String(tabMeta.defaultPct)} />
              </label>
              <div className="tech-share-actions">
                <button type="button" className="btn btn--primary btn--sm" disabled={!hasPend}
                  onClick={() => {
                    setSharePct((p) => ({ ...p, [activeTab]: parsed }))
                    void persistPct(activeTab, parsed)
                  }}>Apply</button>
                <button type="button" className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setSharePct((p) => ({ ...p, [activeTab]: tabMeta.defaultPct }))
                    setDraftPct((p) => ({ ...p, [activeTab]: String(tabMeta.defaultPct) }))
                    void persistPct(activeTab, tabMeta.defaultPct)
                  }}>Reset</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Member cards ── */}
      {memberCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{tabMeta.icon} {tabMeta.label} — Revenue</h3>
              <div className="sub">Income = (DMS Labour ÷ 1.18) × {curPct}%. Click a member to drill down by day.</div>
            </div>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid">
              {memberCards.map((card) => (
                <button key={card.name} type="button"
                  className={`tech-drill-btn ${selectedMember === card.name ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedMember === card.name) { setSelectedMember(''); setSelectedDayKey('') }
                    else { setSelectedMember(card.name); setSelectedDayKey('') }
                  }}>
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.name}</div>
                    <div className="tech-drill-btn__code">{card.jcCount} JCs · {card.dayCount} days</div>
                  </div>
                  <div className="tech-drill-btn__value" style={{ color: '#2563eb' }}>{fmt(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Invoice: {fmt(card.totalInvoice)}</span>
                    <span style={{ fontSize: 11 }}>
                      <span style={{ color: '#16a34a' }}>L: {fmt(card.totalLabour)}</span>
                      {' · '}
                      <span style={{ color: '#9333ea' }}>S: {fmt(card.totalSpares)}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Day cards ── */}
      {selectedMember && dayCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedMember} — by Day</h3>
              <div className="sub">Click a day to see individual job cards.</div>
            </div>
            <button type="button" className="btn btn--ghost btn--sm"
              onClick={() => { setSelectedMember(''); setSelectedDayKey('') }}>✕ Close</button>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid">
              {dayCards.map((day) => (
                <button key={day.dateKey} type="button"
                  className={`tech-drill-btn ${selectedDayKey === day.dateKey ? 'is-active' : ''}`}
                  onClick={() => setSelectedDayKey(selectedDayKey === day.dateKey ? '' : day.dateKey)}>
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{day.label}</div>
                    <div className="tech-drill-btn__code">{day.jcCount} JCs</div>
                  </div>
                  <div className="tech-drill-btn__value" style={{ color: '#2563eb' }}>{fmt(day.totalIncome)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Invoice: {fmt(day.totalInvoice)}</span>
                    <span style={{ fontSize: 11 }}>
                      <span style={{ color: '#16a34a' }}>L: {fmt(day.totalLabour)}</span>
                      {' · '}
                      <span style={{ color: '#9333ea' }}>S: {fmt(day.totalSpares)}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── JC detail table ── */}
      {selectedDayKey && dayDetailRows.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedMember} — {dayLabel(selectedDayKey)}</h3>
              <div className="sub">{dayDetailRows.length} job card{dayDetailRows.length !== 1 ? 's' : ''}</div>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedDayKey('')}>✕ Close</button>
          </div>
          <div className="card__body" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job Card</th>
                  <th>Reg No</th>
                  <th>Location</th>
                  <th>SR Type</th>
                  <th>Closed At</th>
                  <th style={{ textAlign: 'right' }}>Analytic Labour</th>
                  <th style={{ textAlign: 'right' }}>Analytic Spares</th>
                  <th style={{ textAlign: 'right' }}>Analytic Total Invoice</th>
                  <th style={{ textAlign: 'right', color: '#2563eb' }}>{tabMeta.label} Income ({curPct}%)</th>
                  <th style={{ textAlign: 'right', color: '#15803d' }}>DMS Labour</th>
                  <th style={{ textAlign: 'right', color: '#0f766e' }}>DMS Total Invoice</th>
                </tr>
              </thead>
              <tbody>
                {dayDetailRows.map((r, idx) => (
                  <tr key={idx}>
                    <td>
                      <code style={{ fontSize: 11, background: '#eff6ff', color: '#2563eb', borderRadius: 4, padding: '2px 6px' }}>
                        {r.job_card_number}
                      </code>
                    </td>
                    <td>{r.vehicle_registration_number ?? '—'}</td>
                    <td>{locationOf(r.location)}</td>
                    <td>{r.sr_type ?? '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{fmtDate(r.closed_date_time)}</td>
                    <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmt(r.analyticLabourAmt)}</td>
                    <td style={{ textAlign: 'right', color: '#9333ea', fontWeight: 600 }}>{fmt(r.sparesAmt)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.invoiceAmt)}</td>
                    <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>
                      {fmt(saIncome(r.dmsLabourAmt, curPct))}
                    </td>
                    <td style={{ textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{fmt(r.dmsLabourAmt)}</td>
                    <td style={{ textAlign: 'right', color: '#0f766e', fontWeight: 700 }}>{fmt(r.dmsInvoiceAmt)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td colSpan={5}>Day Total</td>
                  <td style={{ textAlign: 'right', color: '#16a34a' }}>{fmt(dayDetailRows.reduce((s, r) => s + r.analyticLabourAmt, 0))}</td>
                  <td style={{ textAlign: 'right', color: '#9333ea' }}>{fmt(dayDetailRows.reduce((s, r) => s + r.sparesAmt, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(dayDetailRows.reduce((s, r) => s + r.invoiceAmt, 0))}</td>
                  <td style={{ textAlign: 'right', color: '#2563eb' }}>
                    {fmt(saIncome(dayDetailRows.reduce((s, r) => s + r.dmsLabourAmt, 0), curPct))}
                  </td>
                  <td style={{ textAlign: 'right', color: '#15803d' }}>{fmt(dayDetailRows.reduce((s, r) => s + r.dmsLabourAmt, 0))}</td>
                  <td style={{ textAlign: 'right', color: '#0f766e' }}>{fmt(dayDetailRows.reduce((s, r) => s + r.dmsInvoiceAmt, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && memberCards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔨</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No data for {tabMeta.label}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {tabMeta.mode === 'tech'
              ? 'No assignments found in bodyshop_assignments for this role in the selected period.'
              : fromDate || toDate ? 'Try widening the date range.' : 'No Accident job cards found.'}
          </div>
        </div>
      )}

    </div>
  )
}
