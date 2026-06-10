import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import { listFloorInchargeEntries, listReceptionEntries, type ReceptionEntryRow } from '../lib/api'
import { sendTechnicianDailyEarningsTestEmail } from '../lib/api/email'

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
  reg_number?: string | null
  branch?: string | null
  fuel_type?: string | null
  gross_labour_amount?: number
  technician_income?: number
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

const QUERY_PAGE_SIZE = 1000
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

function getIncomeDateKey(assignment: TechnicianAssignmentRow, revenue: RevenueRow): string | null {
  const source =
    revenue.closed_date_time ??
    revenue.invoice_date ??
    assignment.out_ts ??
    assignment.assigned_at

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

function getAssignmentDateKey(row: TechnicianAssignmentRow): string | null {
  const dateSource = row.out_ts ?? row.assigned_at
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
): number {
  if (!Number.isFinite(grossLabourAmount) || grossLabourAmount <= 0) return 0
  const fuel = extractFuelFromBay(bayNo)
  const sharePercent = fuel === 'EV' ? evSharePercent : pvSharePercent
  const netBeforeShare = grossLabourAmount / 1.18
  return netBeforeShare * (sharePercent / 100)
}

export default function TechnicianPage() {
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [error, setError] = useState<string | null>(null)
  const [reportEmailState, setReportEmailState] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [sendingReportEmail, setSendingReportEmail] = useState(false)
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

      const assignmentRows: TechnicianAssignmentRow[] = []
      let from = 0

      while (true) {
        let assignQuery = supabase
          .from('technician_assignments')
          .select('*')
          .gte('assigned_at', dateRange.from + 'T00:00:00+05:30')
          .lte('assigned_at', dateRange.to + 'T23:59:59+05:30')
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
        assignmentRows.push(...batch)

        if (batch.length < QUERY_PAGE_SIZE) {
          break
        }

        from += QUERY_PAGE_SIZE
      }

      const assignmentJcNumbers = Array.from(new Set(
        assignmentRows
          .map((row) => String(row.job_card_number ?? '').trim().toUpperCase())
          .filter(Boolean),
      ))

      // Get completed assignments to query revenue data
      const completedMap = new Map<string, TechnicianAssignmentRow>()
      assignmentRows
        .filter((row) => normalizeStatus(row.work_status) === 'completed')
        .forEach((row) => {
          const jc = String(row.job_card_number ?? '').trim().toUpperCase()
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
          .map((row) => String(row.job_card_number ?? '').trim().toUpperCase())
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
        const revenueRes = await supabase
          .from('job_card_closed_data')
          .select('job_card_number, closed_date_time, invoice_date, final_labour_amount')
          .in('job_card_number', completedJcNumbers)

        if (revenueRes.error) {
          setError(revenueRes.error.message)
          setLoading(false)
          return
        }

        ;(revenueRes.data ?? []).forEach((row: any) => {
          const key = String((row as { job_card_number?: string | null }).job_card_number ?? '').trim().toUpperCase()
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

      // Add reg_number to assignment rows
      const grossByJc = new Map<string, number>()

      completed.forEach((assignment) => {
        const jc = String(assignment.job_card_number ?? '').trim().toUpperCase()
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
        const jc = String(row.job_card_number ?? '').trim().toUpperCase()
        const inferredBranch = inferBranchFromAssignment(row)
        return {
          ...row,
          reg_number: regNumberMap.get(jc) ?? null,
          branch: branchMap.get(jc) ?? inferredBranch,
          fuel_type: fuelTypeMap.get(jc) ?? null,
          gross_labour_amount: grossByJc.get(jc) ?? 0,
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

  async function handleSendYesterdayReportEmail() {
    setSendingReportEmail(true)
    setReportEmailState(null)

    const res = await sendTechnicianDailyEarningsTestEmail()
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
      message: `Email sent for ${res.data.reportDateIst}. Rows: ${res.data.rowCount}, Total: ${formatCurrency(res.data.totalEarnings)}.`,
    })
    setSendingReportEmail(false)
  }

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="greet">
            <Icon name="tech" size={13} className="icon-align-text" />
            Technician
          </p>
          <h1>Technician earnings tracker</h1>
          <p>Drill down: technician → day → vehicle → job card details (JC #, Reg, Bay, Status, IN/OUT TS, Time Diff, Remark).</p>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />



        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">Filter by location:</span>
          <button
            type="button"
            onClick={() => setBranchFilter('all')}
            className={`btn btn--sm ${branchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          >
            All ({dateScopedAssignmentsWithIncome.length})
          </button>
          {branches.map((branch) => {
            const count = dateScopedAssignmentsWithIncome.filter((row) => getBranchLabel(row.branch) === branch).length
            return (
              <button
                key={branch}
                type="button"
                onClick={() => setBranchFilter(branch)}
                className={`btn btn--sm ${branchFilter === branch ? 'btn--primary' : 'btn--ghost'}`}
              >
                {branch} ({count})
              </button>
            )
          })}
        </div>

        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">Filter by fuel type:</span>
          <button
            type="button"
            onClick={() => setFuelTypeFilter('all')}
            className={`btn btn--sm ${fuelTypeFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          >
            All ({branchScopedAssignmentsWithIncome.length})
          </button>
          {fuelTypeOptions.map((fuelType) => {
            const count = branchScopedAssignmentsWithIncome.filter((row) => getAssignmentFuelTypeLabel(row) === fuelType).length
            return (
              <button
                key={fuelType}
                type="button"
                onClick={() => setFuelTypeFilter(fuelType)}
                className={`btn btn--sm ${fuelTypeFilter === fuelType ? 'btn--primary' : 'btn--ghost'}`}
              >
                {fuelType} ({count})
              </button>
            )
          })}
        </div>

        {canEditSharePercent && (
          <div className="toolbar toolbar--tight">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => void handleSendYesterdayReportEmail()}
              disabled={sendingReportEmail}
            >
              <Icon name="mail" size={14} className="icon-align-text" />
              {sendingReportEmail ? 'Sending test email…' : 'Send Yesterday Earnings Test Email'}
            </button>
          </div>
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

      {/* Summary chips */}
      <div className="summary">
        <div className="schip">
          <span className="ic">
            <Icon name="tech" size={16} />
          </span>
          <div>
            <div className="n">{technicianCards.length}</div>
            <div className="l">Technicians</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
            <Icon name="checksm" size={16} />
          </span>
          <div>
            <div className="n">{formatCurrency(totalIncome)}</div>
            <div className="l">Total earnings</div>
          </div>
        </div>
        <div className="schip schip--date-filter">
          <div className="schip-date-filter__head">
            <div className="l">Date range filter</div>
          </div>
          <div className="schip-date-filter__controls">
            <label className="schip-date-filter__field" htmlFor="tech-date-from">
              <span>From</span>
              <input
                id="tech-date-from"
                type="date"
                className="inp"
                value={fromDate}
                onChange={(e) => {
                  const next = e.target.value
                  setFromDate(next)
                  if (toDate && next && next > toDate) {
                    setToDate(next)
                  }
                }}
              />
            </label>
            <label className="schip-date-filter__field" htmlFor="tech-date-to">
              <span>To</span>
              <input
                id="tech-date-to"
                type="date"
                className="inp"
                value={toDate}
                onChange={(e) => {
                  const next = e.target.value
                  setToDate(next)
                  if (fromDate && next && next < fromDate) {
                    setFromDate(next)
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--sm schip-date-filter__clear"
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
              disabled={!fromDate && !toDate}
            >
              Clear
            </button>
          </div>
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
                      onClick={() => {
                        setPvSharePercent(parsedDraftPvSharePercent)
                        setEvSharePercent(parsedDraftEvSharePercent)
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
                JC #, Reg #, Bay, Status, IN TS, OUT TS, Time Diff, Remark
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
                      <th className="ctr">Time Diff</th>
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
                        <td className="ctr ts-cell">{row.time_diff ?? '—'}</td>
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
