import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getPartsBackorderSummary,
  type BranchFilter,
  type DateRangeFilter,
  type PartsBackorderSummaryRow,
} from '../../lib/reportQueries'
import { shareCsv, toCsv } from './reportExport'

type SortKey = 'partNumber' | 'orderedQuantity' | 'receivedQuantity' | 'backorderQuantity' | 'openOrderQuantity'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export default function PartsBackorderMobile({ branch, dateFilter }: Props) {
  const [rows, setRows] = useState<PartsBackorderSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('backorderQuantity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await getPartsBackorderSummary(branch, dateFilter)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load parts backorder report')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [branch, dateFilter])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === 'partNumber') return a.partNumber.localeCompare(b.partNumber) * direction
      return (a[sortKey] - b[sortKey]) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      parts: rows.length,
      ordered: rows.reduce((sum, row) => sum + row.orderedQuantity, 0),
      received: rows.reduce((sum, row) => sum + row.receivedQuantity, 0),
      backorder: rows.reduce((sum, row) => sum + row.backorderQuantity, 0),
      openOrder: rows.reduce((sum, row) => sum + row.openOrderQuantity, 0),
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
        ordered_quantity: row.orderedQuantity,
        received_quantity: row.receivedQuantity,
        backorder_quantity: row.backorderQuantity,
        open_order_quantity: row.openOrderQuantity,
        last_order_date: row.lastOrderDate ?? '',
      }))

      await shareCsv(toCsv(exportRows), 'parts-backorder-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export parts backorder CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading parts backorder report...</Text>
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
            <Text className="text-base font-semibold text-slate-900">Parts Backorder Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Ordered vs received quantity with open backorder risk by part number.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Parts</Text><Text className="text-lg font-bold text-blue-900 mt-1">{totals.parts.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Ordered</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.ordered.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Backorder</Text><Text className="text-lg font-bold text-amber-900 mt-1">{totals.backorder.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-violet-50 border border-violet-100 p-3"><Text className="text-[10px] uppercase text-violet-600 font-semibold">Open Order</Text><Text className="text-lg font-bold text-violet-900 mt-1">{totals.openOrder.toLocaleString('en-IN')}</Text></View></View>
        </View>
      </View>

      {rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm text-slate-500">No records found for selected filters.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm font-semibold text-slate-900 mb-2">Backorder Table</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['partNumber', 'Part Number'],
              ['orderedQuantity', 'Ordered'],
              ['receivedQuantity', 'Received'],
              ['backorderQuantity', 'Backorder'],
              ['openOrderQuantity', 'Open Order'],
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
                <Text className="w-44 px-2 py-2 text-[11px] font-semibold text-slate-700">Description</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Ordered</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Received</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Backorder</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Open</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Last Order</Text>
              </View>

              {sortedRows.map((row) => (
                <View key={row.partNumber} className="flex-row border-b border-slate-100">
                  <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.partNumber}</Text>
                  <Text className="w-44 px-2 py-2 text-xs text-slate-700">{row.partDescription || '-'}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.orderedQuantity.toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.receivedQuantity.toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.backorderQuantity.toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-800 text-right font-semibold">{row.openOrderQuantity.toLocaleString('en-IN')}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.lastOrderDate ?? '-'}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}
