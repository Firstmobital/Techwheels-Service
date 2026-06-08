import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { applyBranchFilterToQuery } from '../../lib/branches'
import {
  getDateRangeBounds,
  type BranchFilter,
  type DateRangeFilter,
} from '../../lib/reportQueries'
import { supabase } from '../../lib/supabase'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SourceTable = 'service_vas_jc_data' | 'job_card_closed_data'

interface EmployeeOption {
  employee_code: string
  employee_name: string
  role: string | null
}

interface ReportRow {
  branch: string | null
  jobCardNumber: string | null
  srAssignedTo: string | null
  employeeCode: string | null
  eventTime: string | null
  amount: number | null
}

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

const QUERY_PAGE_SIZE = 1000

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN')
}

export default function AdvisorPerformanceMobile({ branch, dateFilter }: Props) {
  const [sourceTable, setSourceTable] = useState<SourceTable>('service_vas_jc_data')
  const [employeeCode, setEmployeeCode] = useState('')
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadEmployees = async () => {
      const { data, error: fetchError } = await supabase
        .from('employee_master')
        .select('employee_code, employee_name, role')
        .order('employee_code', { ascending: true })

      if (!active) return

      if (fetchError) {
        setError(fetchError.message)
        return
      }

      setEmployees((data as EmployeeOption[]) ?? [])
    }

    loadEmployees()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const runReport = async () => {
      setError(null)
      setLoading(true)

      try {
        const bounds = getDateRangeBounds(dateFilter)
        const fetchAllRows = async (
          table: SourceTable,
          columns: string,
          dateColumn: 'jc_closed_date_time' | 'closed_date_time',
        ): Promise<Record<string, unknown>[]> => {
          const rows: Record<string, unknown>[] = []
          let from = 0

          while (true) {
            let query = supabase
              .from(table)
              .select(columns)
              .order(dateColumn, { ascending: false })
              .order('id', { ascending: false })
              .range(from, from + QUERY_PAGE_SIZE - 1)

            query = applyBranchFilterToQuery(query, branch)
            if (employeeCode) query = query.eq('employee_code', employeeCode)
            if (bounds) query = query.gte(dateColumn, bounds.from).lt(dateColumn, bounds.toExclusive)

            const { data, error: fetchError } = await query
            if (fetchError) throw new Error(fetchError.message)

            const batch = (data as Record<string, unknown>[] | null) ?? []
            rows.push(...batch)

            if (batch.length < QUERY_PAGE_SIZE) break
            from += QUERY_PAGE_SIZE
          }

          return rows
        }

        if (sourceTable === 'service_vas_jc_data') {
          const data = await fetchAllRows(
            'service_vas_jc_data',
            'branch, job_card_number, sr_assigned_to, employee_code, jc_closed_date_time, job_value',
            'jc_closed_date_time',
          )

          const mappedRows: ReportRow[] = data.map((row) => ({
            branch: row.branch == null ? null : String(row.branch),
            jobCardNumber: row.job_card_number == null ? null : String(row.job_card_number),
            srAssignedTo: row.sr_assigned_to == null ? null : String(row.sr_assigned_to),
            employeeCode: row.employee_code == null ? null : String(row.employee_code),
            eventTime: row.jc_closed_date_time == null ? null : String(row.jc_closed_date_time),
            amount: typeof row.job_value === 'number' ? row.job_value : row.job_value == null ? null : Number(row.job_value),
          }))

          if (!active) return
          setRows(mappedRows)
          return
        }

        const data = await fetchAllRows(
          'job_card_closed_data',
          'branch, job_card_number, sr_assigned_to, employee_code, closed_date_time, total_invoice_amount',
          'closed_date_time',
        )

        const mappedRows: ReportRow[] = data.map((row) => ({
          branch: row.branch == null ? null : String(row.branch),
          jobCardNumber: row.job_card_number == null ? null : String(row.job_card_number),
          srAssignedTo: row.sr_assigned_to == null ? null : String(row.sr_assigned_to),
          employeeCode: row.employee_code == null ? null : String(row.employee_code),
          eventTime: row.closed_date_time == null ? null : String(row.closed_date_time),
          amount:
            (() => {
              const parsed =
                typeof row.total_invoice_amount === 'number'
                  ? row.total_invoice_amount
                  : row.total_invoice_amount == null
                  ? null
                  : Number(row.total_invoice_amount)
              if (parsed == null || !Number.isFinite(parsed)) return null
              return parsed / 1.18
            })(),
        }))

        if (!active) return
        setRows(mappedRows)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to generate advisor performance report')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    runReport()
    return () => {
      active = false
    }
  }, [branch, dateFilter, employeeCode, sourceTable])

  const totals = useMemo(() => {
    const totalAmount = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
    return {
      rowCount: rows.length,
      totalAmount,
    }
  }, [rows])

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.employee_code === employeeCode) ?? null,
    [employeeCode, employees],
  )

  const cycleEmployee = () => {
    if (employees.length === 0) {
      setEmployeeCode('')
      return
    }

    if (!employeeCode) {
      setEmployeeCode(employees[0].employee_code)
      return
    }

    const index = employees.findIndex((emp) => emp.employee_code === employeeCode)
    if (index < 0 || index >= employees.length - 1) {
      setEmployeeCode('')
      return
    }

    setEmployeeCode(employees[index + 1].employee_code)
  }

  const exportCsv = async () => {
    try {
      if (rows.length === 0) return

      const exportRows = rows.map((row) => ({
        event_time: row.eventTime ?? '',
        branch: row.branch ?? '',
        job_card_number: row.jobCardNumber ?? '',
        sr_assigned_to: row.srAssignedTo ?? '',
        employee_code: row.employeeCode ?? '',
        amount: row.amount ?? 0,
      }))

      await shareCsv(toCsv(exportRows), 'advisor-performance-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export advisor performance CSV')
    }
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-base font-semibold text-slate-900">Advisor Performance Report</Text>
        <Text className="text-xs text-slate-500 mt-1">Detailed rows by advisor and source table with employee-level filter.</Text>

        <View className="flex-row flex-wrap mt-3">
          <TouchableOpacity
            className={`rounded-full px-3 py-1 border mr-2 mb-2 ${sourceTable === 'service_vas_jc_data' ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'}`}
            onPress={() => setSourceTable('service_vas_jc_data')}
          >
            <Text className={`${sourceTable === 'service_vas_jc_data' ? 'text-white' : 'text-slate-700'} text-xs`}>
              VAS Data
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`rounded-full px-3 py-1 border mr-2 mb-2 ${sourceTable === 'job_card_closed_data' ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'}`}
            onPress={() => setSourceTable('job_card_closed_data')}
          >
            <Text className={`${sourceTable === 'job_card_closed_data' ? 'text-white' : 'text-slate-700'} text-xs`}>
              PSF Revenue
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="rounded border border-slate-300 px-2 py-1 mr-2 mb-2"
            onPress={cycleEmployee}
          >
            <Text className="text-[11px] text-slate-700">Employee: {selectedEmployee ? `${selectedEmployee.employee_code}` : 'All'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="rounded border border-slate-300 px-2 py-1 mb-2"
            onPress={() => setEmployeeCode('')}
          >
            <Text className="text-[11px] text-slate-700">Reset Employee</Text>
          </TouchableOpacity>
        </View>

        {selectedEmployee ? (
          <Text className="text-[11px] text-slate-600 mt-1">
            Selected: {selectedEmployee.employee_code} - {selectedEmployee.employee_name}
            {selectedEmployee.role ? ` (${selectedEmployee.role})` : ''}
          </Text>
        ) : (
          <Text className="text-[11px] text-slate-600 mt-1">Selected: all employees</Text>
        )}
      </View>

      {loading ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <View className="items-center py-6">
            <ActivityIndicator size="small" color="#2563eb" />
            <Text className="text-slate-500 mt-2">Loading advisor performance report...</Text>
          </View>
        </View>
      ) : error ? (
        <View className="bg-white border border-red-200 rounded-xl p-4">
          <Text className="text-red-700 font-semibold">Failed to load report</Text>
          <Text className="text-red-600 text-sm mt-1">{error}</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-semibold text-slate-900">Result</Text>
            <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
              <Text className="text-xs text-white font-semibold">Export CSV</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-[11px] text-slate-500 mb-2">
            Rows: {totals.rowCount.toLocaleString('en-IN')} | Total Amount: Rs. {formatCurrency(totals.totalAmount)}
          </Text>

          {rows.length === 0 ? (
            <Text className="text-sm text-slate-500">No records found for selected filters.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View className="flex-row bg-slate-100 rounded-t-md">
                  <Text className="w-36 px-2 py-2 text-[11px] font-semibold text-slate-700">Date</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Branch</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Job Card</Text>
                  <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700">SR Assigned To</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Employee</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Amount</Text>
                </View>

                {rows.map((row, idx) => (
                  <View key={`${row.jobCardNumber ?? 'row'}-${idx}`} className="flex-row border-b border-slate-100">
                    <Text className="w-36 px-2 py-2 text-xs text-slate-700">{formatDateTime(row.eventTime)}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.branch ?? '-'}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.jobCardNumber ?? '-'}</Text>
                    <Text className="w-32 px-2 py-2 text-xs text-slate-700">{row.srAssignedTo ?? '-'}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.employeeCode ?? '-'}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">
                      {row.amount == null ? '-' : formatCurrency(row.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      )}
    </View>
  )
}
