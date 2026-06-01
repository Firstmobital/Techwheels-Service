import { useEffect, useMemo, useState } from 'react'
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
}

type RevenueRow = {
  job_card_number: string | null
  closed_date_time: string | null
  invoice_date: string | null
  total_invoice_amount: number | null
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
  return date.toLocaleString()
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

function extractFuelFromBay(bayNo: string | null | undefined): 'PV' | 'EV' | null {
  const normalized = String(bayNo ?? '').trim().toUpperCase()
  if (normalized.startsWith('PV-')) return 'PV'
  if (normalized.startsWith('EV-')) return 'EV'
  return null
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
      setAssignments(assignmentRows)

      const completedMap = new Map<string, TechnicianAssignmentRow>()
      assignmentRows
        .filter((row) => normalizeStatus(row.work_status) === 'completed')
        .forEach((row) => {
          const jc = String(row.job_card_number ?? '').trim()
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
      const jcNumbers = Array.from(new Set(
        completed
          .map((row) => String(row.job_card_number ?? '').trim())
          .filter(Boolean),
      ))

      if (jcNumbers.length === 0) {
        setIncomeByDay([])
        setLoading(false)
        return
      }

      const revenueRes = await supabase
        .from('job_card_closed_data')
        .select('job_card_number, closed_date_time, invoice_date, total_invoice_amount')
        .in('job_card_number', jcNumbers)

      if (revenueRes.error) {
        setError(revenueRes.error.message)
        setIncomeByDay([])
        setLoading(false)
        return
      }

      const revenueMap = new Map<string, RevenueRow>()
      ;(revenueRes.data ?? []).forEach((row) => {
        const key = String((row as { job_card_number?: string | null }).job_card_number ?? '').trim()
        if (!key) return

        const existing = revenueMap.get(key)
        const candidate = row as RevenueRow
        if (!existing) {
          revenueMap.set(key, candidate)
          return
        }

        const existingTs = new Date(existing.closed_date_time ?? existing.invoice_date ?? 0).getTime()
        const candidateTs = new Date(candidate.closed_date_time ?? candidate.invoice_date ?? 0).getTime()
        if (candidateTs > existingTs) {
          revenueMap.set(key, candidate)
        }
      })

      const dayAgg = new Map<string, IncomeDayRow>()

      completed.forEach((assignment) => {
        const jc = String(assignment.job_card_number ?? '').trim()
        if (!jc) return
        const revenue = revenueMap.get(jc)
        if (!revenue) return

        const gross = Number(revenue.total_invoice_amount ?? 0)
        if (!Number.isFinite(gross) || gross <= 0) return

        const dateKeySource = revenue.closed_date_time ?? revenue.invoice_date
        if (!dateKeySource) return
        const parsedDate = new Date(dateKeySource)
        if (Number.isNaN(parsedDate.getTime())) return
        const dateKey = parsedDate.toISOString().slice(0, 10)

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

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Technician</h1>
            <p className="mt-1 text-sm text-gray-500">
              {isAdmin
                ? 'Select any TECHNICIAN from Employee Master to view rows and day-wise income.'
                : 'View your assigned rows and day-wise income tracker.'}
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-end gap-2">
              <div>
                <label htmlFor="technician-select" className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Technician
                </label>
                <select
                  id="technician-select"
                  value={selectedTechnicianCode}
                  onChange={(e) => {
                    const nextCode = e.target.value
                    setSelectedTechnicianCode(nextCode)
                    void loadData(nextCode)
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                >
                  {technicianOptions.length === 0 ? (
                    <option value="">No technician found</option>
                  ) : (
                    technicianOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>{opt.code} - {opt.name}</option>
                    ))
                  )}
                </select>
              </div>
            </div>
          )}

          <div>
            <button
              onClick={() => void loadData()}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Income Tracker</h2>
            <p className="mt-1 text-sm text-gray-500">Computed from closed PSF revenue per completed case: (Total Workshop Revenue / 1.18) × 20% (PV) or 25% (EV).</p>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-right">
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Total Earnings</div>
            <div className="text-xl font-semibold text-emerald-800">{formatCurrency(totalIncome)}</div>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-gray-500">Loading income tracker...</div>
        ) : incomeByDay.length === 0 ? (
          <div className="mt-4 text-sm text-gray-500">No completed rows found for income computation yet.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Cases</th>
                  <th className="px-3 py-2 text-right">Gross Revenue</th>
                  <th className="px-3 py-2 text-right">Net (ex GST)</th>
                  <th className="px-3 py-2 text-right">Technician Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {incomeByDay.map((row) => (
                  <tr key={row.date}>
                    <td className="whitespace-nowrap px-3 py-2">{row.date}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{row.jobsCount}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(row.grossRevenue)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(row.netBeforeShare)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-emerald-700">{formatCurrency(row.technicianIncome)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
          {isAdmin ? `Selected Technician Rows (${assignments.length})` : `My Rows (${assignments.length})`}
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading technician rows...</div>
        ) : assignments.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            {isAdmin
              ? (technicianCodes.length === 0
                ? 'No TECHNICIAN found in Employee Master.'
                : 'No assigned rows found for the selected technician.')
              : (technicianCodes.length === 0
                ? 'No active TECHNICIAN mapping found for your account.'
                : 'No assigned rows found for your technician code(s).')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">JC Number</th>
                  <th className="px-3 py-2 text-left">Technician Code</th>
                  <th className="px-3 py-2 text-left">Technician Name</th>
                  <th className="px-3 py-2 text-left">Bay No</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">IN TS</th>
                  <th className="px-3 py-2 text-left">OUT TS</th>
                  <th className="px-3 py-2 text-left">Time Diff</th>
                  <th className="px-3 py-2 text-left">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {assignments.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{row.job_card_number}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.technician_code}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.technician_name}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.bay_no ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{statusLabel(row.work_status)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateTime(row.assigned_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateTime(row.out_ts)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.time_diff ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.remark ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
