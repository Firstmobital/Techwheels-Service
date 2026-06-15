import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getBranchLabourRevenueComparison,
  getFilteredJcChassisRows,
  getLabourKpiSummary,
  getManpowerWiseLabourRevenue,
  getServiceTypeLabourRevenue,
  getVasRevenueReport,
  type BranchLabourRevenueComparison,
  type FilteredJcChassisRow,
  type LabourKpiSummary,
  type ManpowerLabourRevenue,
  type ServiceTypeLabourRevenue,
  type VasRevenueReportData,
} from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

const PIE_COLORS = ['#2563eb', '#7c3aed', '#f59e0b']
const LABOUR_BAR_COLORS = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1']
const SPARES_BAR_COLORS = ['#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c084fc', '#d946ef', '#a21caf', '#86198f']
const GST_DIVISOR = 1.18

function formatCurrency(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function pickColorByIndex(index: number, palette: string[]): string {
  if (palette.length === 0) return '#2563eb'
  return palette[index % palette.length]
}

export default function LabourRevenueExecutiveSummaryReport({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
}: ReportViewProps) {
  const [serviceTypeRows, setServiceTypeRows] = useState<ServiceTypeLabourRevenue[]>([])
  const [branchRows, setBranchRows] = useState<BranchLabourRevenueComparison[]>([])
  const [manpowerRows, setManpowerRows] = useState<ManpowerLabourRevenue[]>([])
  const [vasData, setVasData] = useState<VasRevenueReportData>({
    totalVasRevenue: 0,
    totalJobs: 0,
    avgVasRevenue: 0,
    rows: [],
  })
  const [headerKpis, setHeaderKpis] = useState<LabourKpiSummary>({
    monthlyJobCards: 0,
    monthlyRevenue: 0,
    totalVasRevenue: 0,
    totalVasCount: 0,
  })
  const [jcRows, setJcRows] = useState<FilteredJcChassisRow[]>([])
  const [activeServiceTypeName, setActiveServiceTypeName] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    Promise.all([
      getServiceTypeLabourRevenue(branch, dateFilter, serviceTypeFilter),
      getBranchLabourRevenueComparison(branch, dateFilter, serviceTypeFilter),
      getManpowerWiseLabourRevenue(branch, dateFilter, {
        serviceType: serviceTypeFilter,
        parentProductLine: 'ALL',
      }),
      getVasRevenueReport(branch, dateFilter, serviceTypeFilter),
      getLabourKpiSummary(branch, dateFilter, serviceTypeFilter),
      getFilteredJcChassisRows(branch, dateFilter, {
        serviceType: serviceTypeFilter,
        parentProductLine: 'ALL',
      }),
    ])
      .then(([serviceData, branchData, manpowerData, vasReport, summary, jcData]) => {
        if (!active) return
        setServiceTypeRows(serviceData)
        setBranchRows(branchData)
        setManpowerRows(manpowerData)
        setVasData(vasReport)
        setHeaderKpis(summary)
        setJcRows(jcData)
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message)
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [branch, dateFilter, serviceTypeFilter])

  const totals = useMemo(() => {
    const labourRevenue = serviceTypeRows.reduce((sum, row) => sum + row.totalLabourRevenue, 0)
    const sparesRevenue = serviceTypeRows.reduce((sum, row) => sum + row.totalSparesRevenue, 0)
    const jobCards = serviceTypeRows.reduce((sum, row) => sum + row.jobCardCount, 0)

    const selectedRevenue = branchRows.reduce((sum, row) => sum + row.selectedRevenue, 0)
    const previousRevenue = branchRows.reduce((sum, row) => sum + row.previousRevenue, 0)
    const absoluteChange = selectedRevenue - previousRevenue
    const percentageChange = previousRevenue === 0 ? 0 : (absoluteChange / previousRevenue) * 100

    const uniqueChassis = new Set(jcRows.map((row) => row.chassisNumber)).size
    const averageTicketSize = jobCards > 0 ? (labourRevenue + sparesRevenue) / jobCards : 0

    return {
      labourRevenue,
      sparesRevenue,
      vasRevenue: vasData.totalVasRevenue,
      grandRevenue: labourRevenue + sparesRevenue + vasData.totalVasRevenue,
      jobCards,
      uniqueChassis,
      selectedRevenue,
      previousRevenue,
      absoluteChange,
      percentageChange,
      averageTicketSize,
      manpowerCount: manpowerRows.length,
      branchCount: branchRows.length,
    }
  }, [branchRows, jcRows, manpowerRows.length, serviceTypeRows, vasData.totalVasRevenue])

  const displayTotals = useMemo(() => {
    const labourRevenue = totals.labourRevenue / GST_DIVISOR
    const sparesRevenue = totals.sparesRevenue / GST_DIVISOR
    const vasRevenue = totals.vasRevenue / GST_DIVISOR
    const grandRevenue = labourRevenue + sparesRevenue + vasRevenue
    const averageTicketSize = totals.jobCards > 0 ? (labourRevenue + sparesRevenue) / totals.jobCards : 0

    return {
      labourRevenue,
      sparesRevenue,
      vasRevenue,
      grandRevenue,
      averageTicketSize,
    }
  }, [totals.jobCards, totals.labourRevenue, totals.sparesRevenue, totals.vasRevenue])

  const serviceTypeBarData = useMemo(
    () =>
      [...serviceTypeRows]
        .sort((a, b) => b.totalLabourRevenue - a.totalLabourRevenue)
        .slice(0, 8)
        .map((row) => ({
          ...row,
          totalLabourRevenue: row.totalLabourRevenue / GST_DIVISOR,
          totalSparesRevenue: row.totalSparesRevenue / GST_DIVISOR,
          totalRevenue: (row.totalLabourRevenue + row.totalSparesRevenue) / GST_DIVISOR,
          labourShareInType:
            row.totalLabourRevenue + row.totalSparesRevenue > 0
              ? (row.totalLabourRevenue / (row.totalLabourRevenue + row.totalSparesRevenue)) * 100
              : 0,
        })),
    [serviceTypeRows],
  )

  useEffect(() => {
    if (serviceTypeBarData.length === 0) {
      setActiveServiceTypeName('')
      return
    }

    setActiveServiceTypeName((prev) => {
      if (prev && serviceTypeBarData.some((row) => row.serviceType === prev)) return prev
      return serviceTypeBarData[0].serviceType
    })
  }, [serviceTypeBarData])

  const revenueMixData = useMemo(
    () => [
      { name: 'Labour', value: displayTotals.labourRevenue },
      { name: 'Spares', value: displayTotals.sparesRevenue },
      { name: 'VAS', value: displayTotals.vasRevenue },
    ],
    [displayTotals.labourRevenue, displayTotals.sparesRevenue, displayTotals.vasRevenue],
  )

  const topManpowerRows = useMemo(
    () => [...manpowerRows].sort((a, b) => b.totalLabourRevenue - a.totalLabourRevenue).slice(0, 5),
    [manpowerRows],
  )

  const topBranchGrowth = useMemo(
    () => [...branchRows].sort((a, b) => b.absoluteChange - a.absoluteChange).slice(0, 3),
    [branchRows],
  )

  const topServiceType = serviceTypeBarData[0]
  const topManpower = topManpowerRows[0]

  const topServiceTypeShare =
    displayTotals.labourRevenue > 0 && topServiceType
      ? (topServiceType.totalLabourRevenue / displayTotals.labourRevenue) * 100
      : 0

  const topManpowerShare =
    totals.labourRevenue > 0 && topManpower
      ? (topManpower.totalLabourRevenue / totals.labourRevenue) * 100
      : 0

  const vasShare = totals.grandRevenue > 0 ? (totals.vasRevenue / totals.grandRevenue) * 100 : 0
  const momentumTone = totals.absoluteChange >= 0 ? 'text-emerald-700' : 'text-red-700'
  const momentumLabel = totals.absoluteChange >= 0 ? 'Growth' : 'Decline'
  const topServiceTypeRevenue = topServiceType?.totalLabourRevenue ?? 0
  const topBranchDeltaMax = topBranchGrowth.reduce((max, row) => {
    const value = Math.abs(row.absoluteChange)
    return value > max ? value : max
  }, 0)
  const topManpowerRevenueMax = topManpowerRows.reduce((max, row) => {
    const value = row.totalLabourRevenue
    return value > max ? value : max
  }, 0)

  const activeServiceTypeRow =
    serviceTypeBarData.find((row) => row.serviceType === activeServiceTypeName) ?? serviceTypeBarData[0] ?? null

  const serviceTypeGlobalShare =
    displayTotals.grandRevenue > 0 && activeServiceTypeRow
      ? (activeServiceTypeRow.totalRevenue / displayTotals.grandRevenue) * 100
      : 0

  return (
    <div className="space-y-5 rounded-2xl bg-gradient-to-b from-sky-50 via-blue-50 to-violet-50 p-2">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Labour Dashboard</h2>
            <p className="mt-1 text-sm text-blue-100/90">
              Executive overview for labour, spares, VAS, branch momentum and manpower performance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">GST Excluded View</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">{totals.branchCount} Branches</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">{totals.manpowerCount} Manpower</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-blue-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Total Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(displayTotals.labourRevenue)}</p>
          </div>
          <div className="rounded-xl border border-violet-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Total Spares Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(displayTotals.sparesRevenue)}</p>
          </div>
          <div className="rounded-xl border border-amber-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Total VAS Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(displayTotals.vasRevenue)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Grand Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(displayTotals.grandRevenue)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Job Cards</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.jobCards.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Unique Chassis</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.uniqueChassis.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Avg Ticket Size</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(displayTotals.averageTicketSize)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">MoM Change</p>
          <p className={`mt-1 text-2xl font-semibold ${momentumTone}`}>
            {totals.percentageChange.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%
          </p>
          <p className="mt-1 text-xs text-slate-500">{momentumLabel} vs previous period</p>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading consolidated dashboard...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load consolidated dashboard: {error}
        </div>
      ) : serviceTypeRows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No records found for the selected filters.
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Service Type Performance Matrix</h3>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">Interactive Stacked View</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="h-80 lg:col-span-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={serviceTypeBarData}
                      layout="vertical"
                      margin={{ top: 6, right: 12, left: 8, bottom: 6 }}
                      onMouseMove={(state: { activeLabel?: string | number }) => {
                        const label = state?.activeLabel
                        if (typeof label === 'string' && label) {
                          setActiveServiceTypeName(label)
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`} />
                      <YAxis dataKey="serviceType" type="category" width={0} hide />
                      <Tooltip
                        cursor={{ fill: '#eff6ff' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null

                          const row = payload[0]?.payload as {
                            serviceType: string
                            totalLabourRevenue: number
                            totalSparesRevenue: number
                            totalRevenue: number
                            jobCardCount: number
                          }

                          if (!row) return null

                          return (
                            <div className="rounded-xl border border-blue-100 bg-white p-3 shadow-lg">
                              <p className="text-sm font-semibold text-slate-900">{row.serviceType}</p>
                              <p className="mt-1 text-xs text-slate-600">Labour: {formatCurrency(row.totalLabourRevenue)}</p>
                              <p className="text-xs text-slate-600">Spares: {formatCurrency(row.totalSparesRevenue)}</p>
                              <p className="text-xs text-slate-600">Total: {formatCurrency(row.totalRevenue)}</p>
                              <p className="text-xs text-slate-600">Job Cards: {row.jobCardCount.toLocaleString('en-IN')}</p>
                            </div>
                          )
                        }}
                      />
                      <Legend />
                      <Bar dataKey="totalLabourRevenue" name="Labour" stackId="st" radius={[8, 0, 0, 8]}>
                        {serviceTypeBarData.map((row, index) => (
                          <Cell key={`labour-${row.serviceType}`} fill={pickColorByIndex(index, LABOUR_BAR_COLORS)} />
                        ))}
                      </Bar>
                      <Bar dataKey="totalSparesRevenue" name="Spares" stackId="st" radius={[0, 8, 8, 0]}>
                        {serviceTypeBarData.map((row, index) => (
                          <Cell key={`spares-${row.serviceType}`} fill={pickColorByIndex(index, SPARES_BAR_COLORS)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 lg:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Hovered Service Type</p>
                  <p className="mt-1 truncate text-base font-semibold text-slate-900">
                    {activeServiceTypeRow?.serviceType ?? 'N/A'}
                  </p>

                  <div className="mt-3 space-y-2 text-sm">
                    <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900">
                      Labour: <span className="font-semibold">{formatCurrency(activeServiceTypeRow?.totalLabourRevenue ?? 0)}</span>
                    </div>
                    <div className="rounded-lg bg-violet-50 px-3 py-2 text-violet-900">
                      Spares: <span className="font-semibold">{formatCurrency(activeServiceTypeRow?.totalSparesRevenue ?? 0)}</span>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
                      Combined: <span className="font-semibold">{formatCurrency(activeServiceTypeRow?.totalRevenue ?? 0)}</span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-slate-600">
                    <p>Contribution in dashboard: <span className="font-semibold">{serviceTypeGlobalShare.toFixed(1)}%</span></p>
                    <p className="mt-1">Labour share in this type: <span className="font-semibold">{(activeServiceTypeRow?.labourShareInType ?? 0).toFixed(1)}%</span></p>
                    <p className="mt-1">Job Cards: <span className="font-semibold">{(activeServiceTypeRow?.jobCardCount ?? 0).toLocaleString('en-IN')}</span></p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Revenue Mix</h3>
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">Pie View</span>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueMixData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={56}
                      outerRadius={100}
                      paddingAngle={2}
                      label={({ name, percent }) => `${name} ${(typeof percent === 'number' ? percent * 100 : 0).toFixed(1)}%`}
                    >
                      {revenueMixData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const row = payload[0]?.payload as { name: string; value: number }
                        if (!row) return null
                        const share = displayTotals.grandRevenue > 0 ? (row.value / displayTotals.grandRevenue) * 100 : 0

                        return (
                          <div className="rounded-xl border border-violet-100 bg-white p-3 shadow-lg">
                            <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                            <p className="mt-1 text-xs text-slate-600">Value: {formatCurrency(row.value)}</p>
                            <p className="text-xs text-slate-600">Share: {share.toFixed(1)}%</p>
                            <p className="text-xs text-slate-600">Total Base: {formatCurrency(displayTotals.grandRevenue)}</p>
                          </div>
                        )
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/60 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Top Branch Momentum</h3>
              <div className="space-y-3">
                {topBranchGrowth.map((row) => {
                  const deltaWidth = topBranchDeltaMax > 0 ? (Math.abs(row.absoluteChange) / topBranchDeltaMax) * 100 : 0
                  return (
                  <div
                    key={row.branch}
                    className={[
                      'rounded-lg border px-3 py-2',
                      row.absoluteChange >= 0
                        ? 'border-emerald-100 bg-gradient-to-r from-emerald-50 to-white'
                        : 'border-rose-100 bg-gradient-to-r from-rose-50 to-white',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-800">{row.branch}</span>
                      <span className={row.absoluteChange >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                        {row.absoluteChange >= 0 ? '+' : ''}{formatCurrency(row.absoluteChange / GST_DIVISOR)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                      <div
                        className={row.absoluteChange >= 0 ? 'h-full rounded-full bg-emerald-500' : 'h-full rounded-full bg-rose-500'}
                        style={{ width: `${Math.max(6, deltaWidth)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Selected: {formatCurrency(row.selectedRevenue / GST_DIVISOR)} • Previous: {formatCurrency(row.previousRevenue / GST_DIVISOR)}
                    </p>
                  </div>
                )})}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/50 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Top Manpower Contribution</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Manpower</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Revenue</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Job Cards</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topManpowerRows.map((row, index) => (
                      <tr key={`${row.employeeCode}-${row.manpowerLabel}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                              {index + 1}
                            </span>
                            {row.manpowerLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(row.totalLabourRevenue / GST_DIVISOR)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{row.jobCardCount.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 space-y-2">
                  {topManpowerRows.map((row) => {
                    const width = topManpowerRevenueMax > 0 ? (row.totalLabourRevenue / topManpowerRevenueMax) * 100 : 0
                    return (
                      <div key={`bar-${row.employeeCode}-${row.manpowerLabel}`}>
                        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate">{row.manpowerLabel}</span>
                          <span>{Math.round(width)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500"
                            style={{ width: `${Math.max(width, 3)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/60 p-5 shadow-sm lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Smart Insights</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Top service type <span className="font-semibold">{topServiceType?.serviceType ?? 'N/A'}</span> contributes{' '}
                  <span className="font-semibold">{topServiceTypeShare.toFixed(1)}%</span> of labour revenue.
                </div>
                <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                  Top manpower <span className="font-semibold">{topManpower?.manpowerLabel ?? 'N/A'}</span> contributes{' '}
                  <span className="font-semibold">{topManpowerShare.toFixed(1)}%</span> of labour revenue.
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  VAS share in total collections is <span className="font-semibold">{vasShare.toFixed(1)}%</span>.
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Active footprint: <span className="font-semibold">{totals.branchCount}</span> branches and{' '}
                  <span className="font-semibold">{totals.manpowerCount}</span> manpower in selected period.
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 via-white to-pink-50/60 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Quick Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">Top Service Type Value</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(topServiceTypeRevenue)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">VAS Share</p>
                  <p className="mt-1 font-semibold text-slate-900">{vasShare.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">Monthly Revenue (Cross-check)</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(headerKpis.monthlyRevenue / GST_DIVISOR)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-blue-50 p-4 text-xs text-gray-500 shadow-sm">
            Cross-check KPIs: {headerKpis.monthlyJobCards.toLocaleString('en-IN')} monthly job cards,{' '}
            {formatCurrency(headerKpis.monthlyRevenue / GST_DIVISOR)} monthly revenue and {headerKpis.totalVasCount.toLocaleString('en-IN')} VAS jobs.
          </div>
        </>
      )}
    </div>
  )
}
