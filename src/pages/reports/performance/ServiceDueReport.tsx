import { useEffect, useMemo, useState } from 'react'
import { getServiceDueList, type ServiceDueRow, type ServiceDueUrgency } from '../../../lib/reportQueries'
import { ReportErrorState } from '../components/ReportErrorState'
import { ReportLoadingState } from '../components/ReportLoadingState'
import type { ReportViewProps } from '../types'

type DueTab = 'all' | 'overdue' | 'due_soon' | 'upcoming'

const TAB_LABELS: Record<DueTab, string> = {
  all: 'All',
  overdue: 'Overdue',
  due_soon: 'Due Soon',
  upcoming: 'Upcoming',
}

export default function ServiceDueReport({ branch }: ReportViewProps) {
  const [rows, setRows] = useState<ServiceDueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<DueTab>('all')

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(null)

    getServiceDueList(branch)
      .then((data) => {
        if (!cancelled) {
          setRows(data)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [branch])

  const stats = useMemo(() => {
    const counts = {
      overdue: 0,
      dueSoon: 0,
      upcoming: 0,
      ok: 0,
    }

    for (const row of rows) {
      if (row.urgency === 'overdue') counts.overdue += 1
      else if (row.urgency === 'due_soon') counts.dueSoon += 1
      else if (row.urgency === 'upcoming') counts.upcoming += 1
      else counts.ok += 1
    }

    return counts
  }, [rows])

  const filteredRows = useMemo(() => {
    if (activeTab === 'all') return rows
    return rows.filter((row) => row.urgency === activeTab)
  }, [activeTab, rows])

  const urgencyLabel = (urgency: ServiceDueUrgency): string => {
    if (urgency === 'overdue') return 'Overdue'
    if (urgency === 'due_soon') return 'Due Soon'
    if (urgency === 'upcoming') return 'Upcoming'
    return 'OK'
  }

  const urgencyBadgeClass = (urgency: ServiceDueUrgency): string => {
    if (urgency === 'overdue') return 'bg-red-100 text-red-800'
    if (urgency === 'due_soon') return 'bg-orange-100 text-orange-800'
    if (urgency === 'upcoming') return 'bg-amber-100 text-amber-800'
    return 'bg-green-100 text-green-800'
  }

  const downloadCsv = () => {
    const header = ['VRN', 'Model', 'Last Service', 'KM Since Last', 'KM to Next', 'Urgency', 'Phone']
    const csvRows = filteredRows.map((row) => [
      row.vrn,
      row.model,
      row.lastServiceDate ?? '',
      String(Math.round(row.kmSinceLastService)),
      String(Math.round(row.kmToNextService)),
      urgencyLabel(row.urgency),
      row.phone,
    ])

    const escapeCell = (value: string) => {
      const escaped = value.replace(/"/g, '""')
      return `"${escaped}"`
    }

    const content = [header, ...csvRows]
      .map((line) => line.map((cell) => escapeCell(cell)).join(','))
      .join('\n')

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `service-due-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Service Due Report</h2>
        <p className="mt-1 text-sm text-gray-500">Current service-due status based on latest recorded odometer per vehicle.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-red-600">Overdue</p>
            <p className="mt-1 text-2xl font-semibold text-red-900">{stats.overdue.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Due Soon</p>
            <p className="mt-1 text-2xl font-semibold text-orange-900">{stats.dueSoon.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Upcoming</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{stats.upcoming.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-green-600">OK</p>
            <p className="mt-1 text-2xl font-semibold text-green-900">{stats.ok.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <ReportLoadingState />
      ) : error ? (
        <ReportErrorState message={error} />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TAB_LABELS) as DueTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={downloadCsv}
              disabled={filteredRows.length === 0}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download List
            </button>
          </div>

          <div className="overflow-x-auto px-5 py-4">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-semibold">VRN</th>
                  <th className="px-3 py-2 font-semibold">Model</th>
                  <th className="px-3 py-2 font-semibold">Last Service</th>
                  <th className="px-3 py-2 font-semibold">KM Since Last</th>
                  <th className="px-3 py-2 font-semibold">KM to Next</th>
                  <th className="px-3 py-2 font-semibold">Urgency</th>
                  <th className="px-3 py-2 font-semibold">Phone</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-400" colSpan={7}>
                      No vehicles match the selected urgency filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={`${row.vrn}-${row.chassisNumber}`} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-900 font-medium">{row.vrn}</td>
                      <td className="px-3 py-2 text-gray-700">{row.model}</td>
                      <td className="px-3 py-2 text-gray-700">{row.lastServiceDate ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{Math.round(row.kmSinceLastService).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-gray-700">{Math.round(row.kmToNextService).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-1 text-[11px] font-semibold ${urgencyBadgeClass(row.urgency)}`}>
                          {urgencyLabel(row.urgency)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{row.phone || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
