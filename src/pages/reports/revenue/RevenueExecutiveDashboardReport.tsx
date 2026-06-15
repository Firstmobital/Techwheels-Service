import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getCategoryWiseRevenue,
  getDailyRevenueReport,
  getLabourSparesMixByServiceType,
  getModelWiseRevenue,
  getMonthlyRevenuesTrend,
  getProductLinePerformance,
  getVehicleWiseRevenue,
  type CategoryWiseRevenue,
  type DailyRevenueReport,
  type LabourSparesMixRow,
  type ModelWiseRevenueRow,
  type MonthlyTrendRevenue,
  type ProductLinePerformanceRow,
  type VehicleWiseRevenueRow,
} from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

const PIE_COLORS = ['#2563eb', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9']
const LABOUR_BAR_COLORS = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1']
const SPARES_BAR_COLORS = ['#7c2d12', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#f59e0b', '#fbbf24', '#fcd34d']
const VAS_BAR_COLORS = ['#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c084fc', '#d946ef', '#a21caf', '#86198f']

function formatCurrency(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function pickColorByIndex(index: number, palette: string[]): string {
  if (palette.length === 0) return '#2563eb'
  return palette[index % palette.length]
}

function formatMonth(month: string): string {
  if (!month || month === 'Unknown') return month || 'Unknown'
  const [year, monthPart] = month.split('-')
  const y = Number(year)
  const m = Number(monthPart)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return month
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

function formatDayLabel(dateValue: string): string {
  if (!dateValue || dateValue === 'Unknown') return dateValue || 'Unknown'
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export default function RevenueExecutiveDashboardReport({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
  parentProductLineFilter = 'ALL',
}: ReportViewProps) {
  const [dailyRows, setDailyRows] = useState<DailyRevenueReport[]>([])
  const [categoryRows, setCategoryRows] = useState<CategoryWiseRevenue[]>([])
  const [monthlyRows, setMonthlyRows] = useState<MonthlyTrendRevenue[]>([])
  const [mixRows, setMixRows] = useState<LabourSparesMixRow[]>([])
  const [productLineRows, setProductLineRows] = useState<ProductLinePerformanceRow[]>([])
  const [modelRows, setModelRows] = useState<ModelWiseRevenueRow[]>([])
  const [vehicleRows, setVehicleRows] = useState<VehicleWiseRevenueRow[]>([])
  const [activeServiceTypeName, setActiveServiceTypeName] = useState('')
  const [activeMixMetric, setActiveMixMetric] = useState<'ALL' | 'labourRevenue' | 'sparesRevenue' | 'vasRevenue'>('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    const filters = {
      serviceTypeFilter,
      manpowerFilter: parentProductLineFilter,
    }

    Promise.all([
      getDailyRevenueReport(branch, dateFilter, filters),
      getCategoryWiseRevenue(branch, dateFilter, filters),
      getMonthlyRevenuesTrend(branch, dateFilter, filters),
      getLabourSparesMixByServiceType(branch, dateFilter, filters),
      getProductLinePerformance(branch, dateFilter, filters),
      getModelWiseRevenue(branch, dateFilter, filters),
      getVehicleWiseRevenue(branch, dateFilter, filters),
    ])
      .then(([daily, category, monthly, mix, product, model, vehicle]) => {
        if (!active) return
        setDailyRows(daily)
        setCategoryRows(category)
        setMonthlyRows(monthly)
        setMixRows(mix)
        setProductLineRows(product)
        setModelRows(model)
        setVehicleRows(vehicle)
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
  }, [branch, dateFilter, parentProductLineFilter, serviceTypeFilter])

  const totals = useMemo(() => {
    const totalRevenue = dailyRows.reduce((sum, row) => sum + row.totalRevenue, 0)
    const labourRevenue = dailyRows.reduce((sum, row) => sum + row.labourRevenue, 0)
    const partsRevenue = dailyRows.reduce((sum, row) => sum + row.partsRevenue, 0)
    const vasRevenue = dailyRows.reduce((sum, row) => sum + row.vasRevenue, 0)
    const vehicles = dailyRows.reduce((sum, row) => sum + row.vehicleCount, 0)
    const invoices = dailyRows.reduce((sum, row) => sum + row.invoiceCount, 0)
    const avgInvoiceValue = invoices > 0 ? totalRevenue / invoices : 0
    const daysReported = dailyRows.length

    const sortedCategories = [...categoryRows].sort((a, b) => b.totalRevenue - a.totalRevenue)
    const topCategory = sortedCategories[0] ?? null

    const sortedModels = [...modelRows].sort((a, b) => b.totalRevenue - a.totalRevenue)
    const topModel = sortedModels[0] ?? null

    const repeatVehicles = vehicleRows.filter((row) => row.repeatVisitCount > 0).length
    const uniqueVehicles = vehicleRows.length
    const repeatVehicleRate = uniqueVehicles > 0 ? (repeatVehicles / uniqueVehicles) * 100 : 0

    return {
      totalRevenue,
      labourRevenue,
      partsRevenue,
      vasRevenue,
      vehicles,
      invoices,
      avgInvoiceValue,
      daysReported,
      topCategory,
      topModel,
      repeatVehicles,
      uniqueVehicles,
      repeatVehicleRate,
    }
  }, [categoryRows, dailyRows, modelRows, vehicleRows])

  const monthlyTrendData = useMemo(
    () => [...monthlyRows].sort((a, b) => a.month.localeCompare(b.month)).map((row) => ({ ...row, monthLabel: formatMonth(row.month) })),
    [monthlyRows],
  )

  const dailyTrendData = useMemo(
    () =>
      [...dailyRows]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-31)
        .map((row) => ({
          ...row,
          dayLabel: formatDayLabel(row.date),
        })),
    [dailyRows],
  )

  const monthMomentum = useMemo(() => {
    if (monthlyTrendData.length < 2) {
      return { current: 0, previous: 0, delta: 0, deltaPct: 0 }
    }

    const latest = monthlyTrendData[monthlyTrendData.length - 1]
    const previous = monthlyTrendData[monthlyTrendData.length - 2]
    const delta = latest.totalRevenue - previous.totalRevenue
    const deltaPct = previous.totalRevenue > 0 ? (delta / previous.totalRevenue) * 100 : 0

    return {
      current: latest.totalRevenue,
      previous: previous.totalRevenue,
      delta,
      deltaPct,
    }
  }, [monthlyTrendData])

  const categoryPieData = useMemo(
    () => [...categoryRows].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 6),
    [categoryRows],
  )

  const serviceMixBarData = useMemo(
    () => [...mixRows].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 8),
    [mixRows],
  )

  useEffect(() => {
    if (serviceMixBarData.length === 0) {
      setActiveServiceTypeName('')
      return
    }

    setActiveServiceTypeName((prev) => {
      if (prev && serviceMixBarData.some((row) => row.serviceType === prev)) return prev
      return serviceMixBarData[0].serviceType
    })
  }, [serviceMixBarData])

  const topProductLines = useMemo(
    () => [...productLineRows].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5),
    [productLineRows],
  )

  const activeServiceTypeRow =
    serviceMixBarData.find((row) => row.serviceType === activeServiceTypeName) ?? serviceMixBarData[0] ?? null

  const activeServiceTypeShare =
    totals.totalRevenue > 0 && activeServiceTypeRow
      ? (activeServiceTypeRow.totalRevenue / totals.totalRevenue) * 100
      : 0

  const selectedMixMetricTotal = useMemo(() => {
    if (activeMixMetric === 'labourRevenue') {
      return serviceMixBarData.reduce((sum, row) => sum + row.labourRevenue, 0)
    }
    if (activeMixMetric === 'sparesRevenue') {
      return serviceMixBarData.reduce((sum, row) => sum + row.sparesRevenue, 0)
    }
    if (activeMixMetric === 'vasRevenue') {
      return serviceMixBarData.reduce((sum, row) => sum + row.vasRevenue, 0)
    }
    return serviceMixBarData.reduce((sum, row) => sum + row.totalRevenue, 0)
  }, [activeMixMetric, serviceMixBarData])

  const activeMetricValue = useMemo(() => {
    if (!activeServiceTypeRow) return 0
    if (activeMixMetric === 'labourRevenue') return activeServiceTypeRow.labourRevenue
    if (activeMixMetric === 'sparesRevenue') return activeServiceTypeRow.sparesRevenue
    if (activeMixMetric === 'vasRevenue') return activeServiceTypeRow.vasRevenue
    return activeServiceTypeRow.totalRevenue
  }, [activeMixMetric, activeServiceTypeRow])

  const activeMetricShare =
    selectedMixMetricTotal > 0 ? (activeMetricValue / selectedMixMetricTotal) * 100 : 0

  const momentumTone = monthMomentum.delta >= 0 ? 'text-emerald-700' : 'text-red-700'

  return (
    <div className="space-y-5 rounded-2xl bg-gradient-to-b from-sky-50 via-blue-50 to-violet-50 p-2">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-900 to-blue-900 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Revenue Dashboard</h2>
            <p className="mt-1 text-sm text-blue-100/90">
              Unified performance view across daily, category, trend, service mix, model and vehicle analytics.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">{totals.daysReported} Days</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">{categoryRows.length} Categories</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">{modelRows.length} Models</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-blue-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Total Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(totals.totalRevenue)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(totals.labourRevenue)}</p>
          </div>
          <div className="rounded-xl border border-amber-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Parts Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(totals.partsRevenue)}</p>
          </div>
          <div className="rounded-xl border border-violet-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">VAS Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(totals.vasRevenue)}</p>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading revenue dashboard...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load revenue dashboard: {error}
        </div>
      ) : dailyRows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No records found for the selected filters.
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Vehicles</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.vehicles.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Invoices</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.invoices.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Avg Invoice Value</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(totals.avgInvoiceValue)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">MoM Momentum</p>
              <p className={`mt-1 text-2xl font-semibold ${momentumTone}`}>
                {monthMomentum.deltaPct.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%
              </p>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Daily Revenue Trend (Last 1 Month)</h3>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">Daily Line + Bar</span>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyTrendData} margin={{ top: 6, right: 16, left: 6, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dayLabel" interval="preserveStartEnd" minTickGap={22} />
                    <YAxis tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null

                        const row = payload[0]?.payload as {
                          date: string
                          labourRevenue: number
                          partsRevenue: number
                          vasRevenue: number
                          totalRevenue: number
                          invoiceCount: number
                          vehicleCount: number
                        }

                        if (!row) return null

                        return (
                          <div className="rounded-xl border border-blue-100 bg-white p-3 shadow-lg">
                            <p className="text-sm font-semibold text-slate-900">{String(label)} ({row.date})</p>
                            <p className="mt-1 text-xs text-slate-600">Labour: {formatCurrency(row.labourRevenue)}</p>
                            <p className="text-xs text-slate-600">Parts: {formatCurrency(row.partsRevenue)}</p>
                            <p className="text-xs text-slate-600">VAS: {formatCurrency(row.vasRevenue)}</p>
                            <p className="text-xs text-slate-600">Total: {formatCurrency(row.totalRevenue)}</p>
                            <p className="text-xs text-slate-600">Invoices: {row.invoiceCount.toLocaleString('en-IN')}</p>
                            <p className="text-xs text-slate-600">Vehicles: {row.vehicleCount.toLocaleString('en-IN')}</p>
                          </div>
                        )
                      }}
                    />
                    <Legend />
                    <Bar dataKey="labourRevenue" name="Labour" fill="#2563eb" opacity={0.4} />
                    <Bar dataKey="partsRevenue" name="Parts" fill="#f59e0b" opacity={0.4} />
                    <Line dataKey="totalRevenue" name="Total" stroke="#0f172a" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Category Contribution</h3>
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">Pie View</span>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryPieData}
                      dataKey="totalRevenue"
                      nameKey="category"
                      innerRadius={56}
                      outerRadius={104}
                      paddingAngle={2}
                      label={({ name, percent }) => `${name} ${(typeof percent === 'number' ? percent * 100 : 0).toFixed(1)}%`}
                    >
                      {categoryPieData.map((entry, index) => (
                        <Cell key={entry.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const row = payload[0]?.payload as { category: string; totalRevenue: number }
                        if (!row) return null
                        const share = totals.totalRevenue > 0 ? (row.totalRevenue / totals.totalRevenue) * 100 : 0

                        return (
                          <div className="rounded-xl border border-violet-100 bg-white p-3 shadow-lg">
                            <p className="text-sm font-semibold text-slate-900">{row.category}</p>
                            <p className="mt-1 text-xs text-slate-600">Revenue: {formatCurrency(row.totalRevenue)}</p>
                            <p className="text-xs text-slate-600">Share: {share.toFixed(1)}%</p>
                            <p className="text-xs text-slate-600">Base: {formatCurrency(totals.totalRevenue)}</p>
                          </div>
                        )
                      }}
                    />
                    <Legend wrapperStyle={{ display: 'none' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 via-white to-cyan-50/60 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Service Type Revenue Matrix</h3>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">Interactive Stacked View</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="h-80 lg:col-span-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={serviceMixBarData}
                      layout="vertical"
                      margin={{ top: 8, right: 12, left: 10, bottom: 8 }}
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
                          const row = payload[0]?.payload as LabourSparesMixRow
                          if (!row) return null

                          return (
                            <div className="rounded-xl border border-blue-100 bg-white p-3 shadow-lg">
                              <p className="text-sm font-semibold text-slate-900">{row.serviceType}</p>
                              {(activeMixMetric === 'ALL' || activeMixMetric === 'labourRevenue') && (
                                <p className="mt-1 text-xs text-slate-600">Labour: {formatCurrency(row.labourRevenue)}</p>
                              )}
                              {(activeMixMetric === 'ALL' || activeMixMetric === 'sparesRevenue') && (
                                <p className="text-xs text-slate-600">Spares: {formatCurrency(row.sparesRevenue)}</p>
                              )}
                              {(activeMixMetric === 'ALL' || activeMixMetric === 'vasRevenue') && (
                                <p className="text-xs text-slate-600">VAS: {formatCurrency(row.vasRevenue)}</p>
                              )}
                              <p className="text-xs text-slate-600">Total: {formatCurrency(row.totalRevenue)}</p>
                              <p className="text-xs text-slate-600">JCs: {row.jobCardCount.toLocaleString('en-IN')}</p>
                            </div>
                          )
                        }}
                      />
                      <Legend
                        onClick={(entry: { dataKey?: string | number | ((obj: unknown) => unknown) }) => {
                          const key = entry?.dataKey
                          if (key !== 'labourRevenue' && key !== 'sparesRevenue' && key !== 'vasRevenue') return
                          setActiveMixMetric((prev) => (prev === key ? 'ALL' : key))
                        }}
                        formatter={(value: string, entry: { dataKey?: string | number | ((obj: unknown) => unknown) }) => {
                          const key = entry?.dataKey
                          const isActive = activeMixMetric === 'ALL' || activeMixMetric === key
                          return <span style={{ opacity: isActive ? 1 : 0.35, cursor: 'pointer' }}>{value}</span>
                        }}
                      />
                      <Bar
                        dataKey="labourRevenue"
                        name="Labour"
                        stackId="mix"
                        radius={[8, 0, 0, 8]}
                        fill="#2563eb"
                        hide={!(activeMixMetric === 'ALL' || activeMixMetric === 'labourRevenue')}
                      >
                        {serviceMixBarData.map((row, index) => (
                          <Cell key={`mix-labour-${row.serviceType}`} fill={pickColorByIndex(index, LABOUR_BAR_COLORS)} />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="sparesRevenue"
                        name="Spares"
                        stackId="mix"
                        fill="#f59e0b"
                        hide={!(activeMixMetric === 'ALL' || activeMixMetric === 'sparesRevenue')}
                      >
                        {serviceMixBarData.map((row, index) => (
                          <Cell key={`mix-spares-${row.serviceType}`} fill={pickColorByIndex(index, SPARES_BAR_COLORS)} />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="vasRevenue"
                        name="VAS"
                        stackId="mix"
                        radius={[0, 8, 8, 0]}
                        fill="#8b5cf6"
                        hide={!(activeMixMetric === 'ALL' || activeMixMetric === 'vasRevenue')}
                      >
                        {serviceMixBarData.map((row, index) => (
                          <Cell key={`mix-vas-${row.serviceType}`} fill={pickColorByIndex(index, VAS_BAR_COLORS)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 lg:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Hovered Service Type</p>
                  <p className="mt-1 truncate text-base font-semibold text-slate-900">{activeServiceTypeRow?.serviceType ?? 'N/A'}</p>
                  {activeMixMetric !== 'ALL' && (
                    <p className="mt-1 text-xs font-medium text-blue-700">
                      Focus: {activeMixMetric === 'labourRevenue' ? 'Labour' : activeMixMetric === 'sparesRevenue' ? 'Spares' : 'VAS'}
                    </p>
                  )}

                  <div className="mt-3 space-y-2 text-sm">
                    <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900">
                      Labour: <span className="font-semibold">{formatCurrency(activeServiceTypeRow?.labourRevenue ?? 0)}</span>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                      Spares: <span className="font-semibold">{formatCurrency(activeServiceTypeRow?.sparesRevenue ?? 0)}</span>
                    </div>
                    <div className="rounded-lg bg-violet-50 px-3 py-2 text-violet-900">
                      VAS: <span className="font-semibold">{formatCurrency(activeServiceTypeRow?.vasRevenue ?? 0)}</span>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
                      Combined: <span className="font-semibold">{formatCurrency(activeServiceTypeRow?.totalRevenue ?? 0)}</span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-slate-600">
                    <p>
                      {activeMixMetric === 'ALL' ? 'Contribution in dashboard' : 'Contribution in selected metric'}:{' '}
                      <span className="font-semibold">{(activeMixMetric === 'ALL' ? activeServiceTypeShare : activeMetricShare).toFixed(1)}%</span>
                    </p>
                    <p className="mt-1">Labour share in this type: <span className="font-semibold">{(activeServiceTypeRow?.labourSharePercentage ?? 0).toFixed(1)}%</span></p>
                    <p className="mt-1">Job Cards: <span className="font-semibold">{(activeServiceTypeRow?.jobCardCount ?? 0).toLocaleString('en-IN')}</span></p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/50 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Top Product Lines</h3>
              <div className="space-y-3">
                {topProductLines.map((row) => (
                  <div key={`${row.parentProductLine}-${row.productLine}`} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-medium text-gray-800">{row.parentProductLine} / {row.productLine}</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(row.totalRevenue)}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {row.jobCardCount.toLocaleString('en-IN')} JCs • Avg {formatCurrency(row.avgRevenuePerJobCard)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/60 p-5 shadow-sm lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Smart Highlights</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Top category <span className="font-semibold">{totals.topCategory?.category ?? 'N/A'}</span> contributes{' '}
                  <span className="font-semibold">{totals.topCategory?.contributionPercentage.toFixed(1) ?? '0.0'}%</span>.
                </div>
                <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                  Top model <span className="font-semibold">{totals.topModel?.model ?? 'N/A'}</span> billed{' '}
                  <span className="font-semibold">{formatCurrency(totals.topModel?.totalRevenue ?? 0)}</span>.
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Repeat-vehicle rate: <span className="font-semibold">{totals.repeatVehicleRate.toFixed(1)}%</span>.
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  MoM delta: <span className="font-semibold">{formatCurrency(monthMomentum.delta)}</span>.
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 via-white to-pink-50/60 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Quick Snapshot</h3>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">Unique Vehicles</p>
                  <p className="mt-1 font-semibold text-slate-900">{totals.uniqueVehicles.toLocaleString('en-IN')}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">Repeat Vehicles</p>
                  <p className="mt-1 font-semibold text-slate-900">{totals.repeatVehicles.toLocaleString('en-IN')}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">Current vs Previous</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatCurrency(monthMomentum.current)} vs {formatCurrency(monthMomentum.previous)}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
