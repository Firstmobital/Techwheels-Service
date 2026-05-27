import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { REPORT_BRANCH_OPTIONS } from '../../lib/branches'
import {
  getLabourKpiSummary,
  type BranchFilter,
  type DateFieldType,
  type DateRangeFilter,
  type DateRangePreset,
} from '../../lib/reportQueries'
import {
  REPORT_CATEGORIES,
  getReportById,
  getReportsByCategory,
  type ReportCategoryId,
  type ReportId,
} from '../../lib/reportsModel'
import ServiceTypeLabourRevenueMobile from '../../components/reports/ServiceTypeLabourRevenueMobile'
import CustomerRetentionMobile from '../../components/reports/CustomerRetentionMobile'
import DailyRevenueMobile from '../../components/reports/DailyRevenueMobile'
import PartsMonthlyConsumptionMobile from '../../components/reports/PartsMonthlyConsumptionMobile'
import BranchLabourRevenueMobile from '../../components/reports/BranchLabourRevenueMobile'
import ServiceDueMobile from '../../components/reports/ServiceDueMobile'
import CategoryWiseRevenueMobile from '../../components/reports/CategoryWiseRevenueMobile'
import PartsConsumptionTrendMobile from '../../components/reports/PartsConsumptionTrendMobile'
import ManpowerWiseLabourRevenueMobile from '../../components/reports/ManpowerWiseLabourRevenueMobile'
import AdvisorPerformanceMobile from '../../components/reports/AdvisorPerformanceMobile'
import MonthlyRevenueTrendMobile from '../../components/reports/MonthlyRevenueTrendMobile'
import PartsStockPlanningMobile from '../../components/reports/PartsStockPlanningMobile'
import DuplicateChassisSameMonthMobile from '../../components/reports/DuplicateChassisSameMonthMobile'
import EmployeeUtilizationMobile from '../../components/reports/EmployeeUtilizationMobile'
import LabourSparesMixMobile from '../../components/reports/LabourSparesMixMobile'
import PartsConsumptionMobile from '../../components/reports/PartsConsumptionMobile'
import VasJobPerformanceMobile from '../../components/reports/VasJobPerformanceMobile'
import ProductLinePerformanceMobile from '../../components/reports/ProductLinePerformanceMobile'
import PartsBackorderMobile from '../../components/reports/PartsBackorderMobile'
import PartsOrderJustificationMobile from '../../components/reports/PartsOrderJustificationMobile'
import TatDurationBucketsMobile from '../../components/reports/TatDurationBucketsMobile'
import ModelWiseRevenueMobile from '../../components/reports/ModelWiseRevenueMobile'
import PartsValuationMobile from '../../components/reports/PartsValuationMobile'
import PartsInventoryTurnoverMobile from '../../components/reports/PartsInventoryTurnoverMobile'

export default function ReportsScreen() {
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<ReportCategoryId>('labour-revenue')
  const [selectedReportId, setSelectedReportId] =
    useState<ReportId>('service-type-labour-revenue')

  const [branch, setBranch] = useState<BranchFilter>('ALL')
  const [fuelType, setFuelType] = useState<'ALL' | 'PV' | 'EV'>('ALL')
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this-month')
  const [dateFieldType, setDateFieldType] = useState<DateFieldType>('closed_date')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [headerStats, setHeaderStats] = useState({
    monthlyJobCards: 0,
    monthlyRevenue: 0,
    partsNeedingReorder: 0,
    openTransitOrders: 0,
  })

  const exportCurrentSummary = async () => {
    try {
      const rows = [
        ['category', selectedCategoryId],
        ['report_id', selectedReportId],
        ['report_label', selectedReport?.label ?? ''],
        ['branch_filter', String(effectiveBranchFilter)],
        ['fuel_type', fuelType],
        ['date_preset', datePreset],
        ['date_field', effectiveDateFieldType],
        ['monthly_job_cards', String(headerStats.monthlyJobCards)],
        ['monthly_revenue', String(headerStats.monthlyRevenue)],
        ['parts_needing_reorder', String(headerStats.partsNeedingReorder)],
        ['open_transit_orders', String(headerStats.openTransitOrders)],
      ]

      const csv = ['metric,value', ...rows.map(([k, v]) => `${k},"${String(v).replace(/"/g, '""')}"`)].join(
        '\n',
      )

      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
      const fileName = `reports-summary-${selectedReportId}-${timestamp}.csv`
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`

      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      })

      const canShare = await Sharing.isAvailableAsync()
      if (!canShare) {
        Alert.alert('Export Ready', `CSV saved at: ${fileUri}`)
        return
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
      })
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export report summary CSV')
    }
  }

  const reportsInCategory = useMemo(
    () => getReportsByCategory(selectedCategoryId),
    [selectedCategoryId],
  )

  const selectedReport = useMemo(
    () => getReportById(selectedReportId),
    [selectedReportId],
  )

  const canApplyFuelTypeFilter = branch === 'Sitapura' || branch === 'ALL'

  const effectiveBranchFilter = useMemo<BranchFilter>(() => {
    if (branch === 'ALL' && fuelType !== 'ALL') {
      return `Sitapura ${fuelType}`
    }

    if (branch === 'Sitapura' && fuelType !== 'ALL') {
      return `Sitapura ${fuelType}`
    }

    return branch
  }, [branch, fuelType])

  const effectiveDateFieldType = useMemo<DateFieldType>(() => {
    if (selectedCategoryId === 'labour-revenue') {
      return 'invoice_date'
    }

    return dateFieldType
  }, [dateFieldType, selectedCategoryId])

  const dateFilter = useMemo<DateRangeFilter>(
    () => ({
      preset: datePreset,
      dateFieldType: effectiveDateFieldType,
    }),
    [datePreset, effectiveDateFieldType],
  )

  useEffect(() => {
    if (reportsInCategory.some((report) => report.id === selectedReportId)) return
    if (!reportsInCategory[0]) return
    setSelectedReportId(reportsInCategory[0].id)
  }, [reportsInCategory, selectedReportId])

  useEffect(() => {
    if (canApplyFuelTypeFilter) return
    if (fuelType === 'ALL') return
    setFuelType('ALL')
  }, [canApplyFuelTypeFilter, fuelType])

  useEffect(() => {
    let active = true

    const loadHeaderStats = async () => {
      setLoading(true)
      setError(null)

      try {
        const summary = await getLabourKpiSummary(effectiveBranchFilter, dateFilter, 'ALL')
        if (!active) return
        setHeaderStats(summary)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load reports dashboard')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    loadHeaderStats()

    return () => {
      active = false
    }
  }, [dateFilter, effectiveBranchFilter])

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ paddingBottom: 24 }}>
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-slate-900">Reports</Text>
        <Text className="text-sm text-slate-600 mt-1">
          Mobile parity shell wired to web report categories and report IDs.
        </Text>
      </View>

      {loading ? (
        <View className="px-4 py-10 items-center">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="mt-3 text-slate-500">Loading dashboard...</Text>
        </View>
      ) : error ? (
        <View className="mx-4 mt-3 bg-white border border-red-200 rounded-xl p-4">
          <Text className="text-red-700 font-semibold">Unable to load reports</Text>
          <Text className="text-red-600 text-sm mt-1">{error}</Text>
          <TouchableOpacity
            className="mt-3 bg-blue-600 rounded-lg py-2 items-center"
            onPress={() => {
              setError(null)
              setLoading(true)
            }}
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View className="px-4 mt-2">
            <View className="bg-white rounded-xl border border-slate-200 p-4">
              <Text className="text-xs uppercase tracking-wide text-slate-500">Revenue This Month</Text>
              <Text className="text-3xl font-bold text-slate-900 mt-1">
                INR {headerStats.monthlyRevenue.toLocaleString('en-IN')}
              </Text>
              <Text className="text-sm text-slate-600 mt-1">
                KPI source aligned with web summary query path.
              </Text>
            </View>
          </View>

          <View className="px-4 pt-3 pb-1 flex-row flex-wrap">
            <View className="w-1/2 pr-2 pb-2">
              <View className="bg-white border border-slate-200 rounded-xl p-4">
                <Text className="text-xs text-slate-500">Job Cards This Month</Text>
                <Text className="text-2xl font-bold text-slate-900 mt-1">{headerStats.monthlyJobCards}</Text>
              </View>
            </View>
            <View className="w-1/2 pl-2 pb-2">
              <View className="bg-white border border-slate-200 rounded-xl p-4">
                <Text className="text-xs text-slate-500">Parts to Reorder</Text>
                <Text className="text-2xl font-bold text-blue-700 mt-1">{headerStats.partsNeedingReorder}</Text>
              </View>
            </View>
            <View className="w-1/2 pr-2 pb-2">
              <View className="bg-white border border-slate-200 rounded-xl p-4">
                <Text className="text-xs text-slate-500">In-Transit Orders</Text>
                <Text className="text-2xl font-bold text-emerald-700 mt-1">{headerStats.openTransitOrders}</Text>
              </View>
            </View>
            <View className="w-1/2 pl-2 pb-2">
              <View className="bg-white border border-slate-200 rounded-xl p-4">
                <Text className="text-xs text-slate-500">Active Category</Text>
                <Text className="text-lg font-bold text-amber-700 mt-1">{selectedCategoryId}</Text>
              </View>
            </View>
          </View>

          <View className="px-4 pb-2">
            <Text className="text-sm font-semibold text-slate-700 mb-2">Categories</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row">
                {REPORT_CATEGORIES.map((category) => {
                  const isActive = selectedCategoryId === category.id
                  const count = getReportsByCategory(category.id).length
                  return (
                    <TouchableOpacity
                      key={category.id}
                      className={`mr-2 rounded-full px-3 py-2 border ${isActive ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}
                      onPress={() => setSelectedCategoryId(category.id)}
                    >
                      <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs font-semibold`}>
                        {category.label} ({count})
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          </View>

          <View className="px-4 pb-2">
            <Text className="text-sm font-semibold text-slate-700 mb-2">Reports In Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row">
                {reportsInCategory.map((report) => {
                  const isActive = selectedReportId === report.id
                  return (
                    <TouchableOpacity
                      key={report.id}
                      className={`mr-2 rounded-lg px-3 py-2 border ${isActive ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}
                      onPress={() => setSelectedReportId(report.id)}
                    >
                      <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs font-semibold`}>
                        {report.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          </View>

          <View className="px-4 pb-2">
            <Text className="text-sm font-semibold text-slate-700 mb-2">Filters</Text>
            <View className="bg-white border border-slate-200 rounded-xl p-3">
              <Text className="text-xs text-slate-500 mb-2">Branch</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row mb-2">
                  {(['ALL', ...REPORT_BRANCH_OPTIONS] as Array<'ALL' | string>).map((option) => {
                    const isActive = branch === option
                    return (
                      <TouchableOpacity
                        key={option}
                        className={`mr-2 rounded-full px-3 py-1 border ${isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'}`}
                        onPress={() => setBranch(option)}
                      >
                        <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs`}>
                          {option}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </ScrollView>

              {(branch === 'ALL' || branch === 'Sitapura') ? (
                <>
                  <Text className="text-xs text-slate-500 mb-2">Fuel Type</Text>
                  <View className="flex-row mb-2">
                    {(['ALL', 'PV', 'EV'] as const).map((option) => {
                      const isActive = fuelType === option
                      return (
                        <TouchableOpacity
                          key={option}
                          className={`mr-2 rounded-full px-3 py-1 border ${isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'}`}
                          onPress={() => setFuelType(option)}
                        >
                          <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs`}>
                            {option}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </>
              ) : null}

              <Text className="text-xs text-slate-500 mb-2">Date Range</Text>
              <View className="flex-row mb-2">
                {([
                  ['today', 'Today'],
                  ['this-week', 'This Week'],
                  ['this-month', 'This Month'],
                ] as Array<[DateRangePreset, string]>).map(([value, label]) => {
                  const isActive = datePreset === value
                  return (
                    <TouchableOpacity
                      key={value}
                      className={`mr-2 rounded-full px-3 py-1 border ${isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'}`}
                      onPress={() => setDatePreset(value)}
                    >
                      <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs`}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {selectedCategoryId !== 'labour-revenue' ? (
                <>
                  <Text className="text-xs text-slate-500 mb-2">Filter By</Text>
                  <View className="flex-row">
                    {([
                      ['closed_date', 'Job Closed Date'],
                      ['invoice_date', 'Invoice Date'],
                    ] as Array<[DateFieldType, string]>).map(([value, label]) => {
                      const isActive = dateFieldType === value
                      return (
                        <TouchableOpacity
                          key={value}
                          className={`mr-2 rounded-full px-3 py-1 border ${isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'}`}
                          onPress={() => setDateFieldType(value)}
                        >
                          <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs`}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </>
              ) : null}
            </View>
          </View>

          <View className="px-4 pt-1 pb-6">
            {selectedReportId === 'service-type-labour-revenue' ? (
              <ServiceTypeLabourRevenueMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
                serviceTypeFilter="ALL"
              />
            ) : selectedReportId === 'branch-labour-revenue' ? (
              <BranchLabourRevenueMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
                serviceTypeFilter="ALL"
              />
            ) : selectedReportId === 'manpower-wise-labour-revenue' ? (
              <ManpowerWiseLabourRevenueMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
                serviceTypeFilter="ALL"
                parentProductLineFilter="ALL"
              />
            ) : selectedReportId === 'duplicate-chassis-same-month' ? (
              <DuplicateChassisSameMonthMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'customer-retention' ? (
              <CustomerRetentionMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'service-due' ? (
              <ServiceDueMobile
                branch={effectiveBranchFilter}
              />
            ) : selectedReportId === 'advisor-performance' ? (
              <AdvisorPerformanceMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'vas-job-performance' ? (
              <VasJobPerformanceMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'tat-duration-buckets' ? (
              <TatDurationBucketsMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'employee-utilization' ? (
              <EmployeeUtilizationMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'daily-revenue' ? (
              <DailyRevenueMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'category-wise-revenue' ? (
              <CategoryWiseRevenueMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'monthly-trend-revenue' ? (
              <MonthlyRevenueTrendMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'labour-spares-mix' ? (
              <LabourSparesMixMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'product-line-performance' ? (
              <ProductLinePerformanceMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'model-wise-revenue' ? (
              <ModelWiseRevenueMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'parts-monthly-consumption' ? (
              <PartsMonthlyConsumptionMobile
                branch={effectiveBranchFilter}
              />
            ) : selectedReportId === 'parts-consumption-trend' ? (
              <PartsConsumptionTrendMobile
                branch={effectiveBranchFilter}
              />
            ) : selectedReportId === 'parts-stock-planning' ? (
              <PartsStockPlanningMobile
                branch={effectiveBranchFilter}
              />
            ) : selectedReportId === 'parts-consumption' ? (
              <PartsConsumptionMobile
                branch={effectiveBranchFilter}
              />
            ) : selectedReportId === 'parts-backorder' ? (
              <PartsBackorderMobile
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
              />
            ) : selectedReportId === 'parts-order-justification' ? (
              <PartsOrderJustificationMobile
                branch={effectiveBranchFilter}
              />
            ) : selectedReportId === 'parts-valuation' ? (
              <PartsValuationMobile
                branch={effectiveBranchFilter}
              />
            ) : selectedReportId === 'parts-inventory-turnover' ? (
              <PartsInventoryTurnoverMobile
                branch={effectiveBranchFilter}
              />
            ) : (
              <>
                <Text className="text-sm font-semibold text-slate-700 mb-2">Selected Report</Text>
                <TouchableOpacity
                  className="bg-white border border-slate-200 rounded-xl p-4 mb-2"
                  onPress={exportCurrentSummary}
                >
                  <Text className="text-base font-semibold text-slate-900">
                    {selectedReport?.label ?? 'Report'}
                  </Text>
                  <Text className="text-sm text-slate-600 mt-1">
                    {selectedReport?.description ?? 'Report definition unavailable.'}
                  </Text>
                  <Text className="text-xs text-blue-700 mt-2">
                    Tap this card to export current filter and KPI summary as CSV.
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}
    </ScrollView>
  )
}
