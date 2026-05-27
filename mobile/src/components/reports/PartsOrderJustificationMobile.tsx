import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getPartsOrderJustification,
  type BranchFilter,
  type PartsOrderJustificationRow,
} from '../../lib/reportQueries'
import { shareCsv, toCsv } from './reportExport'

type SortKey = 'partNumber' | 'recommendedOrderQuantity' | 'actualOpenOrderQuantity' | 'shortageQuantity'

interface Props {
  branch: BranchFilter
}

export default function PartsOrderJustificationMobile({ branch }: Props) {
  const [rows, setRows] = useState<PartsOrderJustificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('shortageQuantity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await getPartsOrderJustification(branch)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load parts order justification report')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [branch])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === 'partNumber') return a.partNumber.localeCompare(b.partNumber) * direction
      return (a[sortKey] - b[sortKey]) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      total: rows.length,
      justified: rows.filter((row) => row.orderJustified).length,
      notJustified: rows.filter((row) => !row.orderJustified).length,
      shortage: rows.reduce((sum, row) => sum + row.shortageQuantity, 0),
    }),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'partNumber' ? 'asc' : 'desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        part_number: row.partNumber,
        part_description: row.partDescription,
        recommended_order_quantity: row.recommendedOrderQuantity,
        actual_open_order_quantity: row.actualOpenOrderQuantity,
        shortage_quantity: row.shortageQuantity,
        projected_demand: row.projectedDemand,
        projected_available: row.projectedAvailable,
        order_justified: row.orderJustified ? 'YES' : 'NO',
        justification_reason: row.justificationReason,
      }))

      await shareCsv(toCsv(exportRows), 'parts-order-justification-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export parts order justification CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading parts order justification report...</Text>
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <View className="bg-white border border-red-200 rounded-xl p-4">
        <Text className="text-red-700 font-semibold">Failed to load report</Text>
        <Text className="text-red-600 text-sm mt-1">{error}</Text>
      </View>
    )
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-slate-900">Parts Order Justification Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Validates open order volume against projected demand and shortage indicators.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Rows</Text><Text className="text-lg font-bold text-blue-900 mt-1">{totals.total.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Justified</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.justified.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-rose-50 border border-rose-100 p-3"><Text className="text-[10px] uppercase text-rose-600 font-semibold">Not Justified</Text><Text className="text-lg font-bold text-rose-900 mt-1">{totals.notJustified.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Total Shortage</Text><Text className="text-lg font-bold text-amber-900 mt-1">{totals.shortage.toLocaleString('en-IN')}</Text></View></View>
        </View>
      </View>

      {rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm text-slate-500">No records found for selected filters.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm font-semibold text-slate-900 mb-2">Order Justification Table</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['partNumber', 'Part Number'],
              ['recommendedOrderQuantity', 'Recommended'],
              ['actualOpenOrderQuantity', 'Actual Open'],
              ['shortageQuantity', 'Shortage'],
            ] as Array<[SortKey, string]>).map(([key, label]) => (
              <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
                <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View className="flex-row bg-slate-100 rounded-t-md">
                <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Part Number</Text>
                <Text className="w-36 px-2 py-2 text-[11px] font-semibold text-slate-700">Description</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Recommended</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Actual Open</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Shortage</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Justified</Text>
                <Text className="w-44 px-2 py-2 text-[11px] font-semibold text-slate-700">Reason</Text>
              </View>

              {sortedRows.map((row) => (
                <View key={row.partNumber} className="flex-row border-b border-slate-100">
                  <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.partNumber}</Text>
                  <Text className="w-36 px-2 py-2 text-xs text-slate-700">{row.partDescription || '-'}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.recommendedOrderQuantity.toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.actualOpenOrderQuantity.toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.shortageQuantity.toLocaleString('en-IN')}</Text>
                  <Text className={`w-24 px-2 py-2 text-xs font-semibold ${row.orderJustified ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {row.orderJustified ? 'Yes' : 'No'}
                  </Text>
                  <Text className="w-44 px-2 py-2 text-xs text-slate-700">{row.justificationReason}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}