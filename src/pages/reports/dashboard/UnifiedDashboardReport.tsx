import { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import {
  Area,
  AreaChart,
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
  getCategoryWiseRevenue,
  getDailyRevenueReport,
  getLabourKpiSummary,
  getServiceTypeLabourRevenue,
  type CategoryWiseRevenue,
  type DailyRevenueReport,
  type LabourKpiSummary,
  type ServiceTypeLabourRevenue,
} from '../../../lib/reportQueries'
import {
  getFastMovingParts,
  getOrderStatusReport,
  getPartWiseConsumption,
  type FastMovingPart,
  type OrderStatusData,
  type PartWiseConsumption,
} from '../../../lib/partsReportQueries'
import type { ReportViewProps } from '../types'

const PIE_COLORS = ['#2563eb', '#7c3aed', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9']

function formatCurrency(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function formatCurrencyFromUnknown(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatCurrency(value)
  }

  const parsed = Number(value ?? 0)
  return formatCurrency(Number.isFinite(parsed) ? parsed : 0)
}

function formatDayLabel(dateValue: string): string {
  if (!dateValue || dateValue === 'Unknown') return dateValue || 'Unknown'
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function toPortal(fuelType?: 'ALL' | 'PV' | 'EV'): 'ALL' | 'PV' | 'EV' {
  if (fuelType === 'PV' || fuelType === 'EV') return fuelType
  return 'ALL'
}

export default function UnifiedDashboardReport({
  branch,
  dateFilter,
  fuelType = 'ALL',
  serviceTypeFilter = 'ALL',
  parentProductLineFilter = 'ALL',
}: ReportViewProps) {
  const dashboardRef = useRef<HTMLDivElement | null>(null)
  const [labourSummary, setLabourSummary] = useState<LabourKpiSummary>({
    monthlyJobCards: 0,
    monthlyRevenue: 0,
    totalVasRevenue: 0,
    totalVasCount: 0,
  })
  const [serviceTypeRows, setServiceTypeRows] = useState<ServiceTypeLabourRevenue[]>([])
  const [dailyRows, setDailyRows] = useState<DailyRevenueReport[]>([])
  const [categoryRows, setCategoryRows] = useState<CategoryWiseRevenue[]>([])
  const [partsConsumptionRows, setPartsConsumptionRows] = useState<PartWiseConsumption[]>([])
  const [fastMovingRows, setFastMovingRows] = useState<FastMovingPart[]>([])
  const [orderStatusRows, setOrderStatusRows] = useState<OrderStatusData[]>([])
  const [isExportingImage, setIsExportingImage] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    const revenueFilters = {
      serviceTypeFilter,
      manpowerFilter: parentProductLineFilter,
    }

    const partsFilters = {
      branch,
      portal: toPortal(fuelType),
    }

    Promise.all([
      getLabourKpiSummary(branch, dateFilter, serviceTypeFilter),
      getServiceTypeLabourRevenue(branch, dateFilter, serviceTypeFilter),
      getDailyRevenueReport(branch, dateFilter, revenueFilters),
      getCategoryWiseRevenue(branch, dateFilter, revenueFilters),
      getPartWiseConsumption(partsFilters),
      getFastMovingParts(partsFilters),
      getOrderStatusReport(partsFilters),
    ])
      .then(([labour, serviceRows, daily, category, partConsumption, fastMoving, orders]) => {
        if (!active) return
        setLabourSummary(labour)
        setServiceTypeRows(serviceRows)
        setDailyRows(daily)
        setCategoryRows(category)
        setPartsConsumptionRows(partConsumption)
        setFastMovingRows(fastMoving)
        setOrderStatusRows(orders)
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
  }, [branch, dateFilter, fuelType, parentProductLineFilter, serviceTypeFilter])

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

  const categoryPieData = useMemo(
    () => [...categoryRows].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 6),
    [categoryRows],
  )

  const topServiceTypeData = useMemo(
    () => [...serviceTypeRows].sort((a, b) => b.totalLabourRevenue - a.totalLabourRevenue).slice(0, 8),
    [serviceTypeRows],
  )

  const topPartsConsumption = useMemo(
    () => [...partsConsumptionRows].sort((a, b) => b.totalConsumption - a.totalConsumption).slice(0, 8),
    [partsConsumptionRows],
  )

  const metrics = useMemo(() => {
    const totalRevenue = dailyRows.reduce((sum, row) => sum + row.totalRevenue, 0)
    const labourRevenue = dailyRows.reduce((sum, row) => sum + row.labourRevenue, 0)
    const partsRevenue = dailyRows.reduce((sum, row) => sum + row.partsRevenue, 0)
    const vasRevenue = dailyRows.reduce((sum, row) => sum + row.vasRevenue, 0)
    const vehicles = dailyRows.reduce((sum, row) => sum + row.vehicleCount, 0)
    const invoices = dailyRows.reduce((sum, row) => sum + row.invoiceCount, 0)
    const avgInvoice = invoices > 0 ? totalRevenue / invoices : 0

    const pendingOrders = orderStatusRows.filter((row) => {
      const orderQty = Number(row.orderQty ?? 0)
      const receivedQty = Number(row.receivedQty ?? 0)
      return receivedQty < orderQty
    }).length

    const criticalFastMoving = fastMovingRows.filter((row) => row.stockoutRisk === 'critical' || row.stockoutRisk === 'high').length

    const topCategory = categoryPieData[0]?.category ?? 'N/A'
    const topServiceType = topServiceTypeData[0]?.serviceType ?? 'N/A'

    return {
      totalRevenue,
      labourRevenue,
      partsRevenue,
      vasRevenue,
      vehicles,
      invoices,
      avgInvoice,
      pendingOrders,
      criticalFastMoving,
      topCategory,
      topServiceType,
    }
  }, [categoryPieData, dailyRows, fastMovingRows, orderStatusRows, topServiceTypeData])

  const handleDownloadReportImage = async () => {
    if (!dashboardRef.current || isExportingImage) return

    setIsExportingImage(true)
    try {
      const canvas = await html2canvas(dashboardRef.current, {
        backgroundColor: '#f8fafc',
        scale: 2,
        useCORS: true,
        logging: false,
      })

      const imageData = canvas.toDataURL('image/png')
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')

      const link = document.createElement('a')
      link.href = imageData
      link.download = `dashboard-report-${timestamp}.png`
      link.click()
    } finally {
      setIsExportingImage(false)
    }
  }

  return (
    <div ref={dashboardRef} className="space-y-5 rounded-2xl bg-gradient-to-b from-sky-50 via-blue-50 to-violet-50 p-2">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
            <p className="mt-1 text-sm text-blue-100/90">
              Unified dynamic view combining Labour Revenue, Revenue and Parts reports.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleDownloadReportImage}
              disabled={isExportingImage}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              title="Download dashboard as image"
            >
              {isExportingImage ? 'Preparing image...' : 'Download Report (Image)'}
            </button>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Dynamic</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">{dailyTrendData.length} Daily Points</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">{topPartsConsumption.length} Parts Signals</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-blue-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Total Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(metrics.totalRevenue)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(metrics.labourRevenue)}</p>
          </div>
          <div className="rounded-xl border border-amber-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">Parts Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(metrics.partsRevenue)}</p>
          </div>
          <div className="rounded-xl border border-violet-200/30 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-blue-100">VAS Revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(metrics.vasRevenue)}</p>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading dashboard...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load dashboard: {error}
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Job Cards</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{labourSummary.monthlyJobCards.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Vehicles</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{metrics.vehicles.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Avg Invoice</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(metrics.avgInvoice)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Pending Parts Orders</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{metrics.pendingOrders.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Fast-Moving Risk</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{metrics.criticalFastMoving.toLocaleString('en-IN')}</p>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Daily Trend (1 Month)</h3>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">Dynamic</span>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrendData} margin={{ top: 8, right: 16, left: 8, bottom: 10 }}>
                    <defs>
                      <linearGradient id="dailyRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dayLabel" interval="preserveStartEnd" minTickGap={20} />
                    <YAxis tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const row = payload[0]?.payload as DailyRevenueReport
                        if (!row) return null

                        return (
                          <div className="rounded-xl border border-blue-100 bg-white p-3 shadow-lg">
                            <p className="text-sm font-semibold text-slate-900">{String(label)} ({row.date})</p>
                            <p className="mt-1 text-xs text-slate-600">Total: {formatCurrency(row.totalRevenue)}</p>
                            <p className="text-xs text-slate-600">Labour: {formatCurrency(row.labourRevenue)}</p>
                            <p className="text-xs text-slate-600">Parts: {formatCurrency(row.partsRevenue)}</p>
                            <p className="text-xs text-slate-600">VAS: {formatCurrency(row.vasRevenue)}</p>
                            <p className="text-xs text-slate-600">Invoices: {row.invoiceCount.toLocaleString('en-IN')}</p>
                          </div>
                        )
                      }}
                    />
                    <Area type="monotone" dataKey="totalRevenue" stroke="#2563eb" fill="url(#dailyRevenueGrad)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Revenue Category Mix</h3>
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">Pie</span>
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
                        const row = payload[0]?.payload as CategoryWiseRevenue
                        if (!row) return null
                        const share = metrics.totalRevenue > 0 ? (row.totalRevenue / metrics.totalRevenue) * 100 : 0
                        return (
                          <div className="rounded-xl border border-violet-100 bg-white p-3 shadow-lg">
                            <p className="text-sm font-semibold text-slate-900">{row.category}</p>
                            <p className="mt-1 text-xs text-slate-600">Revenue: {formatCurrency(row.totalRevenue)}</p>
                            <p className="text-xs text-slate-600">Share: {share.toFixed(1)}%</p>
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
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Top Service Types (Labour)</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topServiceTypeData} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`} />
                    <YAxis dataKey="serviceType" type="category" width={130} />
                    <Tooltip
                      formatter={(value) => formatCurrencyFromUnknown(value)}
                      contentStyle={{ borderRadius: 10, borderColor: '#dbeafe' }}
                    />
                    <Legend />
                    <Bar dataKey="totalLabourRevenue" name="Labour Revenue" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/60 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Top Parts Consumption</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topPartsConsumption} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="partNumber" type="category" width={120} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const row = payload[0]?.payload as PartWiseConsumption
                        if (!row) return null
                        return (
                          <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-lg">
                            <p className="text-sm font-semibold text-slate-900">{row.partNumber}</p>
                            <p className="mt-1 text-xs text-slate-600">Consumption: {row.totalConsumption.toLocaleString('en-IN')}</p>
                            <p className="text-xs text-slate-600">Avg Monthly: {row.avgMonthlyConsumption.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</p>
                            <p className="text-xs text-slate-600">Vendor: {row.vendor ?? 'N/A'}</p>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="totalConsumption" name="Consumption" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/60 p-5 shadow-sm lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Smart Highlights</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Top revenue category: <span className="font-semibold">{metrics.topCategory}</span>.
                </div>
                <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                  Top labour service type: <span className="font-semibold">{metrics.topServiceType}</span>.
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Pending parts orders: <span className="font-semibold">{metrics.pendingOrders.toLocaleString('en-IN')}</span>.
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Critical/high stockout risk parts: <span className="font-semibold">{metrics.criticalFastMoving.toLocaleString('en-IN')}</span>.
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 via-white to-pink-50/60 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Quick Snapshot</h3>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">Invoices</p>
                  <p className="mt-1 font-semibold text-slate-900">{metrics.invoices.toLocaleString('en-IN')}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">VAS Count</p>
                  <p className="mt-1 font-semibold text-slate-900">{labourSummary.totalVasCount.toLocaleString('en-IN')}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">Fast Moving Parts</p>
                  <p className="mt-1 font-semibold text-slate-900">{fastMovingRows.length.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
