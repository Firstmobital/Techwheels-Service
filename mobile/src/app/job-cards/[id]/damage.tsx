import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { getJobCardSummary } from '../../../lib/api/jobCards'
import { listActivePanelLabels } from '../../../lib/api/autodocRates'
import { getActiveModelRates } from '../../../lib/api/autodocRates'
import { listPanels } from '../../../lib/api/panels'
import { listPanelPhotos } from '../../../lib/api/photos'
import { syncDamagePanels } from '../../../lib/api/panels'
import { fetchVehicleByReg } from '../../../lib/api/vehicles'
import JobWorkflowHeader from '../../../components/autodoc/JobWorkflowHeader'

type Params = {
  id?: string | string[]
  jcNumber?: string | string[]
  regNumber?: string | string[]
}

type PanelDamageSummary = {
  id: string
  panelName: string
  preRepairCount: number
  underRepairCount: number
  postRepairCount: number
}

type DamageStage = 'pre-repair' | 'under-repair' | 'post-repair'

const DAMAGE_STAGES: Array<{ key: DamageStage; label: string; short: string; cardClass: string; valueClass: string }> = [
  {
    key: 'pre-repair',
    label: 'Pre-Repair',
    short: 'PRE',
    cardClass: 'border-orange-200 bg-orange-50',
    valueClass: 'text-orange-700',
  },
  {
    key: 'under-repair',
    label: 'Under-Repair',
    short: 'UNDER',
    cardClass: 'border-blue-200 bg-blue-50',
    valueClass: 'text-blue-700',
  },
  {
    key: 'post-repair',
    label: 'Post-Repair',
    short: 'POST',
    cardClass: 'border-emerald-200 bg-emerald-50',
    valueClass: 'text-emerald-700',
  },
]

const DEFAULT_BP_CITY_CATEGORY = 'A'

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }

  return result
}

export default function DamageStageScreen() {
  const router = useRouter()
  const { id, jcNumber, regNumber } = useLocalSearchParams<Params>()
  const jobCardId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id])
  const jobCardNumberHint = useMemo(() => (Array.isArray(jcNumber) ? jcNumber[0] : jcNumber), [jcNumber])
  const regNumberHint = useMemo(() => (Array.isArray(regNumber) ? regNumber[0] : regNumber), [regNumber])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panelRows, setPanelRows] = useState<PanelDamageSummary[]>([])
  const [panelOptions, setPanelOptions] = useState<string[]>([])
  const [selectedPanels, setSelectedPanels] = useState<string[]>([])
  const [activeStage, setActiveStage] = useState<DamageStage | null>(null)
  const [syncingPanels, setSyncingPanels] = useState(false)
  const [panelSourceNote, setPanelSourceNote] = useState<string>('')

  const loadDamage = async () => {
    if (!jobCardId) {
      setError('Missing job card id')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [panelRes, photoRes, panelMasterRes, jobRes] = await Promise.all([
      listPanels(jobCardId),
      listPanelPhotos(jobCardId),
      listActivePanelLabels(),
      getJobCardSummary(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
    ])

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

    const photoStageMap = new Map<string, { pre: number; under: number; post: number }>()

    for (const photo of photoRes.data ?? []) {
      const panelId = photo.panel_id
      if (!panelId) continue
      const row = photoStageMap.get(panelId) ?? { pre: 0, under: 0, post: 0 }
      const stage = String((photo as any).repair_stage ?? '').trim().toLowerCase()
      if (stage === 'pre-repair') row.pre += 1
      else if (stage === 'under-repair') row.under += 1
      else if (stage === 'post-repair') row.post += 1
      photoStageMap.set(panelId, row)
    }

    const mapped = (panelRes.data ?? []).map((panel) => {
      const counts = photoStageMap.get(panel.id) ?? { pre: 0, under: 0, post: 0 }
      return {
        id: panel.id,
        panelName: panel.panel_name ?? 'Unknown Panel',
        preRepairCount: counts.pre,
        underRepairCount: counts.under,
        postRepairCount: counts.post,
      }
    })

    const masterLabels = panelMasterRes.error || !panelMasterRes.data ? [] : panelMasterRes.data

    let effectiveOptions = uniqueNonEmpty(masterLabels)
    setPanelSourceNote('All active panel master options')

    const regFromJob = String(jobRes.data?.reg_number ?? '').trim()
    if (regFromJob) {
      const vehicleRes = await fetchVehicleByReg(regFromJob)
      const modelName = String(vehicleRes.data?.model ?? jobRes.data?.model ?? '').trim()
      const bpCityCategory = String(vehicleRes.data?.bp_city_category ?? DEFAULT_BP_CITY_CATEGORY).trim()

      if (modelName && bpCityCategory) {
        const ratesRes = await getActiveModelRates({ cityCategory: bpCityCategory, modelName })
        if (!ratesRes.error && ratesRes.data && ratesRes.data.rows.length > 0) {
          effectiveOptions = uniqueNonEmpty(ratesRes.data.rows.map((row) => row.panelLabel))
          setPanelSourceNote(`Model-wise rate card panels (${ratesRes.data.modelName} / ${bpCityCategory})`)
        }
      }
    }

    setPanelRows(mapped)
    const selectedFromDb = mapped.map((row) => row.panelName)
    const selectedFiltered = selectedFromDb.filter((name) => effectiveOptions.some((option) => option.toLowerCase() === name.toLowerCase()))

    setSelectedPanels(selectedFiltered)
    setPanelOptions(effectiveOptions)

    if (selectedFiltered.length > 0) {
      setActiveStage((prev) => prev ?? 'pre-repair')
    } else {
      setActiveStage(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadDamage()
  }, [jobCardId])

  const selectedPanelRows = useMemo(() => {
    const selectedSet = new Set(selectedPanels.map((name) => name.toLowerCase()))
    return panelRows.filter((row) => selectedSet.has(row.panelName.toLowerCase()))
  }, [panelRows, selectedPanels])

  const totals = useMemo(() => {
    return selectedPanelRows.reduce(
      (acc, panel) => {
        acc.pre += panel.preRepairCount
        acc.under += panel.underRepairCount
        acc.post += panel.postRepairCount
        return acc
      },
      { pre: 0, under: 0, post: 0 },
    )
  }, [selectedPanelRows])

  const selectedPanelsWithPreRepair = useMemo(() => {
    return selectedPanelRows.filter((panel) => panel.preRepairCount > 0).length
  }, [selectedPanelRows])

  const stageCountForPanel = (panel: PanelDamageSummary, stage: DamageStage): number => {
    if (stage === 'pre-repair') return panel.preRepairCount
    if (stage === 'under-repair') return panel.underRepairCount
    return panel.postRepairCount
  }

  const togglePanel = async (panelName: string) => {
    if (!jobCardId) return

    const next = selectedPanels.includes(panelName)
      ? selectedPanels.filter((item) => item !== panelName)
      : [...selectedPanels, panelName]

    setSelectedPanels(next)
    if (next.length === 0) setActiveStage(null)
    if (next.length > 0 && !activeStage) setActiveStage('pre-repair')

    setSyncingPanels(true)
    const syncRes = await syncDamagePanels(jobCardId, next, {
      jcNumber: jobCardNumberHint,
      regNumber: regNumberHint,
    })
    setSyncingPanels(false)

    if (syncRes.error) {
      Alert.alert('Panel Sync Failed', syncRes.error)
      await loadDamage()
      return
    }

    await loadDamage()
  }

  const goToCapture = (panel: PanelDamageSummary, stage: DamageStage) => {
    if (!jobCardId) return
    router.push({
      pathname: '/job-cards/[id]/capture-photo',
      params: {
        id: jobCardId,
        jobCardId,
        panelId: panel.id,
        panelName: panel.panelName,
        stage,
        mode: 'add',
        jcNumber: jobCardNumberHint ?? '',
        regNumber: regNumberHint ?? '',
      },
    })
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Damage Stage' }} />
      <ScrollView className="flex-1 bg-slate-100" contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <JobWorkflowHeader jobCardId={jobCardId} jcNumber={jobCardNumberHint} regNumber={regNumberHint} activeTab="damage" />

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading damage workflow...</Text>
          </View>
        ) : error ? (
          <View className="bg-white border border-red-200 rounded-2xl p-5 mt-3">
            <Text className="text-lg font-semibold text-red-700">Unable to load damage stage</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity className="mt-4 bg-blue-600 rounded-xl py-3 items-center" onPress={loadDamage}>
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <Text className="text-[11px] uppercase tracking-wide text-blue-700 font-semibold">Damage Overview</Text>
              <Text className="text-xl font-bold text-slate-900 mt-1">{selectedPanels.length} Panels Selected</Text>
              <Text className="text-xs text-slate-600 mt-1">
                Pre-repair captured for {selectedPanelsWithPreRepair} of {selectedPanels.length} selected panels.
              </Text>
              <View className="mt-3 flex-row">
                <View className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 mr-2">
                  <Text className="text-[11px] text-slate-500">Pre</Text>
                  <Text className="text-base font-semibold text-slate-900">{totals.pre}</Text>
                </View>
                <View className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 ml-2 mr-2">
                  <Text className="text-[11px] text-slate-500">Under</Text>
                  <Text className="text-base font-semibold text-slate-900">{totals.under}</Text>
                </View>
                <View className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 ml-2">
                  <Text className="text-[11px] text-slate-500">Post</Text>
                  <Text className="text-base font-semibold text-slate-900">{totals.post}</Text>
                </View>
              </View>
            </View>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mt-3">
              <View className="flex-row items-start justify-between">
                <Text className="text-base font-semibold text-slate-900">Select Affected Panels</Text>
                {syncingPanels ? <Text className="text-xs text-blue-700">Syncing...</Text> : null}
              </View>
              <Text className="text-xs text-slate-500 mt-1">Tap cards to select or deselect panels for this job card.</Text>
              <Text className="text-xs text-blue-700 mt-1">Source: {panelSourceNote}</Text>

              <View className="mt-3 flex-row flex-wrap">
                {panelOptions.map((panelName) => {
                  const active = selectedPanels.includes(panelName)
                  return (
                    <TouchableOpacity
                      key={panelName}
                      disabled={syncingPanels}
                      className={`mr-2 mb-2 rounded-xl border px-3 py-3 ${active ? 'border-blue-300 bg-blue-50' : 'border-slate-300 bg-white'}`}
                      onPress={() => { void togglePanel(panelName) }}
                    >
                      <Text className={`text-sm font-semibold ${active ? 'text-blue-700' : 'text-slate-700'}`}>{panelName}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {selectedPanels.length === 0 ? (
                <View className="mt-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-3">
                  <Text className="text-sm text-amber-800">Select at least one panel to unlock stage-wise upload cards.</Text>
                </View>
              ) : (
                <Text className="text-xs text-blue-700 mt-1">Selected: {selectedPanels.join(', ')}</Text>
              )}
            </View>

            {selectedPanels.length > 0 && activeStage ? (
              <>
                <View className="bg-white border border-slate-200 rounded-2xl p-4 mt-3">
                  <Text className="text-xs uppercase tracking-wide text-slate-500">Select Repair Stage</Text>
                  <View className="mt-3 flex-row">
                    {DAMAGE_STAGES.map((stage, index) => {
                      const active = activeStage === stage.key
                      const value = stage.key === 'pre-repair' ? totals.pre : stage.key === 'under-repair' ? totals.under : totals.post
                      const stageColorClass = stage.key === 'pre-repair' ? 'bg-orange-100 border-orange-300' : stage.key === 'under-repair' ? 'bg-blue-100 border-blue-300' : 'bg-emerald-100 border-emerald-300'
                      const stageTextClass = stage.key === 'pre-repair' ? 'text-orange-700' : stage.key === 'under-repair' ? 'text-blue-700' : 'text-emerald-700'
                      return (
                        <TouchableOpacity
                          key={stage.key}
                          className={`flex-1 rounded-xl border-2 px-3 py-3 ${active ? stageColorClass : 'border-slate-300 bg-slate-50'} ${index < DAMAGE_STAGES.length - 1 ? 'mr-2' : ''}`}
                          onPress={() => setActiveStage(stage.key)}
                        >
                          <Text className={`text-[11px] font-bold uppercase tracking-wider ${active ? stageTextClass : 'text-slate-600'}`}>{stage.label}</Text>
                          <Text className={`text-3xl font-bold mt-2 ${active ? stageTextClass : 'text-slate-800'}`}>{value}</Text>
                          <Text className={`text-xs font-semibold mt-1 ${active ? stageTextClass : 'text-slate-600'}`}>photos</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>

                <View className="bg-white border border-slate-200 rounded-2xl p-4 mt-3">
                  <Text className="text-base font-semibold text-slate-900">{DAMAGE_STAGES.find((s) => s.key === activeStage)?.label} Photo Upload</Text>
                  <Text className="text-xs text-slate-500 mt-1">Upload photos stage-wise for selected panels.</Text>

                  <View className="mt-3">
                    {selectedPanelRows.map((panel) => {
                      const count = stageCountForPanel(panel, activeStage)
                      return (
                        <View key={panel.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 mb-2">
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1 pr-2">
                              <Text className="text-sm font-semibold text-slate-900">{panel.panelName}</Text>
                              <Text className="text-xs text-slate-600 mt-1">{count} photo{count === 1 ? '' : 's'} in this stage</Text>
                            </View>
                            <View className="flex-row">
                              <TouchableOpacity
                                className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 mr-2"
                                onPress={() => goToCapture(panel, activeStage)}
                              >
                                <Text className="text-xs font-semibold text-blue-700">Upload</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                                onPress={() => {
                                  if (!jobCardId) return
                                  router.push({
                                    pathname: '/job-cards/[id]/panel-photos',
                                    params: {
                                      id: jobCardId,
                                      jobCardId,
                                      panelId: panel.id,
                                      panelName: panel.panelName,
                                      jcNumber: jobCardNumberHint ?? '',
                                      regNumber: regNumberHint ?? '',
                                    },
                                  })
                                }}
                              >
                                <Text className="text-xs font-semibold text-slate-700">View</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </View>
              </>
            ) : null}

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mt-3">
              <Text className="text-xs uppercase tracking-wide text-slate-500">Ready For Estimate</Text>
              <Text className="text-sm text-slate-700 mt-1">
                Estimate cards are auto-created from selected panels to match the web workflow.
              </Text>
              <TouchableOpacity
                className={`mt-3 rounded-xl py-4 items-center ${selectedPanels.length === 0 ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                disabled={selectedPanels.length === 0}
                onPress={() => {
                  if (!jobCardId) return
                  router.push({ pathname: '/job-cards/[id]/estimate', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })
                }}
              >
                <Text className="text-white font-semibold">Next: Estimate Stage</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </>
  )
}
