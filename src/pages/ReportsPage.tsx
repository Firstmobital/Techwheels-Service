import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import ServiceTypeReport from './reports/ServiceTypeReport'

type BranchFilter = '' | 'AJ' | 'JG PV' | 'JG EV'
type SourceTable = 'service_vas_jc_data' | 'job_card_closed_data'
type ReportSubPage = 'advisor-performance' | 'service-type'

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

export default function ReportsPage() {
  const [activeSubPage, setActiveSubPage] = useState<ReportSubPage>('service-type')
  const [sourceTable, setSourceTable] = useState<SourceTable>('service_vas_jc_data')
  const [branch, setBranch] = useState<BranchFilter>('')
  const [employeeCode, setEmployeeCode] = useState('')

  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const runReport = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      if (sourceTable === 'service_vas_jc_data') {
        let query = supabase
          .from('service_vas_jc_data')
          .select('branch, job_card_number, sr_assigned_to, employee_code, jc_closed_date_time, job_value')
          .order('jc_closed_date_time', { ascending: false })
          .limit(1000)

        if (branch) query = query.eq('branch', branch)
        if (employeeCode) query = query.eq('employee_code', employeeCode)

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

      if (branch) query = query.eq('branch', branch)
      if (employeeCode) query = query.eq('employee_code', employeeCode)

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
  }, [branch, employeeCode, sourceTable])

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Review performance and service type insights from imported service data.</p>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveSubPage('service-type')}
              className={[
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                activeSubPage === 'service-type'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              Service Type Report
            </button>
            <button
              type="button"
              onClick={() => setActiveSubPage('advisor-performance')}
              className={[
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                activeSubPage === 'advisor-performance'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              Advisor Performance Report
            </button>
          </div>
        </section>

        {activeSubPage === 'service-type' ? (
          <ServiceTypeReport />
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <div className="grid grid-cols-4 gap-3">
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

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Branch</label>
                  <select
                    value={branch}
                    onChange={(event) => setBranch(event.target.value as BranchFilter)}
                    className="rounded border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="">All branches</option>
                    <option value="AJ">AJ</option>
                    <option value="JG PV">JG PV</option>
                    <option value="JG EV">JG EV</option>
                  </select>
                </div>

                <div className="col-span-2 flex flex-col gap-1">
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
                  disabled={loading}
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
                  <span>Total Amount: Rs.{totals.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
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
                          <td className="px-3 py-2">{row.amount == null ? '-' : row.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
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
