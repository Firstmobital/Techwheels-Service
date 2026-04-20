import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type BranchFilter,
  type DateRangeFilter,
  type DateRangePreset,
  getBranchOptions,
  getDateRangeBounds,
} from '../lib/reportQueries'
import { supabase } from '../lib/supabase'
import ServiceTypeReport from './reports/ServiceTypeReport'

type SourceTable = 'service_vas_jc_data' | 'job_card_closed_data'
type ReportCategoryId = 'labour-revenue' | 'performance'
type ReportId = 'service-type-labour-revenue' | 'advisor-performance'

interface EmployeeOption {
  employee_code: string
  employee_name: string
}

interface ReportRow {
  branch: string | null
  job_card_number: string | null
  sr_assigned_to: string | null
  employee_code: string | null
  event_time: string | null
  amount: number | null
}

interface ReportCategory {
  id: ReportCategoryId
  label: string
  description: string
}

interface ReportDefinition {
  id: ReportId
  categoryId: ReportCategoryId
  label: string
  description: string
}

const DATE_PRESET_OPTIONS: { label: string; value: DateRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this-week' },
  { label: 'This Month', value: 'this-month' },
  { label: 'Custom Date Range', value: 'custom' },
]

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: 'labour-revenue',
    label: 'Labour Revenue Reports',
    description: 'Revenue-focused reports across service operations.',
  },
  {
    id: 'performance',
    label: 'Performance Reports',
    description: 'Team and advisor level operational performance.',
  },
]

const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'service-type-labour-revenue',
    categoryId: 'labour-revenue',
    label: 'Service Type Wise Labour Revenue',
    description: 'Labour revenue, job count, and average by service type.',
  },
  {
    id: 'advisor-performance',
    categoryId: 'performance',
    label: 'Advisor Performance Report',
    description: 'Detailed rows by advisor and source table.',
  },
]

function getTodayDateInputValue(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ReportsPage() {
  const [activeCategory, setActiveCategory] = useState<ReportCategoryId>('labour-revenue')
  const [activeReport, setActiveReport] = useState<ReportId>('service-type-labour-revenue')

  const [branch, setBranch] = useState<BranchFilter>('ALL')
  const [branchOptions, setBranchOptions] = useState<string[]>([])
  const [branchError, setBranchError] = useState<string | null>(null)

  const [datePreset, setDatePreset] = useState<DateRangePreset>('this-month')
  const [customFrom, setCustomFrom] = useState(getTodayDateInputValue)
  const [customTo, setCustomTo] = useState(getTodayDateInputValue)

  const [sourceTable, setSourceTable] = useState<SourceTable>('service_vas_jc_data')
  const [employeeCode, setEmployeeCode] = useState('')

  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableReports = useMemo(
    () => REPORT_DEFINITIONS.filter((report) => report.categoryId === activeCategory),
    [activeCategory],
  )

  useEffect(() => {
    const isValid = availableReports.some((report) => report.id === activeReport)
    if (!isValid && availableReports.length > 0) {
      setActiveReport(availableReports[0].id)
    }
  }, [activeReport, availableReports])

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.employee_code === employeeCode) ?? null,
    [employeeCode, employees],
  )

  const totals = useMemo(() => {
    const totalAmount = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
    return {
      rowCount: rows.length,
      totalAmount,
    }
  }, [rows])

  const dateFilter = useMemo<DateRangeFilter>(
    () => ({
      preset: datePreset,
      customFrom,
      customTo,
    }),
    [customFrom, customTo, datePreset],
  )

  const customDateError = useMemo(() => {
    if (datePreset !== 'custom') return null
    if (!customFrom || !customTo) return 'Select both From and To date.'
    if (customTo < customFrom) return 'To date cannot be earlier than From date.'
    return null
  }, [customFrom, customTo, datePreset])

  const loadEmployees = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('employee_master')
      .select('employee_code, employee_name')
      .order('employee_code', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      return
    }

    setEmployees((data as EmployeeOption[]) ?? [])
  }, [])

  useEffect(() => {
    void loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    let active = true

    getBranchOptions()
      .then((options) => {
        if (!active) return
        setBranchError(null)
        setBranchOptions(options)
      })
      .catch((err: Error) => {
        if (!active) return
        setBranchOptions([])
        setBranchError(err.message)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (branch === 'ALL') return
    if (branchOptions.includes(branch)) return
    setBranch('ALL')
  }, [branch, branchOptions])

  const runReport = useCallback(async () => {
    if (customDateError) {
      setError(customDateError)
      return
    }

    setError(null)
    setLoading(true)

    try {
      const bounds = getDateRangeBounds(dateFilter)

      if (sourceTable === 'service_vas_jc_data') {
        let query = supabase
          .from('service_vas_jc_data')
          .select('branch, job_card_number, sr_assigned_to, employee_code, jc_closed_date_time, job_value')
          .order('jc_closed_date_time', { ascending: false })
          .limit(1000)

        if (branch !== 'ALL') query = query.eq('branch', branch)
        if (employeeCode) query = query.eq('employee_code', employeeCode)
        if (bounds) query = query.gte('jc_closed_date_time', bounds.from).lt('jc_closed_date_time', bounds.toExclusive)

        const { data, error: fetchError } = await query
        if (fetchError) throw new Error(fetchError.message)

        const mappedRows: ReportRow[] = ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
          branch: row.branch == null ? null : String(row.branch),
          job_card_number: row.job_card_number == null ? null : String(row.job_card_number),
          sr_assigned_to: row.sr_assigned_to == null ? null : String(row.sr_assigned_to),
          employee_code: row.employee_code == null ? null : String(row.employee_code),
          event_time: row.jc_closed_date_time == null ? null : String(row.jc_closed_date_time),
          amount: typeof row.job_value === 'number' ? row.job_value : row.job_value == null ? null : Number(row.job_value),
        }))

        setRows(mappedRows)
        return
      }

      let query = supabase
        .from('job_card_closed_data')
        .select('branch, job_card_number, sr_assigned_to, employee_code, closed_date_time, total_invoice_amount')
        .order('closed_date_time', { ascending: false })
        .limit(1000)

      if (branch !== 'ALL') query = query.eq('branch', branch)
      if (employeeCode) query = query.eq('employee_code', employeeCode)
      if (bounds) query = query.gte('closed_date_time', bounds.from).lt('closed_date_time', bounds.toExclusive)

      const { data, error: fetchError } = await query
      if (fetchError) throw new Error(fetchError.message)

      const mappedRows: ReportRow[] = ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
        branch: row.branch == null ? null : String(row.branch),
        job_card_number: row.job_card_number == null ? null : String(row.job_card_number),
        sr_assigned_to: row.sr_assigned_to == null ? null : String(row.sr_assigned_to),
        employee_code: row.employee_code == null ? null : String(row.employee_code),
        event_time: row.closed_date_time == null ? null : String(row.closed_date_time),
        amount:
          typeof row.total_invoice_amount === 'number'
            ? row.total_invoice_amount
            : row.total_invoice_amount == null
            ? null
            : Number(row.total_invoice_amount),
      }))

      setRows(mappedRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report.')
    } finally {
      setLoading(false)
    }
  }, [branch, customDateError, dateFilter, employeeCode, sourceTable])

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Grouped reports with shared Branch and Date filters.</p>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {REPORT_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={[
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  activeCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')}
              >
                {category.label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-gray-500">
            {REPORT_CATEGORIES.find((item) => item.id === activeCategory)?.description}
          </p>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            {availableReports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setActiveReport(report.id)}
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  activeReport === report.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900',
                ].join(' ')}
              >
                {report.label}
              </button>
            ))}
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {REPORT_DEFINITIONS.find((item) => item.id === activeReport)?.description}
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Branch
              <select
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="ALL">All Branches</option>
                {branchOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Date Range
              <select
                value={datePreset}
                onChange={(event) => setDatePreset(event.target.value as DateRangePreset)}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              >
                {DATE_PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {datePreset === 'custom' && (
              <>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  From
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                    className="rounded border border-gray-300 px-2 py-2 text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  To
                  <input
                    type="date"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                    className="rounded border border-gray-300 px-2 py-2 text-sm"
                  />
                </label>
              </>
            )}
          </div>

          {branchError && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Branch list could not be loaded from employee master: {branchError}. Showing All Branches fallback.
            </p>
          )}

          {customDateError && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {customDateError}
            </p>
          )}
        </section>

        {activeReport === 'service-type-labour-revenue' ? (
          <ServiceTypeReport branch={branch} dateFilter={dateFilter} />
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Data Source</label>
                  <select
                    value={sourceTable}
                    onChange={(event) => setSourceTable(event.target.value as SourceTable)}
                    className="rounded border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="service_vas_jc_data">VAS Data</option>
                    <option value="job_card_closed_data">Job Card Closed Data</option>
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Employee (Code and Name)</label>
                  <select
                    value={employeeCode}
                    onChange={(event) => setEmployeeCode(event.target.value)}
                    className="rounded border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="">All employees</option>
                    {employees.map((employee) => (
                      <option key={employee.employee_code} value={employee.employee_code}>
                        {employee.employee_code} - {employee.employee_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void runReport()}
                  disabled={loading || Boolean(customDateError)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Generating...' : 'Generate Report'}
                </button>

                <span className="text-xs text-gray-500">
                  {selectedEmployee
                    ? `Selected: ${selectedEmployee.employee_code} - ${selectedEmployee.employee_name}`
                    : 'Selected: all employees'}
                </span>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <p className="text-sm font-semibold text-gray-900">Result</p>
                <div className="text-xs text-gray-500">
                  <span className="mr-4">Rows: {totals.rowCount.toLocaleString()}</span>
                  <span>Total Amount: Rs. {totals.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="overflow-x-auto px-5 py-4">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Branch</th>
                      <th className="px-3 py-2 font-semibold">Job Card</th>
                      <th className="px-3 py-2 font-semibold">SR Assigned To</th>
                      <th className="px-3 py-2 font-semibold">Employee Code</th>
                      <th className="px-3 py-2 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-gray-400" colSpan={6}>No records found for current filters.</td>
                      </tr>
                    ) : (
                      rows.map((row, idx) => (
                        <tr key={`${row.job_card_number ?? 'row'}-${idx}`} className="border-b border-gray-100">
                          <td className="px-3 py-2 text-gray-500">
                            {row.event_time ? new Date(row.event_time).toLocaleString('en-IN') : '-'}
                          </td>
                          <td className="px-3 py-2">{row.branch ?? '-'}</td>
                          <td className="px-3 py-2">{row.job_card_number ?? '-'}</td>
                          <td className="px-3 py-2">{row.sr_assigned_to ?? '-'}</td>
                          <td className="px-3 py-2">{row.employee_code ?? '-'}</td>
                          <td className="px-3 py-2">
                            {row.amount == null ? '-' : row.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
