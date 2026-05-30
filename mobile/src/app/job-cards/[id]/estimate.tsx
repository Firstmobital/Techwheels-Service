import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import {
  addEstimateRow,
  deleteEstimateRow,
  listEstimateRows,
  updateEstimateRow,
  type AddEstimateRowInput,
} from '../../../lib/api/estimate'
import { listPanels } from '../../../lib/api/panels'
import { listPanelPhotos } from '../../../lib/api/photos'
import { getAutoDocWorkflowOptions } from '../../../lib/api/autodocRates'
import JobWorkflowHeader from '../../../components/autodoc/JobWorkflowHeader'
import { generateEstimateCsv } from '../../../lib/generators/generateEstimateCsv'
import { uploadDocumentFile } from '../../../lib/api/documents'

type Params = {
  id?: string | string[]
  jcNumber?: string | string[]
  regNumber?: string | string[]
}

type EstimateFormRow = {
  id: string
  dbId?: string
  panelName: string
  action: string
  defect: string
  partNumber: string
  partDescription: string
  qty: string
  ndpValue: string
  paintCharges: string
  labourCharges: string
}

function canonicalizeEstimateAction(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'parts replacement' || normalized === 'part replacement') return 'replace'
  if (normalized === 'repair') return 'repaint'
  return normalized
}

function isReplaceAction(value: string): boolean {
  return canonicalizeEstimateAction(value) === 'replace'
}

function mapDbRowToForm(row: any): EstimateFormRow {
  return {
    id: `db-${row.id}`,
    dbId: row.id,
    panelName: String(row.panel_name ?? ''),
    action: canonicalizeEstimateAction(String(row.action ?? '')),
    defect: String(row.defect ?? ''),
    partNumber: String(row.part_number ?? ''),
    partDescription: String(row.part_description ?? ''),
    qty: String(row.qty ?? 1),
    ndpValue: String(row.ndp_value ?? 0),
    paintCharges: String(row.paint_charges ?? 0),
    labourCharges: String(row.labour_charges ?? 0),
  }
}

function newRow(panelName = ''): EstimateFormRow {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    panelName,
    action: '',
    defect: '',
    partNumber: '',
    partDescription: '',
    qty: '1',
    ndpValue: '0',
    paintCharges: '0',
    labourCharges: '0',
  }
}

export default function JobCardEstimateScreen() {
  const router = useRouter()
  const { id, jcNumber, regNumber } = useLocalSearchParams<Params>()
  const jobCardId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id])
  const jobCardNumberHint = useMemo(() => (Array.isArray(jcNumber) ? jcNumber[0] : jcNumber), [jcNumber])
  const regNumberHint = useMemo(() => (Array.isArray(regNumber) ? regNumber[0] : regNumber), [regNumber])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<EstimateFormRow[]>([])
  const [panels, setPanels] = useState<string[]>([])
  const [preRepairPanelNames, setPreRepairPanelNames] = useState<Set<string>>(new Set())
  const [estimateActionOptions, setEstimateActionOptions] = useState<string[]>(['repaint', 'replace'])
  const [estimateDefectOptions, setEstimateDefectOptions] = useState<string[]>(['Rust', 'Dent', 'Scratch', 'Paint Peel', 'Corrosion'])
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    if (!jobCardId) {
      setError('Missing job card id')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [estimateRes, panelRes, photoRes, workflowRes] = await Promise.all([
      listEstimateRows(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listPanels(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listPanelPhotos(jobCardId),
      getAutoDocWorkflowOptions(),
    ])

    if (estimateRes.error) {
      setError(estimateRes.error)
      setLoading(false)
      return
    }
    if (panelRes.error) {
      setError(panelRes.error)
      setLoading(false)
      return
    }
    if (photoRes.error) {
      setError(photoRes.error)
      setLoading(false)
      return
    }

    setRows((estimateRes.data ?? []).map(mapDbRowToForm))

    const panelNames = (panelRes.data ?? [])
      .map((p) => p.panel_name?.trim() ?? '')
      .filter((name) => name.length > 0)
    setPanels(Array.from(new Set(panelNames)))

    const preRepairSet = new Set<string>()
    for (const photo of photoRes.data ?? []) {
      const stage = String((photo as any).repair_stage ?? '').trim().toLowerCase()
      if (stage !== 'pre-repair') continue
      const panel = (panelRes.data ?? []).find((p) => p.id === photo.panel_id)
      const panelName = panel?.panel_name?.trim().toLowerCase()
      if (panelName) preRepairSet.add(panelName)
    }
    setPreRepairPanelNames(preRepairSet)

    if (workflowRes.data?.estimateActionOptions?.length) {
      setEstimateActionOptions(
        Array.from(new Set(workflowRes.data.estimateActionOptions.map(canonicalizeEstimateAction).filter(Boolean))).sort((a, b) => a.localeCompare(b))
      )
    }
    if (workflowRes.data?.estimateDefectOptions?.length) {
      setEstimateDefectOptions(
        Array.from(new Set(workflowRes.data.estimateDefectOptions.filter((x) => x.trim().length > 0))).sort((a, b) => a.localeCompare(b))
      )
    }

    setLoading(false)
  }

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [jobCardId])
  )

  const updateLocalRow = (rowId: string, patch: Partial<EstimateFormRow>) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }

  const addRow = (panelName = '') => {
    setRows((prev) => [...prev, newRow(panelName)])
  }

  const removeRow = async (row: EstimateFormRow) => {
    if (!row.dbId) {
      setRows((prev) => prev.filter((entry) => entry.id !== row.id))
      return
    }

    setDeletingRowId(row.id)
    const result = await deleteEstimateRow(row.dbId)
    setDeletingRowId(null)

    if (result.error) {
      Alert.alert('Delete Failed', result.error)
      return
    }

    setRows((prev) => prev.filter((entry) => entry.id !== row.id))
  }

  const validateRow = (row: EstimateFormRow): string | null => {
    if (!row.panelName.trim()) return 'Panel is required.'
    if (!canonicalizeEstimateAction(row.action)) return 'Action is required.'
    if (!row.defect.trim()) return 'Defect is required.'
    if (isReplaceAction(row.action) && !row.partNumber.trim()) return 'Part number is required for replace action.'

    const qty = Number(row.qty || '0')
    if (!Number.isFinite(qty) || qty <= 0) return 'Quantity must be greater than zero.'

    for (const value of [row.ndpValue, row.paintCharges, row.labourCharges]) {
      const num = Number(value || '0')
      if (!Number.isFinite(num) || num < 0) return 'Amount fields must be non-negative numbers.'
    }

    return null
  }

  const saveRow = async (row: EstimateFormRow) => {
    if (!jobCardId) return

    const validationError = validateRow(row)
    if (validationError) {
      Alert.alert('Invalid Estimate Row', validationError)
      return
    }

    const payload: AddEstimateRowInput = {
      jobCardId,
      srNo: rows.findIndex((entry) => entry.id === row.id) + 1,
      panelName: row.panelName,
      partNumber: row.partNumber || undefined,
      partDescription: row.partDescription || undefined,
      defect: row.defect,
      action: canonicalizeEstimateAction(row.action),
      qty: Number(row.qty || '1'),
      ndpValue: Number(row.ndpValue || '0'),
      cutWeldCharges: 0,
      paintCharges: Number(row.paintCharges || '0'),
      totalSpecialCharges: 0,
      jobCode: undefined,
      jobCodeDesc: undefined,
      noOff: 1,
      labourCharges: Number(row.labourCharges || '0'),
    }

    setSavingRowId(row.id)

    const result = row.dbId
      ? await updateEstimateRow(row.dbId, {
          panelName: payload.panelName,
          partNumber: payload.partNumber,
          partDescription: payload.partDescription,
          defect: payload.defect,
          action: payload.action,
          qty: payload.qty,
          ndpValue: payload.ndpValue,
          paintCharges: payload.paintCharges,
          labourCharges: payload.labourCharges,
          cutWeldCharges: payload.cutWeldCharges,
          totalSpecialCharges: payload.totalSpecialCharges,
          noOff: payload.noOff,
        })
      : await addEstimateRow(payload)

    setSavingRowId(null)

    if (result.error || !result.data) {
      Alert.alert('Save Failed', result.error ?? 'Unable to save estimate row')
      return
    }

    setRows((prev) => prev.map((entry) => (entry.id === row.id ? mapDbRowToForm(result.data) : entry)))
  }

  const completedEstimatePanels = useMemo(() => {
    const completed = new Set<string>()
    for (const row of rows) {
      const validationError = validateRow(row)
      if (validationError) continue
      completed.add(row.panelName.trim().toLowerCase())
    }
    return completed
  }, [rows])

  const panelReadiness = useMemo(() => {
    return panels.map((panelName) => {
      const key = panelName.trim().toLowerCase()
      const hasPreRepair = preRepairPanelNames.has(key)
      const hasCompleteEstimate = completedEstimatePanels.has(key)
      return {
        panelName,
        hasPreRepair,
        hasCompleteEstimate,
      }
    })
  }, [completedEstimatePanels, panels, preRepairPanelNames])

  const missingEstimatePanels = panelReadiness.filter((item) => item.hasPreRepair && !item.hasCompleteEstimate)

  const onExportEstimate = async () => {
    if (!jobCardId) return

    if (rows.length === 0) {
      Alert.alert('No Estimate Rows', 'Add at least one estimate row before exporting.')
      return
    }

    setExporting(true)
    try {
      const blob = await generateEstimateCsv(jobCardId)
      const fileName = `estimate_${jobCardId}.csv`

      const uploadRes = await uploadDocumentFile({
        jobCardId,
        docType: 'excel_estimate',
        file: blob,
        fileName,
        contentType: 'text/csv',
      })

      if (uploadRes.error) {
        Alert.alert('Export Failed', uploadRes.error)
        return
      }

      Alert.alert('Exported', 'Estimate Excel generated and uploaded successfully.')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message ?? 'Unable to export estimate excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Estimate Editor' }} />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <JobWorkflowHeader jobCardId={jobCardId} jcNumber={jobCardNumberHint} regNumber={regNumberHint} activeTab="estimate" />

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading estimate data...</Text>
          </View>
        ) : error ? (
          <View className="bg-white border border-red-200 rounded-xl p-5">
            <Text className="text-lg font-semibold text-red-700">Unable to load estimate</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity className="mt-4 bg-blue-600 rounded-lg py-3 items-center" onPress={load}>
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-xs uppercase tracking-wide text-gray-500">Panel Estimate Readiness</Text>
              {panelReadiness.length === 0 ? (
                <Text className="text-sm text-gray-600 mt-2">No panels selected yet.</Text>
              ) : (
                panelReadiness.map((item) => (
                  <View key={item.panelName} className="mt-2 flex-row items-center justify-between">
                    <Text className="text-sm text-gray-800">{item.panelName}</Text>
                    <View className="flex-row">
                      <Text className={`text-[11px] mr-2 px-2 py-1 rounded ${item.hasPreRepair ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {item.hasPreRepair ? 'Pre-Repair OK' : 'Pre-Repair Missing'}
                      </Text>
                      <Text className={`text-[11px] px-2 py-1 rounded ${item.hasCompleteEstimate ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {item.hasCompleteEstimate ? 'Estimate OK' : 'Estimate Pending'}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              {missingEstimatePanels.length > 0 && (
                <Text className="text-xs text-amber-700 mt-3">
                  Pending estimate completion for: {missingEstimatePanels.map((x) => x.panelName).join(', ')}
                </Text>
              )}
            </View>

            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-base font-semibold text-gray-900">Estimate Rows</Text>

              {rows.length === 0 && (
                <Text className="text-sm text-gray-500 mt-3">No estimate rows added yet.</Text>
              )}

              {rows.map((row, index) => (
                <View key={row.id} className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <Text className="text-xs text-gray-500 mb-2">Row {index + 1}</Text>

                  <Text className="text-xs text-gray-600 mb-1">Panel *</Text>
                  <View className="flex-row flex-wrap mb-2">
                    {panels.map((panelName) => {
                      const active = row.panelName.trim().toLowerCase() === panelName.trim().toLowerCase()
                      return (
                        <TouchableOpacity
                          key={`${row.id}-${panelName}`}
                          className={`mr-2 mb-2 rounded-full border px-3 py-2 ${active ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                          onPress={() => updateLocalRow(row.id, { panelName })}
                        >
                          <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>{panelName}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  <Text className="text-xs text-gray-600 mb-1">Action *</Text>
                  <View className="flex-row mb-2">
                    {estimateActionOptions.map((action) => {
                      const normalized = canonicalizeEstimateAction(action)
                      const active = canonicalizeEstimateAction(row.action) === normalized
                      return (
                        <TouchableOpacity
                          key={`${row.id}-${normalized}`}
                          className={`mr-2 rounded-full border px-3 py-2 ${active ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}`}
                          onPress={() => updateLocalRow(row.id, { action: normalized })}
                        >
                          <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>{normalized}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  <Text className="text-xs text-gray-600 mb-1">Defect *</Text>
                  <TextInput
                    value={row.defect}
                    onChangeText={(value) => updateLocalRow(row.id, { defect: value })}
                    placeholder={estimateDefectOptions[0] || 'Defect'}
                    className="border border-gray-300 rounded-lg px-3 py-3 bg-white mb-2"
                  />

                  <Text className="text-xs text-gray-600 mb-1">Part Number {isReplaceAction(row.action) ? '*' : ''}</Text>
                  <TextInput
                    value={row.partNumber}
                    onChangeText={(value) => updateLocalRow(row.id, { partNumber: value })}
                    placeholder="Part number"
                    className="border border-gray-300 rounded-lg px-3 py-3 bg-white mb-2"
                  />

                  <Text className="text-xs text-gray-600 mb-1">Part Description</Text>
                  <TextInput
                    value={row.partDescription}
                    onChangeText={(value) => updateLocalRow(row.id, { partDescription: value })}
                    placeholder="Part description"
                    className="border border-gray-300 rounded-lg px-3 py-3 bg-white mb-2"
                  />

                  <View className="flex-row">
                    <View className="flex-1 mr-2">
                      <Text className="text-xs text-gray-600 mb-1">Qty *</Text>
                      <TextInput
                        value={row.qty}
                        onChangeText={(value) => updateLocalRow(row.id, { qty: value })}
                        keyboardType="number-pad"
                        className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
                      />
                    </View>
                    <View className="flex-1 ml-2">
                      <Text className="text-xs text-gray-600 mb-1">NDP</Text>
                      <TextInput
                        value={row.ndpValue}
                        onChangeText={(value) => updateLocalRow(row.id, { ndpValue: value })}
                        keyboardType="decimal-pad"
                        className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
                      />
                    </View>
                  </View>

                  <View className="flex-row mt-2">
                    <View className="flex-1 mr-2">
                      <Text className="text-xs text-gray-600 mb-1">Paint</Text>
                      <TextInput
                        value={row.paintCharges}
                        onChangeText={(value) => updateLocalRow(row.id, { paintCharges: value })}
                        keyboardType="decimal-pad"
                        className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
                      />
                    </View>
                    <View className="flex-1 ml-2">
                      <Text className="text-xs text-gray-600 mb-1">Labour</Text>
                      <TextInput
                        value={row.labourCharges}
                        onChangeText={(value) => updateLocalRow(row.id, { labourCharges: value })}
                        keyboardType="decimal-pad"
                        className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
                      />
                    </View>
                  </View>

                  <View className="flex-row mt-3">
                    <TouchableOpacity
                      className={`flex-1 mr-2 rounded-lg py-2 items-center ${savingRowId === row.id ? 'bg-blue-300' : 'bg-blue-600'}`}
                      onPress={() => saveRow(row)}
                      disabled={savingRowId === row.id}
                    >
                      <Text className="text-white text-sm font-semibold">
                        {savingRowId === row.id ? 'Saving...' : 'Save Row'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className={`flex-1 ml-2 rounded-lg py-2 items-center ${deletingRowId === row.id ? 'bg-red-300' : 'bg-red-600'}`}
                      onPress={() => removeRow(row)}
                      disabled={deletingRowId === row.id}
                    >
                      <Text className="text-white text-sm font-semibold">
                        {deletingRowId === row.id ? 'Deleting...' : 'Delete Row'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <TouchableOpacity className="mt-3 border border-blue-300 rounded-lg py-3 items-center" onPress={() => addRow()}>
                <Text className="text-blue-700 font-semibold">+ Add Estimate Row</Text>
              </TouchableOpacity>
            </View>

            {rows.length > 0 && (
              <View className="bg-white border border-gray-200 rounded-xl p-4">
                <Text className="text-xs uppercase tracking-wide text-gray-500">Summary</Text>
                <Text className="text-sm text-gray-700 mt-1">Rows: {rows.length}</Text>
                <Text className="text-sm text-gray-700 mt-1">
                  Panels Completed: {completedEstimatePanels.size} / {panels.length}
                </Text>

                <TouchableOpacity
                  className={`mt-3 rounded-lg py-3 items-center ${exporting ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                  disabled={exporting}
                  onPress={() => void onExportEstimate()}
                >
                  <Text className="text-white font-semibold">{exporting ? 'Exporting...' : 'Export Estimate Excel'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="mt-3 rounded-lg py-3 items-center bg-slate-700"
                  onPress={() => {
                    if (!jobCardId) return
                    router.push(`/job-cards/${jobCardId}/submit`)
                  }}
                >
                  <Text className="text-white font-semibold">Next: Submit Stage</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  )
}
