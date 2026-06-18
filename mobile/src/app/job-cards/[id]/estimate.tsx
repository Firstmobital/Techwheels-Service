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
import { getJobCardSummary, type JobCardStatus } from '../../../lib/api/jobCards'
import { listPanels } from '../../../lib/api/panels'
import { listPanelPhotos } from '../../../lib/api/photos'
import { getActiveModelRates, getAutoDocWorkflowOptions, type ModelPanelRate } from '../../../lib/api/autodocRates'
import NativeSelectField from '../../../components/common/NativeSelectField'
import { generateEstimateCsv } from '../../../lib/generators/generateEstimateCsv'
import { uploadDocumentFile } from '../../../lib/api/documents'
import { HeroBlock, Pill } from '../../../components/ui'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '../../../components/ui/Icon'

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

function isEstimateCompleteRow(row: EstimateFormRow): boolean {
  const action = canonicalizeEstimateAction(row.action)
  const defect = row.defect.trim()
  const partNumber = row.partNumber.trim()
  if (!action || !defect) return false
  if (action === 'replace' && !partNumber) return false
  return true
}

function formatCurrency(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`
}

function getStatusChipStyle(tone: 'green' | 'blue' | 'amber') {
  if (tone === 'green') {
    return {
      bg: '#e4f4ec',
      border: '#bfe6d2',
      dot: '#1c8f63',
      text: '#1c8f63',
    }
  }

  if (tone === 'blue') {
    return {
      bg: '#e9f0fd',
      border: '#cadcf8',
      dot: '#2f63cf',
      text: '#2f63cf',
    }
  }

  return {
    bg: '#fdf2e4',
    border: '#f1dcb8',
    dot: '#c9751b',
    text: '#c9751b',
  }
}

export default function JobCardEstimateScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
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
  const [jobStatus, setJobStatus] = useState<JobCardStatus>('draft')
  const [loadingModelRates, setLoadingModelRates] = useState(false)
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
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

    const mergedRows = buildRowsForPanels(panelNames, dbRows)

    setPanels(panelNames)
    setRows(mergedRows)
    setExpandedRowId((prev) => {
      const hasPrev = prev ? mergedRows.some((row) => row.id === prev) : false
      if (hasPrev) return prev

      const firstPending = mergedRows.find((row) => !isEstimateCompleteRow(row))
      return firstPending?.id ?? mergedRows[0]?.id ?? null
    })

    const panelNameById = new Map<string, string>()
    const selectedPanelIds: string[] = []
    for (const panel of panelRes.data ?? []) {
      const name = panel.panel_name?.trim()
      if (!name) continue
      selectedPanelIds.push(panel.id)
      panelNameById.set(panel.id, normalizePanelKey(name))
    }

    const preRepairPanelIds = new Set<string>()
    const preRepairSet = new Set<string>()
    for (const photo of photoRes.data ?? []) {
      const stage = String((photo as any).repair_stage ?? '').trim().toLowerCase()
      if (stage !== 'pre-repair') continue
      if (photo.panel_id) preRepairPanelIds.add(photo.panel_id)
      const panelKey = panelNameById.get(photo.panel_id)
      if (panelKey) preRepairSet.add(panelKey)
    }
    setPreRepairPanelNames(preRepairSet)

    // Stage gate: enforce pre-repair photos for all selected panels before accessing Estimate
    const hasAllPreRepairPhotos = selectedPanelIds.every((panelId) => preRepairPanelIds.has(panelId))

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
    setJobStatus((summaryRes.data?.status as JobCardStatus) ?? 'draft')

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

  const isEstimateComplete = useCallback((row: EstimateFormRow): boolean => isEstimateCompleteRow(row), [])

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
      partDescription: row.partDescription.trim() || row.panelName || undefined,
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

  const canProceedToSubmit = useMemo(() => {
    if (panels.length === 0 || panelReadiness.length === 0) return false
    return panelReadiness.every((item) => item.hasPreRepair && item.hasCompleteEstimate)
  }, [panelReadiness, panels.length])

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

  const statusLabel = useMemo(() => {
    if (jobStatus === 'completed') return 'Submitted'
    if (jobStatus === 'approved') return 'Approved'
    if (jobStatus === 'submitted') return 'Submitted'
    if (jobStatus === 'in_work') return 'In Work'
    return 'Draft'
  }, [jobStatus])

  const statusAccent = useMemo(() => {
    if (jobStatus === 'completed' || jobStatus === 'submitted') return '#1f9a6b'
    if (jobStatus === 'approved') return '#7048cf'
    if (jobStatus === 'in_work') return '#c9751b'
    return '#7d8090'
  }, [jobStatus])

  const stageLabels = ['Intake', 'Document', 'Estimate', 'Pre-Submit', 'Submit']
  const stageIndex = 2

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
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView className="flex-1 bg-amber-50" contentContainerStyle={{ paddingBottom: 28 }}>
        <SafeAreaView
          edges={['top']}
          style={{
            backgroundColor: '#ffffff',
            borderBottomWidth: 1,
            borderBottomColor: '#e7e3d9',
            paddingHorizontal: 16,
            paddingTop: Math.max(insets.top > 0 ? 8 : 18, 8),
            paddingBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <TouchableOpacity
                style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#d8d2c6', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}
                onPress={() => router.push('/(tabs)/autodoc')}
              >
                <Icon name="chevron-left" size={22} color="#4b4e59" strokeWidth={2} />
              </TouchableOpacity>
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#8b90a0', fontWeight: '700', letterSpacing: 0.12, textTransform: 'uppercase' }}>
                  {jobCardNumberHint || 'Job Card'}
                </Text>
                <Text style={{ fontSize: 20, color: '#1a1b21', fontWeight: '700' }}>Estimate</Text>
              </View>
            </View>
            <View style={{ borderWidth: 1, borderColor: '#e3ceb0', backgroundColor: '#fbefdd', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: statusAccent, marginRight: 7 }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: statusAccent }}>{statusLabel}</Text>
            </View>
          </View>
        </SafeAreaView>

        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e7e3d9', backgroundColor: '#ffffff' }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/job-cards/[id]/jobcard', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })}
              style={{ flex: 1, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', paddingVertical: 14, alignItems: 'center' }}
            >
              <Icon name="file" size={18} color="#8b90a0" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#737786' }}>Job Card</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/job-cards/[id]/damage', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })}
              style={{ flex: 1, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', paddingVertical: 14, alignItems: 'center' }}
            >
              <Icon name="grid" size={18} color="#8b90a0" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#737786' }}>Damage</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, borderRadius: 14, backgroundColor: '#2a4cd0', borderWidth: 1, borderColor: '#2a4cd0', paddingVertical: 14, alignItems: 'center' }}>
              <Icon name="file-text" size={18} color="#ffffff" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#ffffff' }}>Estimate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/job-cards/[id]/submit', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })}
              style={{ flex: 1, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', paddingVertical: 14, alignItems: 'center' }}
            >
              <Icon name="send" size={18} color="#8b90a0" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#737786' }}>Submit</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
            {stageLabels.map((label, idx) => {
              const active = idx <= stageIndex
              const current = idx === stageIndex

              return (
                <View key={label} style={{ flex: idx === stageLabels.length - 1 ? 0 : 1, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ alignItems: 'center' }}>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: active ? '#1f9a6b' : '#cfc8b8',
                        backgroundColor: current ? '#2a4cd0' : active ? '#ffffff' : '#ffffff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active && !current ? <Icon name="check" size={12} color="#1f9a6b" strokeWidth={2.6} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: current ? '#ffffff' : '#cfc8b8' }} />}
                    </View>
                    <Text style={{ marginTop: 5, fontSize: 11, fontWeight: current ? '700' : '600', color: current ? '#2a4cd0' : active ? '#1f9a6b' : '#9a9ea9' }}>{label}</Text>
                  </View>

                  {idx < stageLabels.length - 1 ? (
                    <View style={{ flex: 1, height: 2, marginHorizontal: 6, backgroundColor: idx < stageIndex ? '#1f9a6b' : '#e2ddcf' }} />
                  ) : null}
                </View>
              )
            })}
          </View>
        </View>

        {loading ? (
          <View className="items-center justify-center py-20 px-4">
            <ActivityIndicator size="large" color="#1d4ed8" />
            <Text className="text-sm text-slate-600 mt-3">Loading estimate data...</Text>
          </View>
        ) : error ? (
          <View className="bg-white border border-red-200 rounded-2xl p-5 mt-3 mx-4">
            <Text className="text-lg font-semibold text-red-700">Unable to load estimate</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity className="mt-4 bg-blue-600 rounded-xl py-3 items-center" onPress={load}>
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="px-4 pt-3">
              <View className="flex-row flex-wrap gap-2 mb-2">
                <Pill
                  label={resolvedModelName ? `Model: ${resolvedModelName}` : 'Model pending'}
                  variant={resolvedModelName ? 'post' : 'warning'}
                  size="sm"
                />
                <Pill
                  label={resolvedPaintType ? `Paint: ${resolvedPaintType}` : 'Paint pending'}
                  variant={resolvedPaintType ? 'under' : 'warning'}
                  size="sm"
                />
                <Pill
                  label={resolvedCityCategory ? `City: ${resolvedCityCategory}` : 'City pending'}
                  variant={resolvedCityCategory ? 'estimate' : 'warning'}
                  size="sm"
                />
              </View>
            </View>

            <View className="px-4">
              <HeroBlock
              title="Estimate Total"
              mainValue={formatCurrency(grandTotal)}
              subtitle={`${completedEstimatePanels.size} of ${panels.length} panels estimate-ready`}
              variant="brand"
            >
              <View className="mt-3 flex-row gap-2">
                <View style={{ flex: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#d5e3ff' }}>Parts</Text>
                  <Text style={{ fontSize: 32, fontWeight: '700', color: '#ffffff', marginTop: 2 }}>{formatCurrency(estimateTotals.parts)}</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#d5e3ff' }}>Paint + Labour</Text>
                  <Text style={{ fontSize: 32, fontWeight: '700', color: '#ffffff', marginTop: 2 }}>{formatCurrency(estimateTotals.paint + estimateTotals.labour)}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, marginTop: 8, color: '#e4ecff' }}>
                Rate Card Status:{' '}
                {!resolvedModelName || !resolvedCityCategory ? (
                  <Text style={{ color: '#d5e3ff' }}>Awaiting model/city category</Text>
                ) : loadingModelRates ? (
                  <Text style={{ color: '#d5e3ff' }}>Loading rates...</Text>
                ) : activeModelRates.length > 0 ? (
                  <Text style={{ color: '#bfe6d2', fontWeight: '700' }}>{activeModelRates.length} panel rates active</Text>
                ) : (
                  <Text style={{ color: '#e4ecff' }}>No active rates found</Text>
                )}
              </Text>
              </HeroBlock>
            </View>

            <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', padding: 14 }}>
              <Text style={{ fontSize: 11, letterSpacing: 1.2, fontWeight: '700', color: '#8b90a0', textTransform: 'uppercase' }}>Panel Readiness</Text>
              {panelReadiness.length === 0 ? (
                <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>No panels selected in Damage stage yet.</Text>
              ) : (
                panelReadiness.map((item) => (
                  <View key={item.panelName} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1a1b21', flex: 1, marginRight: 8 }}>{item.panelName}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(() => {
                        const tone = item.hasPreRepair ? 'green' : 'amber'
                        const chip = getStatusChipStyle(tone)
                        return (
                          <View style={{ borderRadius: 999, borderWidth: 1, borderColor: chip.border, backgroundColor: chip.bg, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: chip.dot, marginRight: 6 }} />
                            <Text style={{ color: chip.text, fontSize: 10, fontWeight: '700' }}>{item.hasPreRepair ? 'Pre OK' : 'Pre Missing'}</Text>
                          </View>
                        )
                      })()}
                      {(() => {
                        const tone = item.hasCompleteEstimate ? 'blue' : 'amber'
                        const chip = getStatusChipStyle(tone)
                        return (
                          <View style={{ borderRadius: 999, borderWidth: 1, borderColor: chip.border, backgroundColor: chip.bg, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: chip.dot, marginRight: 6 }} />
                            <Text style={{ color: chip.text, fontSize: 10, fontWeight: '700' }}>{item.hasCompleteEstimate ? 'Est OK' : 'Pending'}</Text>
                          </View>
                        )
                      })()}
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={{ marginHorizontal: 16, marginTop: 16 }}>
              <Text style={{ fontSize: 12, letterSpacing: 1.3, fontWeight: '700', color: '#8b90a0', textTransform: 'uppercase' }}>Estimate Panels</Text>

              {rows.length === 0 && (
                <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#f1dcb8', backgroundColor: '#fbefdd', padding: 12 }}>
                  <Text style={{ fontSize: 12, color: '#8c5a21' }}>Select panels in Damage stage to generate estimate cards.</Text>
                </View>
              )}

              {rows.map((row, index) => {
                const isRepaint = isRepaintAction(row.action)
                const rowTotal = (Number(row.ndpValue || '0') || 0) + (Number(row.paintCharges || '0') || 0) + (Number(row.labourCharges || '0') || 0)
                const isReady = isEstimateComplete(row)
                const isExpanded = expandedRowId === row.id

                return (
                  <View key={row.id} style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', overflow: 'hidden' }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setExpandedRowId((prev) => (prev === row.id ? null : row.id))}
                      style={{ paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#8b90a0', letterSpacing: 0.8, textTransform: 'uppercase' }}>Panel {index + 1}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a1b21', marginTop: 2 }}>{row.panelName}</Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {(() => {
                          const tone = isReady ? 'green' : 'amber'
                          const chip = getStatusChipStyle(tone)
                          return (
                            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: chip.border, backgroundColor: chip.bg, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', marginRight: 6 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: chip.dot, marginRight: 6 }} />
                              <Text style={{ color: chip.text, fontSize: 10, fontWeight: '700' }}>{isReady ? 'Ready' : 'Pending'}</Text>
                            </View>
                          )
                        })()}
                        <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#7d8090" strokeWidth={2} />
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={{ borderTopWidth: 1, borderTopColor: '#ece8dc', paddingHorizontal: 14, paddingVertical: 12 }}>
                        <Text style={{ fontSize: 15, color: '#3f4250', marginBottom: 6 }}>Action<Text style={{ color: '#c33b53' }}> *</Text></Text>
                        <NativeSelectField
                          value={canonicalizeEstimateAction(row.action)}
                          placeholder="Select"
                          options={estimateActionOptions}
                          onChange={(value) => updateLocalRow(row.id, { action: canonicalizeEstimateAction(value) })}
                        />

                        <Text style={{ fontSize: 15, color: '#3f4250', marginTop: 12, marginBottom: 6 }}>Defect<Text style={{ color: '#c33b53' }}> *</Text></Text>
                        <NativeSelectField
                          value={row.defect}
                          placeholder="Select"
                          options={estimateDefectOptions}
                          onChange={(value) => updateLocalRow(row.id, { defect: value })}
                        />

                        <Text style={{ fontSize: 15, color: '#3f4250', marginTop: 12, marginBottom: 6 }}>Part number</Text>
                        <TextInput
                          value={isRepaint ? '-' : row.partNumber}
                          editable={!isRepaint}
                          onChangeText={(value) => updateLocalRow(row.id, { partNumber: value })}
                          placeholder={isRepaint ? 'Not required for repaint' : '579030912R'}
                          style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: isRepaint ? '#9a9ea9' : '#1a1b21', backgroundColor: isRepaint ? '#f3f2ef' : '#ffffff' }}
                        />

                        <Text style={{ fontSize: 15, color: '#3f4250', marginTop: 12, marginBottom: 6 }}>Part description</Text>
                        <TextInput
                          value={row.partDescription}
                          onChangeText={(value) => updateLocalRow(row.id, { partDescription: value })}
                          placeholder="e.g. Rear bumper assy"
                          style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#1a1b21', backgroundColor: '#ffffff' }}
                        />

                        <View style={{ flexDirection: 'row', marginTop: 12, gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, color: '#3f4250', marginBottom: 6 }}>Qty</Text>
                            <TextInput
                              value={row.qty}
                              onChangeText={(value) => updateLocalRow(row.id, { qty: value })}
                              keyboardType="number-pad"
                              style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#1a1b21', backgroundColor: '#ffffff' }}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, color: '#3f4250', marginBottom: 6 }}>Parts price</Text>
                            <TextInput
                              value={isRepaint ? '0' : row.ndpValue}
                              editable={!isRepaint}
                              onChangeText={(value) => updateLocalRow(row.id, { ndpValue: value })}
                              keyboardType="decimal-pad"
                              style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: isRepaint ? '#9a9ea9' : '#1a1b21', backgroundColor: isRepaint ? '#f3f2ef' : '#ffffff' }}
                            />
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', marginTop: 12, gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, color: '#3f4250', marginBottom: 6 }}>Paint price</Text>
                            <TextInput
                              value={row.paintCharges}
                              onChangeText={(value) => updateLocalRow(row.id, { paintCharges: value })}
                              keyboardType="decimal-pad"
                              style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#1a1b21', backgroundColor: '#ffffff' }}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, color: '#3f4250', marginBottom: 6 }}>Labour</Text>
                            <TextInput
                              value={row.labourCharges}
                              onChangeText={(value) => updateLocalRow(row.id, { labourCharges: value })}
                              keyboardType="decimal-pad"
                              style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#1a1b21', backgroundColor: '#ffffff' }}
                            />
                          </View>
                        </View>

                        <View style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: '#97b3f4', backgroundColor: '#d9e5fb', paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#2a4cd0' }}>Row total</Text>
                          <Text style={{ fontSize: 18, fontWeight: '700', color: '#2a4cd0' }}>{formatCurrency(rowTotal)}</Text>
                        </View>

                        <TouchableOpacity
                          style={{ marginTop: 14, borderRadius: 12, backgroundColor: savingRowId === row.id ? '#90a9f5' : '#2a4cd0', paddingVertical: 14, alignItems: 'center' }}
                          onPress={() => saveRow(row)}
                          disabled={savingRowId === row.id}
                        >
                          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
                            {savingRowId === row.id ? 'Saving...' : 'Save panel estimate'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>

            {rows.length > 0 && (
              <View style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', padding: 14 }}>
                <Text style={{ fontSize: 12, letterSpacing: 1.2, fontWeight: '700', color: '#8b90a0', textTransform: 'uppercase' }}>Summary</Text>

                <View style={{ marginTop: 12, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 15, color: '#4b4e59' }}>Parts total</Text>
                    <Text style={{ fontSize: 15, color: '#1a1b21', fontWeight: '700' }}>{formatCurrency(estimateTotals.parts)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 15, color: '#4b4e59' }}>Paint total</Text>
                    <Text style={{ fontSize: 15, color: '#1a1b21', fontWeight: '700' }}>{formatCurrency(estimateTotals.paint)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 15, color: '#4b4e59' }}>Labour total</Text>
                    <Text style={{ fontSize: 15, color: '#1a1b21', fontWeight: '700' }}>{formatCurrency(estimateTotals.labour)}</Text>
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: '#ece8dc', marginVertical: 14 }} />

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 17, color: '#1a1b21', fontWeight: '700' }}>Grand total</Text>
                  <Text style={{ fontSize: 22, color: '#2a4cd0', fontWeight: '800' }}>{formatCurrency(grandTotal)}</Text>
                </View>

                <TouchableOpacity
                  style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  disabled={exporting}
                  onPress={() => void onExportEstimate()}
                >
                  <Icon name="download" size={16} color="#1a1b21" strokeWidth={2} />
                  <Text style={{ color: '#1a1b21', fontSize: 16, fontWeight: '700' }}>{exporting ? 'Exporting...' : 'Export estimate Excel'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ marginTop: 12, borderRadius: 12, backgroundColor: canProceedToSubmit ? '#2a4cd0' : '#a8b6f1', paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  disabled={!canProceedToSubmit}
                  onPress={() => {
                    if (!jobCardId) return
                    if (!canProceedToSubmit) {
                      const preview = missingEstimatePanels.slice(0, 3).map((item) => item.panelName).join(', ')
                      const suffix = missingEstimatePanels.length > 3 ? '...' : ''
                      const details = preview ? ` Missing: ${preview}${suffix}` : ''
                      Alert.alert('Estimate Incomplete', `Complete estimate rows for all selected panels before proceeding to Submit.${details}`)
                      return
                    }
                    router.push(`/job-cards/${jobCardId}/submit`)
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>Next · Submit stage</Text>
                  <Icon name="arrow-right" size={17} color="#ffffff" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  )
}
