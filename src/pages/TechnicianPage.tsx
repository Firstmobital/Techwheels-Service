import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

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
}

type RevenueRow = {
  job_card_number: string | null
  closed_date_time: string | null
  invoice_date: string | null
  final_labour_amount: number | string | null
}

type ReceptionEntryRow = {
  jc_number: string | null
  reg_number: string | null
}

type IncomeDayRow = {
  date: string
  jobsCount: number
  grossRevenue: number
  netBeforeShare: number
  technicianIncome: number
}

type TechnicianOption = {
  code: string
  name: string
}

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
  return parsedDate.toISOString().slice(0, 10)
}

export default function TechnicianPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<TechnicianAssignmentRow[]>([])
  const [incomeByDay, setIncomeByDay] = useState<IncomeDayRow[]>([])
  const [technicianCodes, setTechnicianCodes] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [technicianOptions, setTechnicianOptions] = useState<TechnicianOption[]>([])
  const [selectedTechnicianCode, setSelectedTechnicianCode] = useState('')

  async function loadData(adminSelectedCode?: string) {
    setLoading(true)
    setError(null)

    try {
      const authRes = await supabase.auth.getUser()
      const userId = authRes.data.user?.id
      if (!userId) {
        setAssignments([])
        setIncomeByDay([])
        setTechnicianCodes([])
        setTechnicianOptions([])
        setSelectedTechnicianCode('')
        setIsAdmin(false)
        setLoading(false)
        return
      }

      const profileRes = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      const userIsAdmin = String((profileRes.data as { role?: string | null } | null)?.role ?? '').trim().toLowerCase() === 'admin'
      setIsAdmin(userIsAdmin)

      let effectiveCodes: string[] = []

      if (userIsAdmin) {
        const allTechRes = await supabase
          .from('employee_master')
          .select('employee_code, employee_name, role')
          .order('employee_name', { ascending: true })

        if (allTechRes.error) {
          setError(allTechRes.error.message)
          setAssignments([])
          setIncomeByDay([])
          setTechnicianCodes([])
          setTechnicianOptions([])
          setSelectedTechnicianCode('')
          setLoading(false)
          return
        }

        const optionsMap = new Map<string, TechnicianOption>()
        ;(allTechRes.data ?? [])
          .filter((row) => String((row as { role?: string | null }).role ?? '').trim().toLowerCase() === 'technician')
          .forEach((row) => {
            const code = String((row as { employee_code?: string | null }).employee_code ?? '').trim().toUpperCase()
            if (!code) return
            const name = String((row as { employee_name?: string | null }).employee_name ?? '').trim()
            optionsMap.set(code, {
              code,
              name: name || code,
            })
          })

        const options = Array.from(optionsMap.values())
        setTechnicianOptions(options)

        const preferredCode = String(adminSelectedCode ?? selectedTechnicianCode).trim().toUpperCase()
        const hasPreferredCode = preferredCode.length > 0 && options.some((opt) => opt.code === preferredCode)
        const nextSelectedCode = hasPreferredCode ? preferredCode : (options[0]?.code ?? '')

        setSelectedTechnicianCode(nextSelectedCode)
        effectiveCodes = nextSelectedCode ? [nextSelectedCode] : []
      } else {
        setTechnicianOptions([])
        setSelectedTechnicianCode('')

        const mappingsRes = await supabase
          .from('user_employee_links')
          .select('employee_code, is_active')
          .eq('user_id', userId)
          .eq('is_active', true)

        if (mappingsRes.error) {
          setError(mappingsRes.error.message)
          setAssignments([])
          setIncomeByDay([])
          setTechnicianCodes([])
          setLoading(false)
          return
        }

        const mappedCodes = Array.from(new Set(
          (mappingsRes.data ?? [])
            .map((row) => String((row as { employee_code?: string }).employee_code ?? '').trim().toUpperCase())
            .filter(Boolean),
        ))

        if (mappedCodes.length === 0) {
          setAssignments([])
          setIncomeByDay([])
          setTechnicianCodes([])
          setLoading(false)
          return
        }

        const employeeRes = await supabase
          .from('employee_master')
          .select('employee_code, role')
          .in('employee_code', mappedCodes)

        if (employeeRes.error) {
          setError(employeeRes.error.message)
          setAssignments([])
          setIncomeByDay([])
          setTechnicianCodes([])
          setLoading(false)
          return
        }

        const technicianCodeSet = new Set(
          (employeeRes.data ?? [])
            .filter((row) => String((row as { role?: string | null }).role ?? '').trim().toLowerCase() === 'technician')
            .map((row) => String((row as { employee_code?: string }).employee_code ?? '').trim().toUpperCase())
            .filter(Boolean),
        )

        effectiveCodes = mappedCodes.filter((code) => technicianCodeSet.has(code))
      }

      setTechnicianCodes(effectiveCodes)

      if (effectiveCodes.length === 0) {
        setAssignments([])
        setIncomeByDay([])
        setLoading(false)
        return
      }

      const assignRes = await supabase
        .from('technician_assignments')
        .select('*')
        .in('technician_code', effectiveCodes)
        .order('assigned_at', { ascending: false })

      if (assignRes.error) {
        setError(assignRes.error.message)
        setAssignments([])
        setIncomeByDay([])
        setLoading(false)
        return
      }

      const assignmentRows = (assignRes.data ?? []) as TechnicianAssignmentRow[]

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

      // Fetch from service_reception_entries (same source as Floor Incharge page)
      let regNumberMap = new Map<string, string>()
      let revenueMap = new Map<string, RevenueRow>()

      if (completedJcNumbers.length > 0) {
        const revenueRes = await supabase
          .from('job_card_closed_data')
          .select('job_card_number, closed_date_time, invoice_date, final_labour_amount')
          .in('job_card_number', completedJcNumbers)

        if (revenueRes.error) {
          setError(revenueRes.error.message)
          setIncomeByDay([])
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

        const receptionRes = await supabase
          .from('service_reception_entries')
          .select('jc_number, reg_number')
          .in('jc_number', completedJcNumbers)

        if (!receptionRes.error && receptionRes.data) {
          ;(receptionRes.data ?? []).forEach((row: any) => {
            const key = String((row as { jc_number?: string | null }).jc_number ?? '').trim().toUpperCase()
            if (!key) return

            const regNum = String((row as ReceptionEntryRow).reg_number ?? '').trim()
            if (regNum && !regNumberMap.has(key)) {
              regNumberMap.set(key, regNum)
            }
          })
        }
      }

      // Add reg_number to assignment rows
      const enrichedAssignmentRows = assignmentRows.map((row) => ({
        ...row,
        reg_number: regNumberMap.get(String(row.job_card_number ?? '').trim().toUpperCase()) ?? null,
      }))
      setAssignments(enrichedAssignmentRows)

      // If no completed jobs, set empty income and return
      if (completedJcNumbers.length === 0) {
        setIncomeByDay([])
        setLoading(false)
        return
      }

      // Check if we have revenue data before processing income
      if (revenueMap.size === 0) {
        setIncomeByDay([])
        setLoading(false)
        return
      }

      const dayAgg = new Map<string, IncomeDayRow>()

      completed.forEach((assignment) => {
        const jc = String(assignment.job_card_number ?? '').trim().toUpperCase()
        if (!jc) return
        const revenue = revenueMap.get(jc)
        if (!revenue) return

        const gross = parseRevenueAmount(revenue.final_labour_amount)
        if (!Number.isFinite(gross) || gross <= 0) return

        const dateKey = getIncomeDateKey(assignment, revenue)
        if (!dateKey) return

        const fuel = extractFuelFromBay(assignment.bay_no)
        const shareRate = fuel === 'EV' ? 0.25 : 0.2
        const netBeforeShare = gross / 1.18
        const technicianIncome = netBeforeShare * shareRate

        const current = dayAgg.get(dateKey) ?? {
          date: dateKey,
          jobsCount: 0,
          grossRevenue: 0,
          netBeforeShare: 0,
          technicianIncome: 0,
        }

        current.jobsCount += 1
        current.grossRevenue += gross
        current.netBeforeShare += netBeforeShare
        current.technicianIncome += technicianIncome
        dayAgg.set(dateKey, current)
      })

      const dayRows = Array.from(dayAgg.values()).sort((a, b) => b.date.localeCompare(a.date))
      setIncomeByDay(dayRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load technician data')
      setAssignments([])
      setIncomeByDay([])
      setTechnicianCodes([])
      setTechnicianOptions([])
      setSelectedTechnicianCode('')
      setIsAdmin(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const totalIncome = useMemo(
    () => incomeByDay.reduce((sum, row) => sum + row.technicianIncome, 0),
    [incomeByDay],
  )

  const selectedTechnicianName = useMemo(() => {
    const selectedCode = String(selectedTechnicianCode ?? '').trim().toUpperCase()
    if (!selectedCode) return ''

    const option = technicianOptions.find((opt) => opt.code === selectedCode)
    if (option?.name) return option.name

    const assignmentName = assignments
      .find((row) => String(row.technician_code ?? '').trim().toUpperCase() === selectedCode)
      ?.technician_name

    return assignmentName ? String(assignmentName).trim() : selectedCode
  }, [assignments, selectedTechnicianCode, technicianOptions])

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="greet">
            <Icon name="tech" size={13} className="icon-align-text" />
            Technician
          </p>
          <h1>Assigned rows & income</h1>
          <p>Select any technician to view their assigned rows and day-wise income tracker.</p>
        </div>
        {isAdmin && (
          <label className="field field--no-gap tech-picker-field">
            <span className="label">Technician</span>
            <select
              className="sel"
              value={selectedTechnicianCode}
              onChange={(e) => {
                const nextCode = e.target.value
                setSelectedTechnicianCode(nextCode)
                void loadData(nextCode)
              }}
            >
              {technicianOptions.length === 0 ? (
                <option value="">No technician found</option>
              ) : (
                technicianOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.code} — {opt.name}
                  </option>
                ))
              )}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div className="toast error">
          <Icon name="alert" size={14} />
          {error}
        </div>
      )}

      {/* Income tracker */}
      <div className="card mb-gap">
        <div className="card__head">
          <div>
            <h3>Income tracker</h3>
            <div className="sub">
              Computed per completed case: (Labour Revenue ÷ 1.18) × 20% (PV) or 25% (EV).
            </div>
          </div>
          <div className="tech-income-total">
            <div className="tech-income-total__label">
              Total earnings
            </div>
            <div className="tech-income-total__value">
              {formatCurrency(totalIncome)}
            </div>
          </div>
        </div>
        <div className="card__body dense">
          {loading ? (
            <div className="empty-state">Loading income tracker...</div>
          ) : incomeByDay.length === 0 ? (
            <div className="empty-state">
              No completed-and-billed cases for income yet. Income appears once assigned cases are
              completed and the PSF invoice is closed.
            </div>
          ) : (
            <div className="tbl-wrap scroll">
              <table className="tbl tech-income-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="ctr">Cases</th>
                    <th className="text-right">Gross Revenue</th>
                    <th className="text-right">Net (ex GST)</th>
                    <th className="text-right">Technician Income</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeByDay.map((row) => (
                    <tr key={row.date}>
                      <td className="strong">{row.date}</td>
                      <td className="ctr">{row.jobsCount}</td>
                      <td className="text-right num-tabular">
                        {formatCurrency(row.grossRevenue)}
                      </td>
                      <td className="cell-muted text-right num-tabular">
                        {formatCurrency(row.netBeforeShare)}
                      </td>
                      <td className="text-right strong num-tabular tech-income-cell">
                        {formatCurrency(row.technicianIncome)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Assigned rows */}
      <div className="card">
        <div className="card__head">
          <div>
            <h3>
              {selectedTechnicianName ? `${selectedTechnicianName} rows` : 'Technician rows'}{' '}
              <span className="count-badge">({assignments.length})</span>
            </h3>
            <div className="sub">{selectedTechnicianCode || '—'}</div>
          </div>
        </div>
        <div className="card__body dense">
          {loading ? (
            <div className="empty-state">Loading technician rows...</div>
          ) : assignments.length === 0 ? (
            <div className="empty-state">
              {isAdmin
                ? technicianCodes.length === 0
                  ? 'No TECHNICIAN found in Employee Master.'
                  : 'No assigned rows found for the selected technician.'
                : technicianCodes.length === 0
                  ? 'No active TECHNICIAN mapping found for your account.'
                  : 'No assigned rows found for your technician code(s).'}
            </div>
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
                  {assignments.map((row) => (
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
                      <td className="ctr ts-cell">—</td>
                      <td className="remark-cell">{row.remark ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
