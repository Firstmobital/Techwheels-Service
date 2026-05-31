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
  listEstimateRows,
  updateEstimateRow,
  type AddEstimateRowInput,
} from '../../../lib/api/estimate'
import { getJobCardSummary } from '../../../lib/api/jobCards'
import { listPanels } from '../../../lib/api/panels'
import { listPanelPhotos } from '../../../lib/api/photos'
import { getActiveModelRates, getAutoDocWorkflowOptions, type ModelPanelRate } from '../../../lib/api/autodocRates'
import JobWorkflowHeader from '../../../components/autodoc/JobWorkflowHeader'
import NativeSelectField from '../../../components/common/NativeSelectField'
import { generateEstimateCsv } from '../../../lib/generators/generateEstimateCsv'
import { uploadDocumentFile } from '../../../lib/api/documents'
import { HeroBlock, Pill } from '../../../components/ui'

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

function normalizePanelKey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function inferRateTypeFromPaint(paintType: string): 'pp' | 'pm' | 'ps' {
  const normalized = normalizeText(paintType)
  if (normalized.includes('pearl')) return 'pp'
  if (normalized.includes('metal')) return 'pm'
  return 'ps'
}

function getLabourRateForPanel(rateRows: ModelPanelRate[], panel: string, paintType: string): number | null {
  const match = rateRows.find((row) => normalizeText(row.panelLabel) === normalizeText(panel))
  if (!match) return null

  const rateType = inferRateTypeFromPaint(paintType)
  if (rateType === 'pp') return match.ppRate
  if (rateType === 'pm') return match.pmRate
  return match.psRate
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

function isRepaintAction(value: string): boolean {
  return canonicalizeEstimateAction(value) === 'repaint'
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

function buildRowsForPanels(panelNames: string[], dbRows: EstimateFormRow[]): EstimateFormRow[] {
  const byPanel = new Map<string, EstimateFormRow>()
  for (const row of dbRows) {
    const key = normalizePanelKey(row.panelName)
    if (!key || byPanel.has(key)) continue
    byPanel.set(key, row)
  }

  return panelNames.map((panelName) => {
    const existing = byPanel.get(normalizePanelKey(panelName))
    if (existing) {
      return {
        ...existing,
        panelName,
      }
    }

    return {
      id: `new-${panelName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
  })
}

function formatCurrency(value: number): string {
  return `Rs ${value.toLocaleString('en-IN')}`
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
  const [activeModelRates, setActiveModelRates] = useState<ModelPanelRate[]>([])
  const [resolvedModelName, setResolvedModelName] = useState('')
  const [resolvedPaintType, setResolvedPaintType] = useState('')
  const [resolvedCityCategory, setResolvedCityCategory] = useState('')
  const [loadingModelRates, setLoadingModelRates] = useState(false)
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    if (!jobCardId) {
      setError('Missing job card id')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [estimateRes, panelRes, photoRes, workflowRes, summaryRes] = await Promise.all([
      listEstimateRows(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listPanels(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listPanelPhotos(jobCardId),
      getAutoDocWorkflowOptions(),
      getJobCardSummary(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
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

    const panelNames = Array.from(new Set(
      (panelRes.data ?? [])
        .map((p) => p.panel_name?.trim() ?? '')
        .filter((name) => name.length > 0),
    ))
    const dbRows = (estimateRes.data ?? []).map(mapDbRowToForm)

    setPanels(panelNames)
    setRows(buildRowsForPanels(panelNames, dbRows))

    const panelNameById = new Map<string, string>()
    for (const panel of panelRes.data ?? []) {
      const name = panel.panel_name?.trim()
      if (!name) continue
      panelNameById.set(panel.id, normalizePanelKey(name))
    }

    const preRepairSet = new Set<string>()
    for (const photo of photoRes.data ?? []) {
      const stage = String((photo as any).stage ?? '').trim().toLowerCase()
      if (stage !== 'pre-repair') continue
      const panelKey = panelNameById.get(photo.panel_id)
      if (panelKey) preRepairSet.add(panelKey)
    }
    setPreRepairPanelNames(preRepairSet)

    // Stage gate: enforce pre-repair photos for all selected panels before accessing Estimate
    const normalizedPanelNames = panelNames.map((name) => normalizePanelKey(name))
    const hasAllPreRepairPhotos = normalizedPanelNames.every((panelKey) => preRepairSet.has(panelKey))

    if (!hasAllPreRepairPhotos) {
      setError('Pre-repair photos required')
      setLoading(false)
      Alert.alert(
        'Documentation Incomplete',
        'All selected panels must have pre-repair photos before proceeding to Estimate. Please return to the Damage stage.',
        [
          {
            text: 'Go Back to Damage',
            onPress: () => {
              router.push({
                pathname: '/job-cards/[id]/damage',
                params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' },
              })
            },
          },
        ]
      )
      return
    }

    if (workflowRes.data?.estimateActionOptions?.length) {
      setEstimateActionOptions(
        Array.from(new Set(workflowRes.data.estimateActionOptions.map(canonicalizeEstimateAction).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      )
    }
    if (workflowRes.data?.estimateDefectOptions?.length) {
      setEstimateDefectOptions(
        Array.from(new Set(workflowRes.data.estimateDefectOptions.filter((x) => x.trim().length > 0))).sort((a, b) => a.localeCompare(b)),
      )
    }

    const modelName = String(summaryRes.data?.model ?? '').trim()
    const cityCategory = String(summaryRes.data?.bp_city_category ?? '').trim()
    const paintType = String(summaryRes.data?.paint_type ?? '').trim()

    setResolvedModelName(modelName)
    setResolvedCityCategory(cityCategory)
    setResolvedPaintType(paintType)

    if (!modelName || !cityCategory) {
      setActiveModelRates([])
      setLoadingModelRates(false)
      setLoading(false)
      return
    }

    setLoadingModelRates(true)
    const ratesRes = await getActiveModelRates({
      modelName,
      cityCategory,
    })
    setLoadingModelRates(false)

    if (ratesRes.error || !ratesRes.data) {
      setActiveModelRates([])
      setLoading(false)
      return
    }

    setActiveModelRates(ratesRes.data.rows)

    setLoading(false)
  }

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [jobCardId]),
  )

  const updateLocalRow = (rowId: string, patch: Partial<EstimateFormRow>) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== rowId) return row
      const next: EstimateFormRow = { ...row, ...patch }

      if (patch.action !== undefined) {
        next.action = canonicalizeEstimateAction(patch.action)
      }

      if (isRepaintAction(next.action)) {
        next.partNumber = '-'
        next.ndpValue = '0'

        const labourRate = getLabourRateForPanel(activeModelRates, next.panelName, resolvedPaintType)
        if (labourRate != null) {
          next.labourCharges = String(labourRate)
        }
      } else if (next.partNumber === '-') {
        next.partNumber = ''
      }

      return next
    }))
  }

  const isEstimateComplete = useCallback((row: EstimateFormRow): boolean => {
    const action = canonicalizeEstimateAction(row.action)
    const defect = row.defect.trim()
    const partNumber = row.partNumber.trim()
    if (!action || !defect) return false
    if (action === 'replace' && !partNumber) return false
    return true
  }, [])

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
      partNumber: isRepaintAction(row.action) ? undefined : (row.partNumber || undefined),
      // Keep part_description backend-managed in web-parity mode.
      partDescription: row.panelName || undefined,
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

    setRows((prev) => prev.map((entry) => {
      if (entry.id !== row.id) return entry
      const mapped = mapDbRowToForm(result.data)
      return {
        ...mapped,
        panelName: entry.panelName,
      }
    }))
  }

  const completedEstimatePanels = useMemo(() => {
    const completed = new Set<string>()
    for (const row of rows) {
      if (!isEstimateComplete(row)) continue
      completed.add(normalizePanelKey(row.panelName))
    }
    return completed
  }, [isEstimateComplete, rows])

  const panelReadiness = useMemo(() => {
    return panels.map((panelName) => {
      const key = normalizePanelKey(panelName)
      return {
        panelName,
        hasPreRepair: preRepairPanelNames.has(key),
        hasCompleteEstimate: completedEstimatePanels.has(key),
      }
    })
  }, [completedEstimatePanels, panels, preRepairPanelNames])

  const missingEstimatePanels = panelReadiness.filter((item) => item.hasPreRepair && !item.hasCompleteEstimate)

  const estimateTotals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const parts = Number(row.ndpValue || '0') || 0
      const paint = Number(row.paintCharges || '0') || 0
      const labour = Number(row.labourCharges || '0') || 0
      acc.parts += parts
      acc.paint += paint
      acc.labour += labour
      return acc
    }, { parts: 0, paint: 0, labour: 0 })
  }, [rows])

  const grandTotal = estimateTotals.parts + estimateTotals.paint + estimateTotals.labour

  const onExportEstimate = async () => {
    if (!jobCardId) return

    if (rows.length === 0) {
      Alert.alert('No Panels Selected', 'Select at least one panel in Damage stage before exporting estimate.')
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
      <ScrollView className="flex-1 bg-slate-100" contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <JobWorkflowHeader jobCardId={jobCardId} jcNumber={jobCardNumberHint} regNumber={regNumberHint} activeTab="estimate" />

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#1d4ed8" />
            <Text className="text-sm text-slate-600 mt-3">Loading estimate data...</Text>
          </View>
        ) : error ? (
          <View className="bg-white border border-red-200 rounded-2xl p-5 mt-3">
            <Text className="text-lg font-semibold text-red-700">Unable to load estimate</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity className="mt-4 bg-blue-600 rounded-xl py-3 items-center" onPress={load}>
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <HeroBlock
              title="Estimate Total"
              mainValue={formatCurrency(grandTotal)}
              subtitle={`${completedEstimatePanels.size} of ${panels.length} panels estimate-ready`}
              variant="brand"
            >
              <View className="mt-4 flex-row gap-3">
                <View className="flex-1 rounded-xl bg-white bg-opacity-15 px-3 py-2.5">
                  <Text className="text-[10px] font-semibold text-blue-100 uppercase tracking-wide">Parts</Text>
                  <Text className="text-lg font-bold text-white mt-1">{formatCurrency(estimateTotals.parts)}</Text>
                </View>
                <View className="flex-1 rounded-xl bg-white bg-opacity-15 px-3 py-2.5">
                  <Text className="text-[10px] font-semibold text-blue-100 uppercase tracking-wide">Paint + Labour</Text>
                  <Text className="text-lg font-bold text-white mt-1">{formatCurrency(estimateTotals.paint + estimateTotals.labour)}</Text>
                </View>
              </View>
              <Text className="text-xs mt-3 text-blue-50">
                Rate Card Status:{' '}
                {!resolvedModelName || !resolvedCityCategory ? (
                  <Text className="text-blue-100">Awaiting model/city category</Text>
                ) : loadingModelRates ? (
                  <Text className="text-blue-100">Loading rates...</Text>
                ) : activeModelRates.length > 0 ? (
                  <Text className="text-emerald-100 font-semibold">{activeModelRates.length} panel rates active: {resolvedModelName} / {resolvedCityCategory}</Text>
                ) : (
                  <Text className="text-amber-100">No active rates found</Text>
                )}
              </Text>
            </HeroBlock>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mt-3">
              <Text className="text-xs uppercase tracking-wide text-slate-500">Panel Estimate Readiness</Text>
              {panelReadiness.length === 0 ? (
                <Text className="text-sm text-slate-600 mt-2">No panels selected in Damage stage yet.</Text>
              ) : (
                panelReadiness.map((item) => (
                  <View key={item.panelName} className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <Text className="text-sm font-semibold text-slate-900">{item.panelName}</Text>
                    <View className="flex-row mt-2 gap-2">
                      <Pill
                        label={item.hasPreRepair ? 'Pre-Repair OK' : 'Pre-Repair Missing'}
                        variant={item.hasPreRepair ? 'post' : 'warning'}
                        size="sm"
                      />
                      <Pill
                        label={item.hasCompleteEstimate ? 'Estimate OK' : 'Estimate Pending'}
                        variant={item.hasCompleteEstimate ? 'under' : 'warning'}
                        size="sm"
                      />
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

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mt-3">
              <Text className="text-lg font-bold text-slate-900">Estimate Panels</Text>
              <Text className="text-xs text-slate-500 mt-1">Panels are auto-synced from Damage selection (same as web flow).</Text>

              {rows.length === 0 && (
                <View className="mt-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3">
                  <Text className="text-sm text-amber-800">Select panels in Damage stage to generate estimate cards.</Text>
                </View>
              )}

              {rows.map((row, index) => {
                const isRepaint = isRepaintAction(row.action)
                const rowTotal = (Number(row.ndpValue || '0') || 0) + (Number(row.paintCharges || '0') || 0) + (Number(row.labourCharges || '0') || 0)

                return (
                  <View key={row.id} className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <View className="flex-row items-center justify-between mb-2">
                      <View>
                        <Text className="text-[11px] uppercase tracking-wide text-slate-500">Panel {index + 1}</Text>
                        <Text className="text-base font-bold text-slate-900 mt-1">{row.panelName}</Text>
                      </View>
                      <Text className={`text-[11px] px-2 py-1 rounded ${isEstimateComplete(row) ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isEstimateComplete(row) ? 'Ready' : 'Pending'}
                      </Text>
                    </View>

                    <Text className="text-xs text-slate-600 mb-1">Action *</Text>
                    <NativeSelectField
                      value={canonicalizeEstimateAction(row.action)}
                      placeholder="Select action"
                      options={estimateActionOptions}
                      onChange={(value) => updateLocalRow(row.id, { action: canonicalizeEstimateAction(value) })}
                    />

                    <Text className="text-xs text-slate-600 mt-3 mb-1">Defect *</Text>
                    <NativeSelectField
                      value={row.defect}
                      placeholder="Select defect"
                      options={estimateDefectOptions}
                      onChange={(value) => updateLocalRow(row.id, { defect: value })}
                    />

                    <Text className="text-xs text-slate-600 mt-3 mb-1">Part Number {isReplaceAction(row.action) ? '*' : ''}</Text>
                    <TextInput
                      value={isRepaint ? '-' : row.partNumber}
                      editable={!isRepaint}
                      onChangeText={(value) => updateLocalRow(row.id, { partNumber: value })}
                      placeholder={isRepaint ? 'Not required for repaint' : 'Part number'}
                      className={`border rounded-xl px-3 py-3 ${isRepaint ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-300 bg-white text-slate-900'}`}
                    />

                    <View className="flex-row mt-3">
                      <View className="flex-1 mr-2">
                        <Text className="text-xs text-slate-600 mb-1">Qty *</Text>
                        <TextInput
                          value={row.qty}
                          onChangeText={(value) => updateLocalRow(row.id, { qty: value })}
                          keyboardType="number-pad"
                          className="border border-slate-300 rounded-xl px-3 py-3 bg-white text-slate-900"
                        />
                      </View>
                      <View className="flex-1 ml-2">
                        <Text className="text-xs text-slate-600 mb-1">Parts Price (Rs)</Text>
                        <TextInput
                          value={isRepaint ? '0' : row.ndpValue}
                          editable={!isRepaint}
                          onChangeText={(value) => updateLocalRow(row.id, { ndpValue: value })}
                          keyboardType="decimal-pad"
                          className={`border rounded-xl px-3 py-3 ${isRepaint ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-300 bg-white text-slate-900'}`}
                        />
                      </View>
                    </View>

                    <View className="flex-row mt-3">
                      <View className="flex-1 mr-2">
                        <Text className="text-xs text-slate-600 mb-1">Paint Price (Rs)</Text>
                        <TextInput
                          value={row.paintCharges}
                          onChangeText={(value) => updateLocalRow(row.id, { paintCharges: value })}
                          keyboardType="decimal-pad"
                          className="border border-slate-300 rounded-xl px-3 py-3 bg-white text-slate-900"
                        />
                      </View>
                      <View className="flex-1 ml-2">
                        <Text className="text-xs text-slate-600 mb-1">Labour (Rs)</Text>
                        <TextInput
                          value={row.labourCharges}
                          onChangeText={(value) => updateLocalRow(row.id, { labourCharges: value })}
                          keyboardType="decimal-pad"
                          className="border border-slate-300 rounded-xl px-3 py-3 bg-white text-slate-900"
                        />
                      </View>
                    </View>

                    <View className="mt-3 rounded-xl border border-blue-300 bg-blue-100 bg-opacity-40 px-3 py-3">
                      <Text className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Row Total</Text>
                      <Text className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(rowTotal)}</Text>
                    </View>

                    <TouchableOpacity
                      className={`mt-3 rounded-xl py-3 items-center ${savingRowId === row.id ? 'bg-blue-300' : 'bg-blue-600'}`}
                      onPress={() => saveRow(row)}
                      disabled={savingRowId === row.id}
                    >
                      <Text className="text-white text-sm font-semibold">
                        {savingRowId === row.id ? 'Saving...' : 'Save Panel Estimate'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )
              })}
            </View>

            {rows.length > 0 && (
              <View className="bg-white border border-slate-200 rounded-2xl p-4 mt-3">
                <Text className="text-xs uppercase tracking-wide text-slate-500">Estimate Summary</Text>
                <View className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <Text className="text-sm text-slate-700">Parts Total: {formatCurrency(estimateTotals.parts)}</Text>
                  <Text className="text-sm text-slate-700 mt-1">Paint Total: {formatCurrency(estimateTotals.paint)}</Text>
                  <Text className="text-sm text-slate-700 mt-1">Labour Total: {formatCurrency(estimateTotals.labour)}</Text>
                  <Text className="text-base font-bold text-slate-900 mt-2">Grand Total: {formatCurrency(grandTotal)}</Text>
                </View>

                <TouchableOpacity
                  className={`mt-3 rounded-xl py-3 items-center ${exporting ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                  disabled={exporting}
                  onPress={() => void onExportEstimate()}
                >
                  <Text className="text-white font-semibold">{exporting ? 'Exporting...' : 'Export Estimate Excel'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="mt-3 rounded-xl py-3 items-center bg-slate-800"
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
