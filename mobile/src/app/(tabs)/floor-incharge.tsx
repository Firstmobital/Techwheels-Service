/**
 * mobile/src/app/(tabs)/floor-incharge.tsx
 * Mobile version of web FloorInchargePage.tsx
 * Business logic: 100% identical to web (same DB tables, queries, rules).
 * UI: Mobile-native React Native cards. No guessing. Every field/filter/function mirrors the web.
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  ActivityIndicator, FlatList, Modal, Platform,
  RefreshControl, ScrollView, Text, TextInput,
  TouchableOpacity, View, KeyboardAvoidingView,
  Dimensions} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'

const SCREEN_W = Dimensions.get('window').width

// ─── Constants — exact web values ─────────────────────────────────────────────
const FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES = [
  'Running Repairs', 'First Free Service', 'Second Free Service',
  'Third Free Service', 'Paid Service', 'Updation', 'E Breakdown', 'Campaign',
]

const NOT_REQUIRED_TECHNICIAN_CODE = '__NOT_REQUIRED__'
const NOT_REQUIRED_TECHNICIAN_NAME = 'Not Required'
const QUERY_PAGE_SIZE = 1000

const STATUS_OPTIONS = [
  { value: 'work_inprocess', label: 'Work Inprocess' },
  { value: 'hold',           label: 'Hold' },
  { value: 'completed',      label: 'Completed' },
]

const SUPPORT_ROLE_OPTIONS = [
  { value: 'DET',         label: 'DET' },
  { value: 'ELECTRICIAN', label: 'Electrician' },
  { value: 'DENTOR',      label: 'Dentor' },
  { value: 'TECHNICIAN',  label: 'Technician' },
]

const UNKNOWN_LOCATION = 'Unknown location'
const UNKNOWN_PORTAL   = 'Unknown portal'

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  work_inprocess: { bg: '#f0f9ff', text: '#0284c7', border: '#0284c744' },
  hold:           { bg: '#fffbeb', text: '#b45309', border: '#b4530944' },
  completed:      { bg: '#f0fdf4', text: '#16a34a', border: '#16a34a44' },
}

const TAB_DEFS = [
  { key: 'all',            label: 'All',        color: '#6366f1', bg: '#eef2ff' },
  { key: 'unassigned',     label: 'Unassigned', color: '#ef4444', bg: '#fef2f2' },
  { key: 'assigned',       label: 'Assigned',   color: '#2563eb', bg: '#eff6ff' },
  { key: 'hold',           label: 'Hold',       color: '#f59e0b', bg: '#fffbeb' },
  { key: 'work_inprocess', label: 'In-Process', color: '#0ea5e9', bg: '#f0f9ff' },
  { key: 'completed',      label: 'Completed',  color: '#16a34a', bg: '#f0fdf4' },
] as const

// ─── Types (exact web) ────────────────────────────────────────────────────────
interface JobCard {
  id: number
  created_at: string | null
  source: string | null
  reg_number: string | null
  km_reading: number | null
  model: string | null
  service_type: string | null
  sa_name: string | null
  jc_number: string | null
  owner_name: string | null
  owner_phone: string | null
  branch: string | null
  location: string | null
  portal: string | null
  branch_label: string | null
  sa_employee_code: string | null
  fuel_type: string | null
  assignment_key: string
}

interface Employee {
  id: number
  employee_code: string
  employee_name: string
  department: string
  location: string
  fuel_type?: string | null
  role?: string | null
}

type SupportRole = 'DET' | 'ELECTRICIAN' | 'DENTOR' | 'TECHNICIAN'
type SupportRoleDb = 'DET' | 'ELECTRICIAN' | 'DENTER' | 'DENTOR' | 'TECHNICIAN'

interface SupportAssignment {
  id?: number
  job_card_number: string
  support_role: SupportRole
  employee_code: string
  employee_name: string
  assigned_at: string
  assigned_by: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

interface TechnicianAssignment {
  id?: number
  job_card_number: string
  technician_code: string
  technician_name: string
  assigned_at: string
  assigned_by: string | null
  bay_no?: string | null
  work_status?: string | null
  out_ts?: string | null
  time_diff?: string | null
  remark?: string | null
  created_at?: string
  updated_at?: string
}

type StageDraft = { bay_no: string; work_status: string; remark: string }
type AssignmentView = 'all' | 'assigned' | 'unassigned' | 'hold' | 'work_inprocess' | 'completed'

// ─── Pure helpers — exact same as web ─────────────────────────────────────────
function normalizeJobCardNumber(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase()
}
function normalizeEmployeeCode(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase()
}
function normalizeDepartmentValue(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase()
}
function normalizeStageValue(v: string | null | undefined): string {
  return String(v ?? '').trim()
}
function normalizeStatusValue(v: string | null | undefined): string {
  return normalizeStageValue(v).toLowerCase() || 'work_inprocess'
}
function getLocationLabel(v: string | null | undefined): string {
  return String(v ?? '').trim() || UNKNOWN_LOCATION
}
function getPortalLabel(v: string | null | undefined): string {
  const n = String(v ?? '').trim().toUpperCase()
  return (n === 'EV' || n === 'PV') ? n : UNKNOWN_PORTAL
}
function isTechnicianRole(v: string | null | undefined): boolean {
  return String(v ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '') === 'TECHNICIAN'
}
function isServiceDepartment(v: string | null | undefined): boolean {
  return normalizeDepartmentValue(v).replace(/[^A-Z]/g, '') === 'SERVICE'
}
function normalizeLocationForMatch(v: string | null | undefined): string | null {
  const n = String(v ?? '').trim().toLowerCase()
  if (!n) return null
  if (n.includes('ajmer')) return 'AJMER ROAD'
  if (n.includes('sitapura')) return 'SITAPURA'
  return n.toUpperCase()
}
function normalizeFuelTypeForMatch(v: string | null | undefined): 'PV' | 'EV' | null {
  const n = String(v ?? '').trim().toUpperCase()
  if (!n) return null
  if (n === 'EV' || n.includes('ELECTRIC') || n.includes('BATTERY')) return 'EV'
  if (n === 'PV' || n === 'ICE' || n.includes('PETROL') || n.includes('DIESEL') ||
      n.includes('CNG') || n.includes('LPG') || n.includes('GAS') || n.includes('HYBRID')) return 'PV'
  return null
}
function isEmployeeEligibleForJobCard(employee: Employee, jobCard: JobCard): boolean {
  if (!isServiceDepartment(employee.department)) return false
  if (!isTechnicianRole(employee.role)) return false
  const jcLoc  = normalizeLocationForMatch(jobCard.location ?? jobCard.branch)
  const empLoc = normalizeLocationForMatch(employee.location)
  if (jcLoc && empLoc !== jcLoc) return false
  const jcFuel  = normalizeFuelTypeForMatch(jobCard.portal ?? jobCard.fuel_type)
  const empFuel = normalizeFuelTypeForMatch(employee.fuel_type)
  if (jcFuel && empFuel !== jcFuel) return false
  return true
}
function normalizeSupportRole(v: string | null | undefined): SupportRole | null {
  const n = String(v ?? '').trim().toUpperCase()
  if (!n) return null
  if (n.includes('TECHNICIAN'))  return 'TECHNICIAN'
  if (n.includes('ELECTRICIAN')) return 'ELECTRICIAN'
  if (n.includes('DENTOR') || n.includes('DENTER')) return 'DENTOR'
  if (n.includes('DET'))         return 'DET'
  return null
}
function supportRoleLabel(role: SupportRole): string {
  return SUPPORT_ROLE_OPTIONS.find(o => o.value === role)?.label ?? role
}
function buildBayOptions(fuelType: string | null): string[] {
  const make = (prefix: 'PV' | 'EV') => Array.from({ length: 15 }, (_, i) => `${prefix}-${i + 1}`)
  const n = String(fuelType ?? '').trim().toUpperCase()
  if (n === 'PV') return make('PV')
  if (n === 'EV') return make('EV')
  return [...make('PV'), ...make('EV')]
}
function getAssignmentRecencyMs(a: TechnicianAssignment): number {
  const src = a.updated_at ?? a.out_ts ?? a.assigned_at ?? a.created_at ?? null
  const t = src ? new Date(src).getTime() : NaN
  return isFinite(t) ? t : Number(a.id ?? 0)
}
function formatDate(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function ageingDays(v: string | null | undefined): number {
  if (!v) return 0
  const d = new Date(v)
  if (isNaN(d.getTime())) return 0
  const diffMs = Date.now() - d.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}
function formatTimestamp(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function calculateTimeDiff(assignedAt: string | null | undefined, outTs: string | null | undefined): string {
  if (!assignedAt || !outTs) return '—'
  try {
    const diff = Math.round((new Date(outTs).getTime() - new Date(assignedAt).getTime()) / 1000)
    if (diff <= 0) return '—'
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  } catch { return '—' }
}
function formatTimeDiff(v: string | null | undefined): string {
  if (!v) return '—'
  const s = String(v).trim()
  const hms = s.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/)
  if (hms) {
    const [, h, m, sec] = hms.map(Number)
    if (!h && !m && !sec) return '—'
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }
  const secs = parseInt(s, 10)
  if (!isNaN(secs) && secs > 0) {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), sec = secs % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }
  return s
}
function getTechnicianFilterKey(a: TechnicianAssignment | undefined): string {
  const code = String(a?.technician_code ?? '').trim().toUpperCase()
  if (code === NOT_REQUIRED_TECHNICIAN_CODE) return 'not_required'
  if (code) return `code:${code}`
  return 'unassigned'
}
function getTechnicianFilterLabel(a: TechnicianAssignment | undefined): string {
  const name = String(a?.technician_name ?? '').trim()
  const code = String(a?.technician_code ?? '').trim().toUpperCase()
  if (code === NOT_REQUIRED_TECHNICIAN_CODE) return NOT_REQUIRED_TECHNICIAN_NAME
  if (name && code) return `${name} (${code})`
  return name || code || 'Unassigned'
}

// ─── API helpers ──────────────────────────────────────────────────────────────
const ENTRY_SELECT = [
  'id', 'reg_number', 'model', 'service_type', 'sa_name', 'sa_employee_code',
  'jc_number', 'owner_name', 'owner_phone', 'branch', 'location', 'portal',
  'branch_label', 'km_reading', 'source', 'created_at',
].join(', ')

async function fetchFloorInchargeEntries(): Promise<JobCard[]> {
  const rows: JobCard[] = []
  let cursor: string | null = null
  let cursorId: number | null = null

  while (true) {
    let q = supabase
      .from('service_reception_entries')
      .select(ENTRY_SELECT)
      .in('service_type', FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES)
      .not('jc_number', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(QUERY_PAGE_SIZE)

    if (cursor && cursorId !== null) {
      q = q.or(`created_at.lt.${cursor},and(created_at.eq.${cursor},id.lt.${cursorId})`)
    }
    const { data, error } = await q
    if (error) { console.warn('fetchFloorInchargeEntries:', error.message); break }
    const batch = (data ?? []) as Array<{
      id: number; created_at: string | null; source: string | null;
      reg_number: string | null; km_reading: number | null; model: string | null;
      service_type: string | null; sa_name: string | null; jc_number: string | null;
      owner_name: string | null; owner_phone: string | null; branch: string | null;
      location: string | null; portal: string | null; branch_label: string | null;
      sa_employee_code: string | null;
    }>
    batch.forEach(row => {
      const jcRaw = String(row.jc_number ?? '').trim()
      if (!jcRaw) return
      rows.push({
        id: row.id, created_at: row.created_at, source: row.source,
        reg_number: row.reg_number, km_reading: row.km_reading, model: row.model,
        service_type: row.service_type, sa_name: row.sa_name, jc_number: row.jc_number,
        owner_name: row.owner_name, owner_phone: row.owner_phone,
        branch: row.branch, location: row.location ?? row.branch,
        portal: row.portal, branch_label: row.branch_label ?? row.branch,
        sa_employee_code: row.sa_employee_code, fuel_type: null,
        assignment_key: jcRaw.toUpperCase(),
      })
    })
    if (batch.length < QUERY_PAGE_SIZE) break
    const last = batch[batch.length - 1]
    cursor = last.created_at; cursorId = last.id
    if (!cursor || cursorId === null) break
  }
  return rows
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FloorInchargeScreen() {
  const [jobCards,           setJobCards]           = useState<JobCard[]>([])
  const [allEmployees,       setAllEmployees]       = useState<Employee[]>([])
  const [employees,          setEmployees]          = useState<Employee[]>([])
  const [assignments,        setAssignments]        = useState<Record<string, TechnicianAssignment>>({})
  const [supportAssignments, setSupportAssignments] = useState<Record<string, SupportAssignment[]>>({})
  const [stageDrafts,        setStageDrafts]        = useState<Record<string, StageDraft>>({})
  const [loading,            setLoading]            = useState(true)
  const [refreshing,         setRefreshing]         = useState(false)
  const [saving,             setSaving]             = useState<string | null>(null)
  const [supportSaving,      setSupportSaving]      = useState<string | null>(null)
  const [toast,              setToast]              = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Filters (exact web)
  const [search,           setSearch]           = useState('')
  const [branchFilter,     setBranchFilter]     = useState('all')
  const [fuelTypeFilter,   setFuelTypeFilter]   = useState('all')
  const [technicianFilter, setTechnicianFilter] = useState('all')
  const [assignmentView,   setAssignmentView]   = useState<AssignmentView>('unassigned')

  // Expanded card (replaces table row on mobile)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterModal, setFilterModal] = useState<'loc' | 'portal' | 'tech' | null>(null)

  // Technician picker modal
  const [techPickerCard,   setTechPickerCard]   = useState<JobCard | null>(null)
  const [techPickerSearch, setTechPickerSearch] = useState('')

  // Bay picker modal
  const [bayPickerCard, setBayPickerCard] = useState<JobCard | null>(null)

  // Support modal
  const [supportModalCard, setSupportModalCard] = useState<JobCard | null>(null)
  const [supportModalRole, setSupportModalRole] = useState<SupportRole | ''>('')
  const [supportModalCode, setSupportModalCode] = useState('')

  // ── Load ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    else setRefreshing(true)

    try {
      const [rawEntries, empRes] = await Promise.all([
        fetchFloorInchargeEntries(),
        supabase.from('employee_master').select('id, employee_code, employee_name, department, location, fuel_type, role').order('employee_name'),
      ])

      // Enrich fuel_type from SA's employee_master record (exact web logic)
      const saCodes = [...new Set(rawEntries.map(r => normalizeEmployeeCode(r.sa_employee_code)).filter(Boolean))]
      const saFuelMap = new Map<string, string | null>()
      if (saCodes.length > 0) {
        const { data: saFuelData } = await supabase
          .from('employee_master').select('employee_code, fuel_type').in('employee_code', saCodes)
        ;(saFuelData ?? []).forEach((r: { employee_code?: string; fuel_type?: string | null }) => {
          const code = normalizeEmployeeCode(r.employee_code)
          if (code) saFuelMap.set(code, String(r.fuel_type ?? '').trim() || null)
        })
      }
      const receptionRows = rawEntries.map(r => ({
        ...r,
        fuel_type: saFuelMap.get(normalizeEmployeeCode(r.sa_employee_code)) ?? r.fuel_type ?? null,
      }))

      const empList = (empRes.data ?? []) as Employee[]
      setJobCards(receptionRows)
      setAllEmployees(empList)
      setEmployees(empList.filter(e => isServiceDepartment(e.department) && isTechnicianRole(e.role)))

      // Technician assignments
      const assignmentRows: TechnicianAssignment[] = []
      let from = 0
      while (true) {
        const { data: aData, error: aErr } = await supabase
          .from('technician_assignments').select('*')
          .order('updated_at', { ascending: false }).order('assigned_at', { ascending: false })
          .range(from, from + QUERY_PAGE_SIZE - 1)
        if (aErr) break
        const batch = (aData ?? []) as TechnicianAssignment[]
        assignmentRows.push(...batch)
        if (batch.length < QUERY_PAGE_SIZE) break
        from += QUERY_PAGE_SIZE
      }
      const assignMap: Record<string, TechnicianAssignment> = {}
      const nextDrafts: Record<string, StageDraft> = {}
      for (const a of assignmentRows) {
        const key = normalizeJobCardNumber(a.job_card_number)
        if (!key) continue
        const existing = assignMap[key]
        if (existing && getAssignmentRecencyMs(existing) >= getAssignmentRecencyMs(a)) continue
        assignMap[key] = a
        nextDrafts[key] = { bay_no: a.bay_no ?? '', work_status: a.work_status ?? 'work_inprocess', remark: a.remark ?? '' }
      }
      setAssignments(assignMap)
      setStageDrafts(nextDrafts)

      // Support assignments
      const supportRows: SupportAssignment[] = []
      let sFrom = 0
      while (true) {
        const { data: sData, error: sErr } = await supabase
          .from('job_card_support_assignments').select('*').eq('is_active', true)
          .range(sFrom, sFrom + QUERY_PAGE_SIZE - 1)
        if (sErr) break
        const batch = (sData ?? []) as SupportAssignment[]
        supportRows.push(...batch)
        if (batch.length < QUERY_PAGE_SIZE) break
        sFrom += QUERY_PAGE_SIZE
      }
      const suppMap: Record<string, SupportAssignment[]> = {}
      for (const sa of supportRows) {
        const key = String(sa.job_card_number ?? '').trim().toUpperCase()
        if (!key) continue
        const norm: SupportAssignment = { ...sa, support_role: normalizeSupportRole(sa.support_role) ?? 'TECHNICIAN' }
        suppMap[key] = [...(suppMap[key] ?? []), norm]
      }
      Object.keys(suppMap).forEach(k => {
        suppMap[k].sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())
      })
      setSupportAssignments(suppMap)
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useFocusEffect(useCallback(() => { void fetchAll() }, [fetchAll]))

  // ── Derived state — exact web filter chain ────────────────────────────────
  const statusScopedRows = useMemo(() => {
    if (assignmentView === 'all') return jobCards
    return jobCards.filter(jc => {
      const a = assignments[jc.assignment_key]
      if (assignmentView === 'assigned')       return Boolean(a)
      if (assignmentView === 'unassigned')     return !a
      if (assignmentView === 'hold')           return Boolean(a) && normalizeStatusValue(a?.work_status) === 'hold'
      if (assignmentView === 'work_inprocess') return Boolean(a) && normalizeStatusValue(a?.work_status) === 'work_inprocess'
      if (assignmentView === 'completed')      return Boolean(a) && normalizeStatusValue(a?.work_status) === 'completed'
      return true
    })
  }, [jobCards, assignmentView, assignments])

  const searchQuery = useMemo(() => search.trim().toLowerCase(), [search])
  const searchScopedRows = useMemo(() => {
    if (!searchQuery) return statusScopedRows
    return statusScopedRows.filter(jc => {
      const a = assignments[jc.assignment_key]
      const sp = supportAssignments[jc.assignment_key] ?? []
      return [
        jc.jc_number ?? '', jc.reg_number ?? '', String(jc.km_reading ?? ''),
        jc.model ?? '', jc.service_type ?? '', jc.sa_name ?? '',
        jc.owner_name ?? '', jc.owner_phone ?? '', jc.source ?? '',
        jc.branch ?? '', jc.location ?? '', jc.portal ?? '',
        a?.technician_name ?? '', a?.technician_code ?? '',
        sp.map(p => p.employee_name).join(' '),
        sp.map(p => p.employee_code).join(' '),
      ].join(' ').toLowerCase().includes(searchQuery)
    })
  }, [statusScopedRows, searchQuery, assignments, supportAssignments])

  const branches = useMemo(() => {
    const b = new Set(searchScopedRows.map(jc => getLocationLabel(jc.location ?? jc.branch)))
    return Array.from(b).sort((a, b) => a === UNKNOWN_LOCATION ? 1 : b === UNKNOWN_LOCATION ? -1 : a.localeCompare(b))
  }, [searchScopedRows])

  const statusScopedBranchRows = useMemo(() =>
    branchFilter === 'all' ? searchScopedRows
      : searchScopedRows.filter(jc => getLocationLabel(jc.location ?? jc.branch) === branchFilter),
    [searchScopedRows, branchFilter])

  const fuelTypeOptions = useMemo(() => {
    const s = new Set(statusScopedBranchRows.map(jc => getPortalLabel(jc.portal ?? jc.fuel_type)))
    return Array.from(s).sort((a, b) => a === UNKNOWN_PORTAL ? 1 : b === UNKNOWN_PORTAL ? -1 : a.localeCompare(b))
  }, [statusScopedBranchRows])

  const statusScopedFuelRows = useMemo(() =>
    fuelTypeFilter === 'all' ? statusScopedBranchRows
      : statusScopedBranchRows.filter(jc => getPortalLabel(jc.portal ?? jc.fuel_type) === fuelTypeFilter),
    [statusScopedBranchRows, fuelTypeFilter])

  const technicianOptions = useMemo(() => {
    const map = new Map<string, string>()
    statusScopedFuelRows.forEach(jc => {
      const a = assignments[jc.assignment_key]
      map.set(getTechnicianFilterKey(a), getTechnicianFilterLabel(a))
    })
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.value === 'unassigned' ? 1 : b.value === 'unassigned' ? -1 : a.label.localeCompare(b.label))
  }, [statusScopedFuelRows, assignments])

  const scopedJobCards = useMemo(() =>
    statusScopedFuelRows.filter(jc =>
      technicianFilter === 'all' || getTechnicianFilterKey(assignments[jc.assignment_key]) === technicianFilter
    ), [statusScopedFuelRows, assignments, technicianFilter])

  const filtered = useMemo(() => {
    if (assignmentView === 'all') return scopedJobCards
    return scopedJobCards.filter(jc => {
      const a = assignments[jc.assignment_key]
      if (assignmentView === 'assigned')       return Boolean(a)
      if (assignmentView === 'unassigned')     return !a
      if (assignmentView === 'hold')           return normalizeStatusValue(a?.work_status) === 'hold'
      if (assignmentView === 'work_inprocess') return normalizeStatusValue(a?.work_status) === 'work_inprocess'
      if (assignmentView === 'completed')      return normalizeStatusValue(a?.work_status) === 'completed'
      return true
    })
  }, [assignmentView, assignments, scopedJobCards])

  const tabCounts = useMemo(() => ({
    all:            scopedJobCards.length,
    unassigned:     scopedJobCards.filter(jc => !assignments[jc.assignment_key]).length,
    assigned:       scopedJobCards.filter(jc => Boolean(assignments[jc.assignment_key])).length,
    hold:           scopedJobCards.filter(jc => normalizeStatusValue(assignments[jc.assignment_key]?.work_status) === 'hold').length,
    work_inprocess: scopedJobCards.filter(jc => normalizeStatusValue(assignments[jc.assignment_key]?.work_status) === 'work_inprocess').length,
    completed:      scopedJobCards.filter(jc => normalizeStatusValue(assignments[jc.assignment_key]?.work_status) === 'completed').length,
  }), [scopedJobCards, assignments])

  const techniciansByJobCard = useMemo<Record<string, Employee[]>>(() => {
    const map: Record<string, Employee[]> = {}
    jobCards.forEach(jc => {
      map[jc.assignment_key] = employees
        .filter(e => isEmployeeEligibleForJobCard(e, jc))
        .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
    })
    return map
  }, [employees, jobCards])

  const supportEmployeesByRole = useMemo<Record<SupportRole, Employee[]>>(() => {
    const g: Record<SupportRole, Employee[]> = { DET: [], ELECTRICIAN: [], DENTOR: [], TECHNICIAN: [] }
    allEmployees.forEach(e => { const r = normalizeSupportRole(e.role); if (r) g[r].push(e) })
    return {
      DET:         g.DET.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      ELECTRICIAN: g.ELECTRICIAN.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      DENTOR:      g.DENTOR.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      TECHNICIAN:  g.TECHNICIAN.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
    }
  }, [allEmployees])

  const supportModalEmployees = useMemo(() => {
    if (!supportModalRole) return []
    const list = supportEmployeesByRole[supportModalRole as SupportRole] ?? []
    if (supportModalRole !== 'TECHNICIAN' || !supportModalCard) return list
    return list.filter(e => isEmployeeEligibleForJobCard(e, supportModalCard))
  }, [supportModalRole, supportEmployeesByRole, supportModalCard])

  // ── Actions — exact same logic as web ────────────────────────────────────
  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function assignTechnician(jobCardNumber: string, employeeCode: string) {
    const key = normalizeJobCardNumber(jobCardNumber)
    if (!key) { showToast('Job card number required', 'error'); return }
    setSaving(key)
    try {
      const isNotRequired = employeeCode === NOT_REQUIRED_TECHNICIAN_CODE
      const scopedEmps = techniciansByJobCard[key] ?? []
      const emp = isNotRequired
        ? { employee_code: NOT_REQUIRED_TECHNICIAN_CODE, employee_name: NOT_REQUIRED_TECHNICIAN_NAME }
        : scopedEmps.find(e => normalizeEmployeeCode(e.employee_code) === normalizeEmployeeCode(employeeCode))
      if (!emp) { showToast('Technician does not match Service/Location/Fuel rules', 'error'); return }

      const { data: { user } } = await supabase.auth.getUser()
      const payload: Omit<TechnicianAssignment, 'id'> = {
        job_card_number: key, technician_code: emp.employee_code, technician_name: emp.employee_name,
        assigned_at: new Date().toISOString(), assigned_by: user?.email ?? null,
      }

      const existing = assignments[key]
      let result
      if (existing?.id) {
        result = await supabase.from('technician_assignments').update(payload).eq('id', existing.id).select().single()
      } else {
        const { data: latest } = await supabase.from('technician_assignments').select('*')
          .eq('job_card_number', key)
          .order('updated_at', { ascending: false }).order('assigned_at', { ascending: false })
          .limit(1).maybeSingle()
        if (latest?.id) {
          result = await supabase.from('technician_assignments').update(payload).eq('id', latest.id).select().single()
        } else {
          result = await supabase.from('technician_assignments').insert(payload).select().single()
        }
      }
      if (result.error) throw result.error

      const updated = result.data as TechnicianAssignment
      setAssignments(p => ({ ...p, [key]: updated }))
      setStageDrafts(p => ({
        ...p, [key]: { bay_no: updated.bay_no ?? p[key]?.bay_no ?? '', work_status: updated.work_status ?? p[key]?.work_status ?? 'work_inprocess', remark: updated.remark ?? p[key]?.remark ?? '' }
      }))
      showToast(`Technician assigned to ${key}`, 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to assign', 'error')
    } finally { setSaving(null) }
  }

  function patchStageDraft(key: string, patch: Partial<StageDraft>) {
    setStageDrafts(p => {
      const a = assignments[key]
      const cur = p[key] ?? { bay_no: a?.bay_no ?? '', work_status: a?.work_status ?? 'work_inprocess', remark: a?.remark ?? '' }
      return { ...p, [key]: { ...cur, ...patch } }
    })
  }

  async function saveStage(key: string) {
    const a = assignments[key]
    if (!a?.id) { showToast('Assign technician first', 'error'); return }
    const draft = stageDrafts[key] ?? { bay_no: a.bay_no ?? '', work_status: a.work_status ?? 'work_inprocess', remark: a.remark ?? '' }
    setSaving(key)
    try {
      const payload: Record<string, unknown> = {
        bay_no: draft.bay_no.trim() || null,
        work_status: draft.work_status,
        remark: draft.remark.trim() || null,
      }
      if (draft.work_status === 'completed') payload.out_ts = new Date().toISOString()

      const result = await supabase.from('technician_assignments').update(payload).eq('id', a.id).select('*').single()
      if (result.error) throw result.error

      const updated = result.data as TechnicianAssignment
      setAssignments(p => ({ ...p, [key]: updated }))
      setStageDrafts(p => ({ ...p, [key]: { bay_no: updated.bay_no ?? '', work_status: updated.work_status ?? 'work_inprocess', remark: updated.remark ?? '' } }))
      showToast(`Stage saved for ${key}`, 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save stage', 'error')
    } finally { setSaving(null) }
  }

  async function saveSupportAssignment() {
    if (!supportModalCard || !supportModalRole || !supportModalCode) {
      showToast('Select role and employee', 'error'); return
    }
    const key = supportModalCard.assignment_key
    const emp = supportModalEmployees.find(e => e.employee_code === supportModalCode)
    if (!emp) {
      showToast(supportModalRole === 'TECHNICIAN' ? 'Technician does not match rules' : 'Employee not available', 'error'); return
    }
    const primaryCode = normalizeEmployeeCode(assignments[key]?.technician_code)
    if (supportModalRole === 'TECHNICIAN' && primaryCode && primaryCode === normalizeEmployeeCode(emp.employee_code)) {
      showToast('Primary technician cannot be added as support', 'error'); return
    }
    const existing = supportAssignments[key] ?? []
    if (existing.some(s => normalizeEmployeeCode(s.employee_code) === normalizeEmployeeCode(emp.employee_code))) {
      showToast('This person is already added', 'error'); return
    }

    setSupportSaving(key)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const base = { job_card_number: key, employee_code: emp.employee_code, employee_name: emp.employee_name, assigned_at: new Date().toISOString(), assigned_by: user?.email ?? null, is_active: true }

      const candidates: SupportRoleDb[] = supportModalRole === 'DENTOR' ? ['DENTER', 'DENTOR'] : [supportModalRole as SupportRoleDb]
      let result: { data: unknown; error: { message?: string } | null } | null = null
      for (let i = 0; i < candidates.length; i++) {
        const ins = await supabase.from('job_card_support_assignments').insert({ ...base, support_role: candidates[i] }).select().single()
        if (!ins.error) { result = ins as typeof result; break }
        const errText = String(ins.error.message ?? '').toLowerCase()
        const isRoleErr = errText.includes('support_role') && errText.includes('check')
        if (i === candidates.length - 1 || !isRoleErr) { result = ins as typeof result; break }
      }
      if (!result || result.error) throw result?.error ?? new Error('Failed')

      setSupportAssignments(p => ({
        ...p, [key]: [
          { ...(result!.data as SupportAssignment), support_role: normalizeSupportRole((result!.data as SupportAssignment).support_role) ?? (supportModalRole as SupportRole) },
          ...(p[key] ?? []),
        ]
      }))
      showToast(`Support assigned to ${key}`, 'success')
      setSupportModalCard(null); setSupportModalRole(''); setSupportModalCode('')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally { setSupportSaving(null) }
  }

  async function removeSupportAssignment(key: string, id: number) {
    setSupportSaving(key)
    try {
      const { error } = await supabase.from('job_card_support_assignments').update({ is_active: false }).eq('id', id)
      if (error) throw error
      setSupportAssignments(p => {
        const next = { ...p }
        const rows = (next[key] ?? []).filter(s => s.id !== id)
        if (!rows.length) delete next[key]; else next[key] = rows
        return next
      })
      showToast('Support removed', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally { setSupportSaving(null) }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function JobCardItem({ jc }: { jc: JobCard }) {
    const key = jc.assignment_key
    const a = assignments[key]
    const supportPeople = supportAssignments[key] ?? []
    const isSaving = saving === key
    const isExpanded = expandedId === key
    const draft = stageDrafts[key] ?? { bay_no: a?.bay_no ?? '', work_status: a?.work_status ?? 'work_inprocess', remark: a?.remark ?? '' }

    const statusKey = normalizeStatusValue(a?.work_status)
    const sc = STATUS_COLORS[statusKey] ?? STATUS_COLORS.work_inprocess
    const timeDiff = calculateTimeDiff(a?.assigned_at, a?.out_ts) || formatTimeDiff(a?.time_diff)
    const portal = getPortalLabel(jc.portal ?? jc.fuel_type)
    const loc    = getLocationLabel(jc.location ?? jc.branch)

    const hasStageChanges = Boolean(a) && (
      normalizeStageValue(draft.bay_no)       !== normalizeStageValue(a?.bay_no) ||
      normalizeStatusValue(draft.work_status) !== normalizeStatusValue(a?.work_status) ||
      normalizeStageValue(draft.remark)       !== normalizeStageValue(a?.remark)
    )

    // Portal badge color
    const portalEV = portal === 'EV'
    const assignBtnVisible = !a  // Unassigned — show quick assign CTA

    return (
      <View style={[S.card, !a && S.cardUnassigned]}>

        {/* ── Collapsed row ── */}
        <TouchableOpacity style={S.cardRow} onPress={() => setExpandedId(isExpanded ? null : key)} activeOpacity={0.78}>

          {/* Status stripe */}
          <View style={[S.statusStripe, { backgroundColor: a ? sc.text : '#ef4444' }]} />

          {/* Main info */}
          <View style={S.cardInfo}>

            {/* Line 1: reg + portal badge */}
            <View style={S.cardLine1}>
              <Text style={S.regText} numberOfLines={1}>{jc.reg_number || '—'}</Text>
              <View style={[S.portalBadge, { backgroundColor: portalEV ? '#f0fdf4' : '#eff6ff', borderColor: portalEV ? '#16a34a66' : '#2563eb66' }]}>
                <Text style={[S.portalBadgeText, { color: portalEV ? '#16a34a' : '#2563eb' }]}>{portal}</Text>
              </View>
            </View>

            {/* Line 2: model · service type */}
            <Text style={S.cardModel} numberOfLines={1}>{jc.model || '—'}  ·  {jc.service_type || '—'}</Text>

            {/* Line 2b: Job Card Number */}
            {jc.jc_number ? (
              <View style={S.jcNumberRow}>
                <Text style={S.jcNumberLabel}>JC: </Text>
                <Text style={S.jcNumberValue} numberOfLines={1}>{jc.jc_number}</Text>
              </View>
            ) : null}

            {/* Line 3: status pill + ageing badge for Hold & In-Process */}
            <View style={S.cardLine3}>
              <View style={[S.statusPill, { backgroundColor: a ? sc.bg : '#fef2f2', borderColor: a ? sc.text + 'aa' : '#ef4444aa' }]}>
                <Text style={[S.statusPillText, { color: a ? sc.text : '#ef4444' }]}>
                  {a ? (STATUS_OPTIONS.find(o => o.value === statusKey)?.label ?? statusKey) : 'Unassigned'}
                </Text>
              </View>
              {/* Created timestamp — only for unassigned */}
              {!a && jc.created_at ? (
                <Text style={S.cardCreatedAt}>🕐 {formatDate(jc.created_at)}</Text>
              ) : null}
              {/* Ageing badge — for Hold and In-Process */}
              {a && (statusKey === 'hold' || statusKey === 'work_inprocess') && jc.created_at ? (
                <View style={[S.ageingBadge, statusKey === 'hold' ? S.ageingBadgeHold : S.ageingBadgeInProcess]}>
                  <Text style={[S.ageingBadgeText, statusKey === 'hold' ? S.ageingBadgeTextHold : S.ageingBadgeTextInProcess]}>
                    {`⏱ ${ageingDays(jc.created_at)}d · ${formatDate(jc.created_at)}`}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Line 4: technician or assign prompt */}
            {a?.technician_name ? (
              <View style={S.techRow}>
                <Text style={S.techIcon}>🔧</Text>
                <Text style={S.techName} numberOfLines={1}>{a.technician_name}</Text>
                {draft.bay_no ? (
                  <View style={S.bayTag}><Text style={S.bayTagText}>{draft.bay_no}</Text></View>
                ) : null}
              </View>
            ) : (
              <Text style={S.unassignedHint}>Tap to assign technician</Text>
            )}
          </View>

          {/* Right: assign button (unassigned) OR expand chevron */}
          {assignBtnVisible ? (
            <TouchableOpacity
              style={S.assignCTA}
              onPress={() => { setTechPickerCard(jc); setTechPickerSearch('') }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={S.assignCTAText}>Assign</Text>
            </TouchableOpacity>
          ) : (
            <Text style={S.expandChevron}>{isExpanded ? '▲' : '▼'}</Text>
          )}
        </TouchableOpacity>

        {/* ── Expanded body ── */}
        {isExpanded && (
          <View style={S.cardBody}>

            {/* Info grid */}
            <View style={S.infoBlock}>
              <View style={S.infoRow2Col}>
                <InfoCell label="Created" value={`${formatDate(jc.created_at)}  (${ageingDays(jc.created_at)}d old)`} />
                <InfoCell label="KM"      value={jc.km_reading != null ? String(jc.km_reading) : '—'} />
              </View>
              <View style={S.infoRow2Col}>
                <InfoCell label="SA"     value={jc.sa_name || '—'} />
                <InfoCell label="Source" value={jc.source || '—'} />
              </View>
              <View style={S.infoRow2Col}>
                <InfoCell label="Owner" value={jc.owner_name || '—'} />
                <InfoCell label="Phone" value={jc.owner_phone || '—'} />
              </View>
            </View>

            <View style={S.divider} />

            {/* Assign Technician */}
            <Text style={S.sectionTitle}>🔧 Technician</Text>
            <TouchableOpacity
              style={[S.selectBtn, isSaving && { opacity: 0.5 }]}
              disabled={isSaving}
              onPress={() => { setTechPickerCard(jc); setTechPickerSearch('') }}>
              <View style={{ flex: 1 }}>
                <Text style={a?.technician_name ? S.selectBtnVal : S.selectBtnPlaceholder} numberOfLines={1}>
                  {a?.technician_name
                    ? a.technician_name
                    : 'Tap to assign technician'}
                </Text>
                {a?.technician_code && a.technician_code !== NOT_REQUIRED_TECHNICIAN_CODE && (
                  <Text style={S.selectBtnSub}>{a.technician_code}</Text>
                )}
              </View>
              {isSaving
                ? <ActivityIndicator size="small" color="#2563eb" />
                : <Text style={S.selectBtnArrow}>›</Text>
              }
            </TouchableOpacity>

            {/* Support people */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
              <Text style={S.sectionTitle}>👥 Support  <Text style={{ color: '#94a3b8', fontWeight: '400' }}>({supportPeople.length})</Text></Text>
              <TouchableOpacity style={S.addSupportBtn}
                onPress={() => { setSupportModalCard(jc); setSupportModalRole(''); setSupportModalCode('') }}>
                <Text style={S.addSupportBtnText}>＋ Add</Text>
              </TouchableOpacity>
            </View>
            {supportPeople.length > 0
              ? supportPeople.map(p => (
                  <View key={p.id ?? `${p.employee_code}-${p.assigned_at}`} style={S.supportPill}>
                    <View style={S.supportRoleTag}>
                      <Text style={S.supportRoleTagText}>{supportRoleLabel(p.support_role)}</Text>
                    </View>
                    <Text style={S.supportPillName} numberOfLines={1}>{p.employee_name}</Text>
                  </View>
                ))
              : <Text style={S.emptyHint}>No support person assigned</Text>
            }

            {/* Timestamps */}
            <View style={S.divider} />
            <View style={S.tsRow}>
              <View style={S.tsCell}>
                <Text style={S.tsLabel}>IN</Text>
                <Text style={S.tsVal}>{formatTimestamp(a?.assigned_at)}</Text>
              </View>
              <View style={S.tsDivider} />
              <View style={S.tsCell}>
                <Text style={S.tsLabel}>OUT</Text>
                <Text style={S.tsVal}>{formatTimestamp(a?.out_ts)}</Text>
              </View>
              <View style={S.tsDivider} />
              <View style={S.tsCell}>
                <Text style={S.tsLabel}>TIME</Text>
                <Text style={[S.tsVal, { color: '#16a34a', fontWeight: '700' }]}>{timeDiff}</Text>
              </View>
            </View>

            {/* Stage details */}
            <View style={S.divider} />
            <Text style={S.sectionTitle}>📋 Stage</Text>

            {/* Bay */}
            <Text style={S.fieldLabel}>Bay No</Text>
            <TouchableOpacity style={[S.selectBtn, !a && { opacity: 0.35 }]} disabled={!a} onPress={() => a && setBayPickerCard(jc)}>
              <Text style={draft.bay_no ? S.selectBtnVal : S.selectBtnPlaceholder}>{draft.bay_no || 'Tap to select bay'}</Text>
              <Text style={S.selectBtnArrow}>›</Text>
            </TouchableOpacity>

            {/* Status chips */}
            <Text style={[S.fieldLabel, { marginTop: 12 }]}>Work Status</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {STATUS_OPTIONS.map(opt => {
                const osc = STATUS_COLORS[opt.value]
                const active = draft.work_status === opt.value
                return (
                  <TouchableOpacity key={opt.value} disabled={!a} style={{ flex: 1 }}
                    onPress={() => a && patchStageDraft(key, { work_status: opt.value })}>
                    <View style={[S.statusBlock, active && { backgroundColor: osc.bg, borderColor: osc.text }]}>
                      <Text style={[S.statusBlockText, active && { color: osc.text, fontWeight: '700' }]}>{opt.label}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Remark */}
            <Text style={[S.fieldLabel, { marginTop: 12 }]}>Remark</Text>
            <TextInput
              style={[S.remarkInput, !a && { opacity: 0.35 }]}
              editable={Boolean(a)}
              multiline
              placeholder="Optional remark..."
              placeholderTextColor="#94a3b8"
              value={draft.remark}
              onChangeText={t => a && patchStageDraft(key, { remark: t })}
            />

            {hasStageChanges && (
              <TouchableOpacity
                style={[S.saveBtn, isSaving && { opacity: 0.55 }]}
                disabled={isSaving}
                onPress={() => saveStage(key)}>
                {isSaving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.saveBtnText}>Save Stage</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    )
  }

  // Technician picker items
  const techPickerItems = useMemo(() => {
    if (!techPickerCard) return []
    const q = techPickerSearch.toLowerCase()
    const scoped = techniciansByJobCard[techPickerCard.assignment_key] ?? []
    const all = [
      { employee_code: NOT_REQUIRED_TECHNICIAN_CODE, employee_name: NOT_REQUIRED_TECHNICIAN_NAME },
      ...scoped,
    ]
    return q ? all.filter(e => e.employee_name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q)) : all
  }, [techPickerCard, techPickerSearch, techniciansByJobCard])

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={S.root}>

      {/* Toast */}
      {toast && (
        <View style={[S.toast, toast.type === 'error' && S.toastError]}>
          <Text style={S.toastText}>{toast.type === 'error' ? '✗' : '✓'}  {toast.msg}</Text>
        </View>
      )}

      {/* ── Top bar: single row — [Floor Incharge] [──search──] [↻] ── */}
      <View style={S.topBar}>
        <Text style={S.topBarTitle}>Floor Incharge</Text>
        <View style={S.searchWrap}>
          <Text style={S.searchIcon}>🔍</Text>
          <TextInput style={S.searchInput}
            placeholder="Search JC / reg / model..."
            placeholderTextColor="#94a3b8"
            value={search} onChangeText={setSearch} clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity style={S.refreshBtn} onPress={() => fetchAll(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={S.refreshBtnText}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ── Status tabs — horizontal scroll, 5 statuses clearly visible ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={S.slideTabBar}
        contentContainerStyle={S.slideTabContent}
      >
        {(['unassigned', 'hold', 'assigned', 'work_inprocess', 'completed'] as const).map(key => {
          const tab = TAB_DEFS.find(t => t.key === key)!
          const cnt  = tabCounts[key]
          const active = assignmentView === key
          return (
            <TouchableOpacity
              key={key}
              style={[S.slideTab, {
                borderColor: active ? tab.color : '#e2e8f0',
                backgroundColor: active ? tab.color : '#fff',
              }]}
              onPress={() => setAssignmentView(key as AssignmentView)}
              activeOpacity={0.75}>
              <Text style={[S.slideTabCount, { color: active ? '#fff' : tab.color }]}>{cnt}</Text>
              <Text style={[S.slideTabLabel, { color: active ? '#fff' : '#475569' }]}>{tab.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Dropdown filter bar — 3 dropdowns in one row ── */}
      <View style={S.dropdownBar}>
        {/* Location dropdown */}
        <TouchableOpacity style={S.dropdownBtn} onPress={() => setFilterModal('loc')} activeOpacity={0.75}>
          <View style={{ flex: 1 }}>
            <Text style={S.dropdownLabel}>Location</Text>
            <Text style={S.dropdownVal} numberOfLines={1}>
              {branchFilter === 'all' ? `All (${searchScopedRows.length})` : branchFilter}
            </Text>
          </View>
          <Text style={[S.dropdownArrow, branchFilter !== 'all' && S.dropdownArrowActive]}>▾</Text>
          {branchFilter !== 'all' && <View style={S.dropdownDot} />}
        </TouchableOpacity>

        <View style={S.dropdownDivider} />

        {/* Portal dropdown */}
        <TouchableOpacity style={S.dropdownBtn} onPress={() => setFilterModal('portal')} activeOpacity={0.75}>
          <View style={{ flex: 1 }}>
            <Text style={S.dropdownLabel}>Portal</Text>
            <Text style={[S.dropdownVal, fuelTypeFilter !== 'all' && { color: '#2563eb', fontWeight: '700' }]} numberOfLines={1}>
              {fuelTypeFilter === 'all' ? 'All' : fuelTypeFilter}
            </Text>
          </View>
          <Text style={[S.dropdownArrow, fuelTypeFilter !== 'all' && S.dropdownArrowActive]}>▾</Text>
          {fuelTypeFilter !== 'all' && <View style={S.dropdownDot} />}
        </TouchableOpacity>

        <View style={S.dropdownDivider} />

        {/* Technician dropdown */}
        <TouchableOpacity style={S.dropdownBtn} onPress={() => setFilterModal('tech')} activeOpacity={0.75}>
          <View style={{ flex: 1 }}>
            <Text style={S.dropdownLabel}>Technician</Text>
            <Text style={[S.dropdownVal, technicianFilter !== 'all' && { color: '#2563eb', fontWeight: '700' }]} numberOfLines={1}>
              {technicianFilter === 'all'
                ? 'All'
                : technicianOptions.find(o => o.value === technicianFilter)?.label.split(' (')[0] ?? 'All'}
            </Text>
          </View>
          <Text style={[S.dropdownArrow, technicianFilter !== 'all' && S.dropdownArrowActive]}>▾</Text>
          {technicianFilter !== 'all' && <View style={S.dropdownDot} />}
        </TouchableOpacity>
      </View>

      {/* ── Filter dropdown modals ── */}
      <Modal visible={filterModal !== null} animationType="slide" transparent presentationStyle="overFullScreen">
        <TouchableOpacity style={S.filterModalOverlay} activeOpacity={1} onPress={() => setFilterModal(null)}>
          <View style={S.filterModalSheet}>
            {/* Handle */}
            <View style={S.filterModalHandle} />

            {/* Title */}
            <View style={S.filterModalHeader}>
              <Text style={S.filterModalTitle}>
                {filterModal === 'loc' ? '📍 Location' : filterModal === 'portal' ? '⛽ Portal' : '🔧 Technician'}
              </Text>
              <TouchableOpacity onPress={() => setFilterModal(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={S.filterModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Options */}
            <ScrollView style={{ maxHeight: 380 }} bounces={false}>
              {filterModal === 'loc' && (
                <>
                  <FilterOption
                    label={`All Locations`}
                    subLabel={`${searchScopedRows.length} job cards`}
                    active={branchFilter === 'all'}
                    onPress={() => { setBranchFilter('all'); setFilterModal(null) }}
                  />
                  {branches.map(b => (
                    <FilterOption key={b}
                      label={b}
                      subLabel={`${searchScopedRows.filter(jc => getLocationLabel(jc.location ?? jc.branch) === b).length} job cards`}
                      active={branchFilter === b}
                      onPress={() => { setBranchFilter(b); setFilterModal(null) }}
                    />
                  ))}
                </>
              )}

              {filterModal === 'portal' && (
                <>
                  <FilterOption
                    label="All Portals"
                    subLabel={`${statusScopedBranchRows.length} job cards`}
                    active={fuelTypeFilter === 'all'}
                    onPress={() => { setFuelTypeFilter('all'); setFilterModal(null) }}
                  />
                  {fuelTypeOptions.map(ft => (
                    <FilterOption key={ft}
                      label={ft}
                      subLabel={`${statusScopedBranchRows.filter(jc => getPortalLabel(jc.portal ?? jc.fuel_type) === ft).length} job cards`}
                      active={fuelTypeFilter === ft}
                      onPress={() => { setFuelTypeFilter(ft); setFilterModal(null) }}
                    />
                  ))}
                </>
              )}

              {filterModal === 'tech' && (
                <>
                  <FilterOption
                    label="All Technicians"
                    subLabel={`${statusScopedFuelRows.length} job cards`}
                    active={technicianFilter === 'all'}
                    onPress={() => { setTechnicianFilter('all'); setFilterModal(null) }}
                  />
                  {technicianOptions.map(opt => {
                    const cnt = statusScopedFuelRows.filter(jc => getTechnicianFilterKey(assignments[jc.assignment_key]) === opt.value).length
                    return (
                      <FilterOption key={opt.value}
                        label={opt.label}
                        subLabel={`${cnt} job cards`}
                        active={technicianFilter === opt.value}
                        onPress={() => { setTechnicianFilter(opt.value); setFilterModal(null) }}
                      />
                    )
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={jc => String(jc.id)}
          renderItem={({ item }) => <JobCardItem jc={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(true)} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 80, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={S.emptyIcon}>🏭</Text>
              <Text style={S.emptyTitle}>No job cards</Text>
              <Text style={S.emptySub}>
                {search || branchFilter !== 'all' || fuelTypeFilter !== 'all'
                  ? 'No job cards match your filters'
                  : 'No job cards visible in your Floor Incharge scope'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Technician picker modal ──────────────────────────────────────── */}
      <Modal visible={techPickerCard !== null} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={S.pickerHeader}>
            <Text style={S.pickerTitle}>Select Technician</Text>
            <TouchableOpacity onPress={() => setTechPickerCard(null)}>
              <Text style={{ fontSize: 22, color: '#64748b' }}>✕</Text>
            </TouchableOpacity>
          </View>
          {techPickerCard && (
            <View style={{ padding: 12, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderColor: '#e2e8f0' }}>
              <Text style={{ fontSize: 12, color: '#64748b' }}>
                {techPickerCard.jc_number}  ·  {techPickerCard.reg_number}  ·  {getPortalLabel(techPickerCard.portal ?? techPickerCard.fuel_type)}  ·  {getLocationLabel(techPickerCard.location ?? techPickerCard.branch)}
              </Text>
              <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                {(techniciansByJobCard[techPickerCard.assignment_key] ?? []).length} eligible technicians
              </Text>
            </View>
          )}
          <View style={{ padding: 12 }}>
            <TextInput style={S.pickerSearch} placeholder="Search technician..." placeholderTextColor="#94a3b8"
              value={techPickerSearch} onChangeText={setTechPickerSearch} autoFocus
            />
          </View>
          <FlatList
            data={techPickerItems}
            keyExtractor={e => e.employee_code}
            renderItem={({ item }) => (
              <TouchableOpacity style={S.pickerItem} onPress={() => {
                if (techPickerCard) { assignTechnician(techPickerCard.assignment_key, item.employee_code); setTechPickerCard(null) }
              }}>
                <Text style={S.pickerItemText}>{item.employee_name}</Text>
                {item.employee_code !== NOT_REQUIRED_TECHNICIAN_CODE && (
                  <Text style={S.pickerItemSub}>{item.employee_code}</Text>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={S.pickerEmpty}>No technicians match</Text>}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Bay picker modal ─────────────────────────────────────────────── */}
      <Modal visible={bayPickerCard !== null} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={S.pickerHeader}>
            <Text style={S.pickerTitle}>Select Bay — {bayPickerCard ? getPortalLabel(bayPickerCard.portal ?? bayPickerCard.fuel_type) : ''}</Text>
            <TouchableOpacity onPress={() => setBayPickerCard(null)}>
              <Text style={{ fontSize: 22, color: '#64748b' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={bayPickerCard ? buildBayOptions(bayPickerCard.fuel_type) : []}
            keyExtractor={b => b}
            numColumns={3}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => {
              const isCurrent = bayPickerCard && stageDrafts[bayPickerCard.assignment_key]?.bay_no === item
              return (
                <TouchableOpacity
                  style={[S.bayChip, isCurrent && S.bayChipActive]}
                  onPress={() => { if (bayPickerCard) { patchStageDraft(bayPickerCard.assignment_key, { bay_no: item }); setBayPickerCard(null) } }}>
                  <Text style={[S.bayChipText, isCurrent && { color: '#2563eb', fontWeight: '700' }]}>{item}</Text>
                </TouchableOpacity>
              )
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Support assignment modal ─────────────────────────────────────── */}
      <Modal visible={supportModalCard !== null} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              <View style={S.pickerHeader}>
                <Text style={S.pickerTitle}>Assign Additional Person</Text>
                <TouchableOpacity onPress={() => { if (!supportSaving) { setSupportModalCard(null); setSupportModalRole(''); setSupportModalCode('') } }}>
                  <Text style={{ fontSize: 22, color: '#64748b' }}>✕</Text>
                </TouchableOpacity>
              </View>

              {supportModalCard && (
                <View style={S.supportMeta}>
                  <Text style={S.supportMetaText}>
                    {supportModalCard.assignment_key}  ·  {supportModalCard.reg_number || '—'}  ·  {getLocationLabel(supportModalCard.location ?? supportModalCard.branch)}
                  </Text>
                </View>
              )}

              {/* Role buttons */}
              <Text style={S.fieldLabel}>Role</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {SUPPORT_ROLE_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.value}
                    style={[S.roleChip, supportModalRole === opt.value && S.roleChipActive]}
                    onPress={() => { setSupportModalRole(opt.value as SupportRole); setSupportModalCode('') }}>
                    <Text style={[S.roleChipText, supportModalRole === opt.value && S.roleChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Employee list */}
              {supportModalRole !== '' && (
                <>
                  <Text style={S.fieldLabel}>Employee ({supportModalEmployees.length} available)</Text>
                  {supportModalEmployees.length === 0 ? (
                    <Text style={S.emptyHint}>No employees found for selected role.</Text>
                  ) : (
                    <View style={{ gap: 4 }}>
                      {supportModalEmployees.map(emp => (
                        <TouchableOpacity key={emp.employee_code}
                          style={[S.empRow, supportModalCode === emp.employee_code && S.empRowActive]}
                          onPress={() => setSupportModalCode(emp.employee_code)}>
                          <Text style={[S.empRowText, supportModalCode === emp.employee_code && { color: '#2563eb', fontWeight: '600' }]}>
                            {emp.employee_name}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#94a3b8' }}>{emp.employee_code}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* Already added */}
              {supportModalCard && (supportAssignments[supportModalCard.assignment_key] ?? []).length > 0 && (
                <>
                  <Text style={[S.sectionTitle, { marginTop: 18 }]}>Already Added</Text>
                  {(supportAssignments[supportModalCard.assignment_key] ?? []).map(p => (
                    <View key={p.id ?? `${p.employee_code}-${p.assigned_at}`} style={S.existingSupportRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#1e293b' }}>{p.employee_name}</Text>
                        <Text style={{ fontSize: 11, color: '#94a3b8' }}>{p.employee_code}  ·  {supportRoleLabel(p.support_role)}</Text>
                      </View>
                      <TouchableOpacity style={S.removeBtn}
                        disabled={Boolean(supportSaving) || !p.id}
                        onPress={() => p.id && supportModalCard && removeSupportAssignment(supportModalCard.assignment_key, p.id)}>
                        <Text style={S.removeBtnText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}

              <TouchableOpacity
                style={[S.saveBtn, { marginTop: 20 }, (!supportModalRole || !supportModalCode || Boolean(supportSaving)) && { opacity: 0.4 }]}
                disabled={!supportModalRole || !supportModalCode || Boolean(supportSaving)}
                onPress={saveSupportAssignment}>
                {supportSaving ? <ActivityIndicator color="#fff" /> : <Text style={S.saveBtnText}>Save Assignment</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────
function FilterOption({ label, subLabel, active, onPress }: { label: string; subLabel: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[S.filterOptRow, active && S.filterOptRowActive]} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={[S.filterOptLabel, active && { color: '#2563eb' }]}>{label}</Text>
        <Text style={S.filterOptSub}>{subLabel}</Text>
      </View>
      {active && <Text style={S.filterOptCheck}>✓</Text>}
    </TouchableOpacity>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 5 }}>
      <Text style={{ fontSize: 11, color: '#94a3b8', width: 72, flexShrink: 0 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: '#334155', fontWeight: '500', flex: 1 }}>{value}</Text>
    </View>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, minWidth: 0 }}>
      <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '600', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ fontSize: 13, color: '#1e293b', fontWeight: '600' }} numberOfLines={2}>{value}</Text>
    </View>
  )
}

// ── Styles — compact mobile-first ────────────────────────────────────────────
const S = {
  root: { flex: 1, backgroundColor: '#f1f5f9' } as const,

  // toast
  toast:             { position: 'absolute' as const, top: 56, left: 12, right: 12, zIndex: 999, backgroundColor: '#166534', borderRadius: 12, padding: 12, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  toastError:        { backgroundColor: '#991b1b' } as const,
  toastText:         { color: '#fff', fontWeight: '600' as const, fontSize: 14, flex: 1 },

  // ── compact top bar ──
  topBar:            { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  topBarLeft:        { alignItems: 'flex-start' as const },
  topBarTitle:       { fontSize: 15, fontWeight: '800' as const, color: '#0f172a', flexShrink: 0 },
  topBarCount:       { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  searchWrap:        { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 10, height: 36, gap: 6 },
  searchIcon:        { fontSize: 13 },
  searchInput:       { flex: 1, fontSize: 13, color: '#1e293b', paddingVertical: 0 },
  refreshBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eff6ff', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: '#bfdbfe' },
  refreshBtnText:    { fontSize: 18, color: '#2563eb' },
  // ── horizontal slide tab bar (5 statuses) ──────────────────
  slideTabBar:       { backgroundColor: '#f8fafc', borderBottomWidth: 1, borderColor: '#e2e8f0', flexGrow: 0 } as const,
  slideTabContent:   { paddingHorizontal: 10, paddingVertical: 8, gap: 8, flexDirection: 'row' as const, alignItems: 'center' as const } as const,
  slideTab:          { flexDirection: 'column' as const, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 2, minWidth: 88, gap: 2 } as const,
  slideTabCount:     { fontSize: 18, fontWeight: '800' as const, lineHeight: 22 },
  slideTabLabel:     { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.2 },

  // ── status tabs (single line) ──
  tabsRow:           { backgroundColor: '#f8fafc', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  tabsContainer:     { paddingHorizontal: 10, paddingVertical: 8, gap: 7, alignItems: 'center' as const },
  tabPill:           { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5, gap: 4 },
  tabPillCount:      { fontSize: 13, fontWeight: '800' as const },
  tabPillLabel:      { fontSize: 11, fontWeight: '600' as const },

  cardCreatedAt:     { fontSize: 11, color: '#94a3b8', flexShrink: 1 },
  // Ageing badge
  ageingBadge:              { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 6, borderWidth: 1 } as const,
  ageingBadgeHold:          { backgroundColor: '#fff7ed', borderColor: '#f9731688' } as const,
  ageingBadgeInProcess:     { backgroundColor: '#f0f9ff', borderColor: '#0ea5e988' } as const,
  ageingBadgeText:          { fontSize: 11, fontWeight: '700' as const },
  ageingBadgeTextHold:      { color: '#c2410c' },
  ageingBadgeTextInProcess: { color: '#0369a1' },
  tabsGrid:          { backgroundColor: '#f8fafc', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, gap: 6, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  tabsRow1:          { flexDirection: 'row' as const, gap: 8 },
  tabsRow2:          { flexDirection: 'row' as const, gap: 6 },
  tabBig:            { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' as const, borderWidth: 2 },
  tabBigCount:       { fontSize: 22, fontWeight: '800' as const, lineHeight: 26 },
  tabBigLabel:       { fontSize: 12, fontWeight: '700' as const, marginTop: 1 },
  tabSmall:          { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' as const, borderWidth: 1.5 },
  tabSmallText:      { fontSize: 11, fontWeight: '600' as const },
  tabPillText:       { fontSize: 12, fontWeight: '600' as const },

  // ── dropdown filter bar ──
  dropdownBar:       { flexDirection: 'row' as const, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  dropdownBtn:       { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 10, paddingVertical: 7, minHeight: 44 },
  dropdownLabel:     { fontSize: 9, fontWeight: '700' as const, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 1 },
  dropdownVal:       { fontSize: 12, fontWeight: '600' as const, color: '#1e293b' },
  dropdownArrow:     { fontSize: 12, color: '#cbd5e1', marginLeft: 3 },
  dropdownArrowActive:{ color: '#2563eb' } as const,
  dropdownDot:       { position: 'absolute' as const, top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: '#2563eb' },
  dropdownDivider:   { width: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },

  // ── filter modal ──
  filterModalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' as const },
  filterModalSheet:  { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  filterModalHandle: { width: 36, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center' as const, marginTop: 10, marginBottom: 2 },
  filterModalHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  filterModalTitle:  { fontSize: 15, fontWeight: '700' as const, color: '#0f172a' },
  filterModalClose:  { fontSize: 18, color: '#94a3b8', fontWeight: '600' as const },
  filterOptRow:      { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderColor: '#f8fafc', minHeight: 52 },
  filterOptRowActive:{ backgroundColor: '#eff6ff' } as const,
  filterOptLabel:    { fontSize: 15, fontWeight: '600' as const, color: '#1e293b' },
  filterOptSub:      { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  filterOptCheck:    { fontSize: 16, color: '#2563eb', fontWeight: '700' as const, marginLeft: 8 },

  // ── cards ──
  card:              { backgroundColor: '#fff', borderRadius: 12, marginBottom: 7, overflow: 'hidden' as const, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  cardUnassigned:    { borderWidth: 1.5, borderColor: '#fee2e2' } as const,
  cardRow:           { flexDirection: 'row' as const, alignItems: 'stretch' as const, minHeight: 72 },
  statusStripe:      { width: 5 },
  cardInfo:          { flex: 1, paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'center' as const },
  cardLine1:         { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 2 },
  cardLine3:         { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 3, flexWrap: 'wrap' as const },
  regText:           { fontSize: 15, fontWeight: '800' as const, color: '#0f172a', letterSpacing: 0.4, flexShrink: 1 },
  cardModel:         { fontSize: 12, color: '#475569', fontWeight: '500' as const },
  jcNumberRow:       { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 3 },
  jcNumberLabel:     { fontSize: 11, color: '#6b7280', fontWeight: '500' as const },
  jcNumberValue:     { fontSize: 12, color: '#1d4ed8', fontWeight: '700' as const, flexShrink: 1 },
  portalBadge:       { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  portalBadgeText:   { fontSize: 10, fontWeight: '800' as const, letterSpacing: 0.4 },
  statusPill:        { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  statusPillText:    { fontSize: 10, fontWeight: '700' as const },
  techRow:           { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 4 },
  techIcon:          { fontSize: 11 },
  techName:          { fontSize: 12, color: '#1d4ed8', fontWeight: '600' as const, flex: 1 },
  bayTag:            { backgroundColor: '#dbeafe', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  bayTagText:        { fontSize: 11, color: '#1d4ed8', fontWeight: '700' as const },
  unassignedHint:    { fontSize: 11, color: '#f87171', fontStyle: 'italic' as const, marginTop: 3 },
  assignCTA:         { backgroundColor: '#ef4444', justifyContent: 'center' as const, alignItems: 'center' as const, paddingHorizontal: 14, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  assignCTAText:     { color: '#fff', fontSize: 12, fontWeight: '800' as const, letterSpacing: 0.3 },
  expandChevron:     { paddingHorizontal: 12, fontSize: 12, color: '#cbd5e1', alignSelf: 'center' as const },

  // ── expanded card body ──
  cardBody:          { paddingHorizontal: 12, paddingBottom: 14, paddingTop: 10, borderTopWidth: 1, borderColor: '#f1f5f9' },
  infoGrid:          { gap: 0 },
  infoBlock:         { gap: 5 },
  infoRow2Col:       { flexDirection: 'row' as const, gap: 6 },
  divider:           { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  sectionTitle:      { fontSize: 12, fontWeight: '700' as const, color: '#475569', marginBottom: 8 },
  fieldLabel:        { fontSize: 11, fontWeight: '600' as const, color: '#64748b', marginBottom: 5 },

  selectBtn:         { backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 48 },
  selectBtnVal:      { fontSize: 14, color: '#0f172a', fontWeight: '600' as const, flex: 1 },
  selectBtnPlaceholder:{ fontSize: 13, color: '#94a3b8', flex: 1 },
  selectBtnSub:      { fontSize: 11, color: '#64748b', marginTop: 1 },
  selectBtnArrow:    { fontSize: 20, color: '#94a3b8' },

  statusBlock:       { borderRadius: 8, paddingVertical: 9, alignItems: 'center' as const, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  statusBlockText:   { fontSize: 11, fontWeight: '500' as const, color: '#64748b' },

  tsRow:             { flexDirection: 'row' as const, backgroundColor: '#f8fafc', borderRadius: 10, overflow: 'hidden' as const },
  tsCell:            { flex: 1, padding: 10, alignItems: 'center' as const },
  tsDivider:         { width: 1, backgroundColor: '#e2e8f0' },
  tsLabel:           { fontSize: 9, fontWeight: '700' as const, color: '#94a3b8', letterSpacing: 0.8, marginBottom: 2 },
  tsVal:             { fontSize: 12, fontWeight: '600' as const, color: '#334155', textAlign: 'center' as const },

  remarkInput:       { backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, fontSize: 13, color: '#1e293b', minHeight: 56, textAlignVertical: 'top' as const },
  saveBtn:           { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 13, alignItems: 'center' as const, marginTop: 12, shadowColor: '#2563eb', shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  saveBtnText:       { color: '#fff', fontWeight: '700' as const, fontSize: 14 },

  addSupportBtn:     { backgroundColor: '#eff6ff', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#bfdbfe' },
  addSupportBtnText: { fontSize: 12, fontWeight: '700' as const, color: '#2563eb' },
  supportPill:       { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: '#e2e8f0', gap: 7, marginBottom: 4 },
  supportRoleTag:    { backgroundColor: '#dbeafe', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  supportRoleTagText:{ fontSize: 10, fontWeight: '800' as const, color: '#1d4ed8' },
  supportPillName:   { fontSize: 13, color: '#334155', fontWeight: '500' as const, flex: 1 },
  emptyHint:         { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' as const, marginTop: 2, marginBottom: 4 },

  pickerHeader:      { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, padding: 16, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  pickerTitle:       { fontSize: 16, fontWeight: '700' as const, color: '#0f172a', flex: 1 },
  pickerSearch:      { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: '#1e293b' },
  pickerItem:        { paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#f1f5f9', minHeight: 50, justifyContent: 'center' as const },
  pickerItemText:    { fontSize: 15, color: '#1e293b', fontWeight: '500' as const },
  pickerItemSub:     { fontSize: 12, color: '#64748b', marginTop: 2 },
  pickerEmpty:       { textAlign: 'center' as const, color: '#94a3b8', marginTop: 48, padding: 16 },

  bayChip:           { flex: 1, margin: 4, backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, alignItems: 'center' as const, borderWidth: 1, borderColor: '#e2e8f0' },
  bayChipActive:     { backgroundColor: '#eff6ff', borderColor: '#2563eb' } as const,
  bayChipText:       { fontSize: 14, fontWeight: '700' as const, color: '#475569' },

  supportMeta:       { backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  supportMetaText:   { fontSize: 13, color: '#475569', fontWeight: '500' as const },
  roleChip:          { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0' },
  roleChipActive:    { backgroundColor: '#eff6ff', borderColor: '#2563eb' } as const,
  roleChipText:      { fontSize: 13, color: '#64748b', fontWeight: '500' as const },
  roleChipTextActive:{ color: '#2563eb', fontWeight: '700' as const } as const,
  empRow:            { padding: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fff', marginBottom: 5 },
  empRowActive:      { backgroundColor: '#eff6ff', borderColor: '#2563eb' } as const,
  empRowText:        { fontSize: 14, color: '#1e293b', fontWeight: '500' as const },
  existingSupportRow:{ flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 9, borderBottomWidth: 1, borderColor: '#f1f5f9', gap: 8 },
  removeBtn:         { backgroundColor: '#fef2f2', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  removeBtnText:     { fontSize: 12, fontWeight: '700' as const, color: '#dc2626' },

  empty:             { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingTop: 80 },
  emptyIcon:         { fontSize: 44, marginBottom: 12 },
  emptyTitle:        { fontSize: 16, fontWeight: '700' as const, color: '#1e293b' },
  emptySub:          { fontSize: 13, color: '#94a3b8', marginTop: 4, textAlign: 'center' as const, paddingHorizontal: 32 },
}

