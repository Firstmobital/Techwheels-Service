import { useEffect, useMemo, useState } from 'react'
import { getTableColumns } from '../../../lib/getTableColumns'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'
import { MasterDataUploadSection } from './MasterDataUploadSection'

interface ColumnNullCountRow {
  columnName: string
  nullCount: number
  nonNullCount: number
  nullPercentage: number
}

async function getAllServiceDataNullCounts(): Promise<{ totalRows: number; rows: ColumnNullCountRow[] }> {
  const columns = await getTableColumns('all_service_data')

  if (columns.length === 0) {
    return { totalRows: 0, rows: [] }
  }

  const { count: totalRows, error: totalCountError } = await supabase
    .from('all_service_data')
    .select('*', { count: 'exact', head: true })

  if (totalCountError) {
    throw new Error(totalCountError.message)
  }

  const safeTotalRows = totalRows ?? 0

  const counts = await Promise.all(
    columns.map(async (columnName) => {
      const { count, error } = await supabase
        .from('all_service_data')
        .select('*', { count: 'exact', head: true })
        .is(columnName, null)

      if (error) {
        throw new Error(error.message)
      }

      const nullCount = count ?? 0
      const nonNullCount = Math.max(0, safeTotalRows - nullCount)
      const nullPercentage = safeTotalRows > 0 ? (nullCount / safeTotalRows) * 100 : 0

      return {
        columnName,
        nullCount,
        nonNullCount,
        nullPercentage,
      }
    }),
  )

  const rows = counts.sort((a, b) => {
    if (b.nullCount !== a.nullCount) return b.nullCount - a.nullCount
    return a.columnName.localeCompare(b.columnName)
  })

  return {
    totalRows: safeTotalRows,
    rows,
  }
}

export default function MasterDataNullCountsReport(_props: ReportViewProps) {
  const [rows, setRows] = useState<ColumnNullCountRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getAllServiceDataNullCounts()
      .then((result) => {
        if (!active) return
        setRows(result.rows)
        setTotalRows(result.totalRows)
      })
      .catch((err: Error) => {
        if (!active) return
        setRows([])
        setTotalRows(0)
        setError(err.message)
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  const summary = useMemo(() => {
    const totalNullCells = rows.reduce((sum, row) => sum + row.nullCount, 0)
    const totalCells = totalRows * rows.length
    const completeness = totalCells > 0 ? ((totalCells - totalNullCells) / totalCells) * 100 : 0

    return {
      columnCount: rows.length,
      totalNullCells,
      completeness,
    }
  }, [rows, totalRows])

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Master Data Report</h2>
        <p className="mt-1 text-sm text-gray-500">
          Column-wise null analysis from all_service_data for data-quality monitoring.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Rows</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{totalRows.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Columns</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">{summary.columnCount.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Total Null Cells</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{summary.totalNullCells.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Completeness</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{summary.completeness.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Upload section */}
      <MasterDataUploadSection onUploadComplete={() => setReloadKey((k) => k + 1)} />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading master data null counts...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No columns found in all_service_data.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">S.No.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Column Name</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Null Count</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Non-Null Count</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Null Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row, index) => (
                  <tr key={row.columnName} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.columnName}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{row.nullCount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.nonNullCount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.nullPercentage.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
