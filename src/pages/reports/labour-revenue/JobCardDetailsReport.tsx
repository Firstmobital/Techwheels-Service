import { useEffect, useMemo, useState } from 'react'
import { getDateRangeBounds } from '../../../lib/reportQueries'
import { applyBranchFilterToQuery } from '../../../lib/branches'
import { supabase } from '../../../lib/supabase'
import { buildEmployeeLookupIndex, resolveEmployeeForSr, type EmployeeRecord } from '../../../lib/employeeMatcher'
import type { ReportViewProps } from '../types'

type EmployeeMasterRecord = EmployeeRecord & { fuel_type: string | null }

interface ServiceInvoiceOrderRow {
  branch: string | null
  job_card_number: string | null
  status: string | null
  invoiced: string | null
  sr_type: string | null
  created_date_time: string | null
  closed_date_time: string | null
  sr_assigned_to: string | null
  sr_assigned_to_name: string | null
  employee_location?: string | null
  employee_fuel_type?: string | null
  account: string | null
}

type KPIType = 'cancelled' | 'closed-not-invoiced' | 'open' | null

function isTruthyInvoiceValue(value: string | null): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return ['yes', 'y', 'true', '1', 'invoiced', 'done'].includes(normalized)
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '—'
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-IN') + ' ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateString
  }
}

function parseFuelSelectionFromBranch(branch: string): 'PV' | 'EV' | null {
  const normalized = String(branch ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized === 'sitapura pv') return 'PV'
  if (normalized === 'sitapura ev') return 'EV'
  if (normalized === 'all_pv') return 'PV'
  if (normalized === 'all_ev') return 'EV'
  if (normalized === 'ajmer road pv') return 'PV'
  if (normalized === 'ajmer road ev') return 'EV'
  return null
}

function getFuelScopedBranch(branch: string): string {
  const normalized = String(branch ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

  if (normalized.startsWith('sitapura')) return 'Sitapura'
  if (normalized.startsWith('ajmer road')) return 'Ajmer Road'

  return 'ALL'
}

function parseBranchSelectionFromFilter(branch: string): string {
  const normalized = String(branch ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

  if (normalized === 'all' || normalized === 'all branches' || normalized === 'all_pv' || normalized === 'all_ev') {
    return 'ALL'
  }

  if (normalized === 'sitapura pv' || normalized === 'sitapura ev') {
    return 'Sitapura'
  }

  if (normalized === 'ajmer road pv' || normalized === 'ajmer road ev') {
    return 'Ajmer Road'
  }

  return branch
}

function normalizeFuelBucket(rawFuel: unknown): 'PV' | 'EV' | null {
  const normalized = String(rawFuel ?? '').trim().toLowerCase()
  if (!normalized) return null

  if (normalized === 'ev' || normalized.includes('electric')) {
    return 'EV'
  }

  if (
    normalized === 'pv' ||
    normalized.includes('petrol') ||
    normalized.includes('diesel') ||
    normalized.includes('cng') ||
    normalized.includes('hybrid') ||
    normalized.includes('lpg')
  ) {
    return 'PV'
  }

  return null
}

function normalizeJobCardNumber(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null

  const normalized = String(raw).trim().replace(/\s+/g, ' ').toUpperCase()
  if (!normalized) return null

  const withoutDecimalSuffix = normalized.replace(/\.0+$/, '')
  return withoutDecimalSuffix || null
}

function parseTime(value: string | null): number {
  if (!value) return Number.NaN
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

function getRowRecency(row: ServiceInvoiceOrderRow): number {
  const createdAt = parseTime(row.created_date_time)
  const closedAt = parseTime(row.closed_date_time)

  if (!Number.isNaN(createdAt) && !Number.isNaN(closedAt)) {
    return Math.max(createdAt, closedAt)
  }

  if (!Number.isNaN(closedAt)) return closedAt
  if (!Number.isNaN(createdAt)) return createdAt
  return Number.NEGATIVE_INFINITY
}

function dedupeRowsByJobCard(rows: ServiceInvoiceOrderRow[]): ServiceInvoiceOrderRow[] {
  const deduped = new Map<string, ServiceInvoiceOrderRow>()
  const noJobCardRows: ServiceInvoiceOrderRow[] = []

  for (const row of rows) {
    const jobCard = normalizeJobCardNumber(row.job_card_number)
    const branchKey = String(row.branch ?? '').trim().toUpperCase()

    if (!jobCard) {
      noJobCardRows.push(row)
      continue
    }

    const key = `${branchKey}::${jobCard}`
    const existing = deduped.get(key)

    if (!existing) {
      deduped.set(key, row)
      continue
    }

    if (getRowRecency(row) >= getRowRecency(existing)) {
      deduped.set(key, row)
    }
  }

  return [...deduped.values(), ...noJobCardRows]
}

export default function JobCardDetailsReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<ServiceInvoiceOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedKPI, setSelectedKPI] = useState<KPIType>(null)
  const [employees, setEmployees] = useState<EmployeeMasterRecord[]>([])

  // Fetch employees once on mount
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const { data, error: empError } = await supabase
          .from('employee_master')
          .select('employee_code, employee_name, location, department, role, fuel_type')
          .limit(5000)

        if (empError) throw new Error(empError.message)
        setEmployees((data as EmployeeMasterRecord[]) ?? [])
      } catch (err) {
        console.error('Failed to fetch employees:', err)
        setEmployees([])
      }
    }

    void fetchEmployees()
  }, [])

  // Build employee lookup index
  const employeeIndex = useMemo(() => buildEmployeeLookupIndex(employees), [employees])
  const employeeMasterByCode = useMemo(() => {
    const byCode = new Map<string, EmployeeMasterRecord>()
    for (const employee of employees) {
      const code = String(employee.employee_code ?? '').trim().toUpperCase()
      if (!code) continue
      byCode.set(code, employee)
    }
    return byCode
  }, [employees])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        const bounds = getDateRangeBounds(dateFilter)
        const fuelSelection = parseFuelSelectionFromBranch(branch)
        const branchSelection = parseBranchSelectionFromFilter(branch)
        const queryBranch = fuelSelection ? getFuelScopedBranch(branch) : branchSelection

        let query = supabase
          .from('service_invoice_order_data')
          .select('branch, job_card_number, status, invoiced, sr_type, created_date_time, closed_date_time, sr_assigned_to, account')
          .limit(5000)

        query = applyBranchFilterToQuery(query, queryBranch)

        if (bounds) {
          query = query.gte('created_date_time', bounds.from).lt('created_date_time', bounds.toExclusive)
        }

        const { data, error: fetchError } = await query
        if (fetchError) throw new Error(fetchError.message)

        const allRows = (data as ServiceInvoiceOrderRow[] | null) ?? []

        // Map sr_assigned_to with employee names and fuel buckets from employee_master
        let mappedRows = allRows.map((row) => {
          const matchResult = resolveEmployeeForSr(row.sr_assigned_to, employeeIndex)
          const matchedEmployee = matchResult.employeeCode
            ? employeeMasterByCode.get(matchResult.employeeCode.trim().toUpperCase())
            : undefined

          return {
            ...row,
            sr_assigned_to_name: matchedEmployee?.employee_name ?? row.sr_assigned_to,
            employee_location: matchedEmployee?.location ?? null,
            employee_fuel_type: matchedEmployee?.fuel_type ?? null,
          }
        })

        // Apply fuel filter AFTER merge using employee_master fuel_type
        if (fuelSelection) {
          mappedRows = mappedRows.filter((row) => {
            const employeeFuelBucket = normalizeFuelBucket(row.employee_fuel_type)
            return employeeFuelBucket === fuelSelection
          })
        }

        const uniqueRows = dedupeRowsByJobCard(mappedRows)

        if (!cancelled) {
          setRows(uniqueRows)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load report.')
          setRows([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [branch, dateFilter, employeeIndex, employeeMasterByCode])

  const summary = useMemo(() => {
    let cancelledCount = 0
    let closedNotInvoicedCount = 0
    let openCount = 0

    for (const row of rows) {
      const status = (row.status ?? '').trim().toLowerCase()
      const invoiced = isTruthyInvoiceValue(row.invoiced)

      // Cancelled: status is "cancelled" (or contains "cancel" but not part of another word)
      if (status === 'cancelled' || status === 'cancel') {
        cancelledCount += 1
      }
      // Closed Not Invoiced: status is "closed" AND invoiced is NOT true
      else if ((status === 'closed' || status.includes('closed')) && !invoiced) {
        closedNotInvoicedCount += 1
      }
      // Open: status is "open" or other non-closed, non-cancelled statuses
      else if (status === 'open' || (status !== 'closed' && status !== 'cancelled' && status !== 'cancel')) {
        openCount += 1
      }
    }

    return {
      cancelledCount,
      closedNotInvoicedCount,
      openCount,
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    if (!selectedKPI) return []

    return rows.filter((row) => {
      const status = (row.status ?? '').trim().toLowerCase()
      const invoiced = isTruthyInvoiceValue(row.invoiced)

      if (selectedKPI === 'cancelled') {
        return status === 'cancelled' || status === 'cancel'
      } else if (selectedKPI === 'closed-not-invoiced') {
        return (status === 'closed' || status.includes('closed')) && !invoiced
      } else if (selectedKPI === 'open') {
        return status === 'open' || (status !== 'closed' && status !== 'cancelled' && status !== 'cancel')
      }
      return false
    })
  }, [rows, selectedKPI])

  const previewRows = useMemo(() => filteredRows.slice(0, 100), [filteredRows])

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Job Card Details</h2>
            <p className="mt-1 text-sm text-gray-600">Source: service_invoice_order_data</p>
          </div>
          {loading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => setSelectedKPI('cancelled')}
            className={`cursor-pointer rounded-lg border transition-all ${
              selectedKPI === 'cancelled'
                ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-300'
                : 'border-gray-200 bg-gradient-to-br from-orange-50 to-orange-100 hover:shadow-md'
            } p-4`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Cancelled JC</p>
            <p className="mt-2 text-2xl font-bold text-orange-900">{summary.cancelledCount.toLocaleString('en-IN')}</p>
          </button>

          <button
            onClick={() => setSelectedKPI('closed-not-invoiced')}
            className={`cursor-pointer rounded-lg border transition-all ${
              selectedKPI === 'closed-not-invoiced'
                ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300'
                : 'border-gray-200 bg-gradient-to-br from-amber-50 to-amber-100 hover:shadow-md'
            } p-4`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">JC Closed But Not Invoiced</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{summary.closedNotInvoicedCount.toLocaleString('en-IN')}</p>
          </button>

          <button
            onClick={() => setSelectedKPI('open')}
            className={`cursor-pointer rounded-lg border transition-all ${
              selectedKPI === 'open' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300' : 'border-gray-200 bg-gradient-to-br from-blue-50 to-blue-100 hover:shadow-md'
            } p-4`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">JC Open</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">{summary.openCount.toLocaleString('en-IN')}</p>
          </button>
        </div>
      </section>

      {selectedKPI && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
            <h3 className="font-semibold text-gray-900">
              {selectedKPI === 'cancelled' && 'Cancelled Job Cards'}
              {selectedKPI === 'closed-not-invoiced' && 'JC Closed But Not Invoiced'}
              {selectedKPI === 'open' && 'Open Job Cards'}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Showing {previewRows.length} of {filteredRows.length} records
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Job Card #</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Service Type</th>
                  <th className="px-4 py-3 font-medium">Service Advisor</th>
                  <th className="px-4 py-3 font-medium">Created Date</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.length > 0 ? (
                  previewRows.map((row, index) => (
                    <tr key={`${row.job_card_number ?? 'row'}-${index}`} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{row.branch ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.job_card_number ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{row.status ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{row.sr_type ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="text-gray-900 font-medium">{row.sr_assigned_to_name ?? '—'}</div>
                        <div className="text-[11px] text-gray-500">{row.sr_assigned_to ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDateTime(row.created_date_time)}</td>
                      <td className="px-4 py-3 text-gray-700">{row.account ?? '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      {loading ? 'Loading records...' : 'No records found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
