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
import { listActivePanelLabels } from '../../../lib/api/autodocRates'
import { listPanels } from '../../../lib/api/panels'
import { listPanelPhotos } from '../../../lib/api/photos'
import { syncDamagePanels } from '../../../lib/api/panels'
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

  const loadDamage = async () => {
    if (!jobCardId) {
      setError('Missing job card id')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [panelRes, photoRes, panelMasterRes] = await Promise.all([
      listPanels(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listPanelPhotos(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listActivePanelLabels(),
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

    setPanelRows(mapped)
    const selected = mapped.map((row) => row.panelName)
    setSelectedPanels(selected)

    const masterLabels = panelMasterRes.error || !panelMasterRes.data ? [] : panelMasterRes.data
    setPanelOptions(uniqueNonEmpty([...masterLabels, ...selected]))

    if (selected.length > 0) {
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
    const syncRes = await syncDamagePanels(jobCardId, next)
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
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <JobWorkflowHeader jobCardId={jobCardId} jcNumber={jobCardNumberHint} regNumber={regNumberHint} activeTab="damage" />

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading damage workflow...</Text>
          </View>
        ) : error ? (
          <View className="bg-white border border-red-200 rounded-xl p-5">
            <Text className="text-lg font-semibold text-red-700">Unable to load damage stage</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity className="mt-4 bg-blue-600 rounded-lg py-3 items-center" onPress={loadDamage}>
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <View className="flex-row items-start justify-between">
                <Text className="text-base font-semibold text-gray-900">Select Affected Panels</Text>
                {syncingPanels ? <Text className="text-xs text-blue-700">Syncing...</Text> : null}
              </View>
              <Text className="text-xs text-gray-500 mt-1">Tap to select or deselect panel cards for this job card.</Text>

              <View className="mt-3 flex-row flex-wrap">
                {panelOptions.map((panelName) => {
                  const active = selectedPanels.includes(panelName)
                  return (
                    <TouchableOpacity
                      key={panelName}
                      disabled={syncingPanels}
                      className={`mr-2 mb-2 rounded-lg border px-3 py-3 ${active ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-white'}`}
                      onPress={() => { void togglePanel(panelName) }}
                    >
                      <Text className={`text-sm font-semibold ${active ? 'text-blue-700' : 'text-gray-700'}`}>{panelName}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {selectedPanels.length === 0 ? (
                <View className="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-3">
                  <Text className="text-sm text-amber-800">Select at least one panel to unlock stage-wise upload cards.</Text>
                </View>
              ) : (
                <Text className="text-xs text-blue-700 mt-1">Selected: {selectedPanels.join(', ')}</Text>
              )}
            </View>

            {selectedPanels.length > 0 && activeStage ? (
              <>
                <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                  <Text className="text-xs uppercase tracking-wide text-gray-500">Select Repair Stage</Text>
                  <View className="mt-3 flex-row">
                    {DAMAGE_STAGES.map((stage, index) => {
                      const active = activeStage === stage.key
                      const value = stage.key === 'pre-repair' ? totals.pre : stage.key === 'under-repair' ? totals.under : totals.post
                      return (
                        <TouchableOpacity
                          key={stage.key}
                          className={`flex-1 rounded-lg border px-3 py-3 ${stage.cardClass} ${active ? 'ring-2 ring-blue-500' : ''} ${index < DAMAGE_STAGES.length - 1 ? 'mr-2' : ''}`}
                          onPress={() => setActiveStage(stage.key)}
                        >
                          <Text className={`text-[11px] font-semibold uppercase ${stage.valueClass}`}>{stage.label}</Text>
                          <Text className={`text-2xl font-bold mt-1 ${stage.valueClass}`}>{value}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>

                <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                  <Text className="text-base font-semibold text-gray-900">{DAMAGE_STAGES.find((s) => s.key === activeStage)?.label} Photo Upload</Text>
                  <Text className="text-xs text-gray-500 mt-1">Upload photos stage-wise for selected panels.</Text>

                  <View className="mt-3">
                    {selectedPanelRows.map((panel) => {
                      const count = stageCountForPanel(panel, activeStage)
                      return (
                        <View key={panel.id} className="rounded-lg border border-gray-200 px-3 py-3 mb-2">
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1 pr-2">
                              <Text className="text-sm font-semibold text-gray-900">{panel.panelName}</Text>
                              <Text className="text-xs text-gray-600 mt-1">{count} photo{count === 1 ? '' : 's'} in this stage</Text>
                            </View>
                            <View className="flex-row">
                              <TouchableOpacity
                                className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 mr-2"
                                onPress={() => goToCapture(panel, activeStage)}
                              >
                                <Text className="text-xs font-semibold text-blue-700">Upload</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                className="rounded-md border border-gray-300 bg-white px-3 py-2"
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
                                <Text className="text-xs font-semibold text-gray-700">View</Text>
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

            <TouchableOpacity
              className="rounded-lg py-4 items-center bg-indigo-600"
              onPress={() => {
                if (!jobCardId) return
                router.push({ pathname: '/job-cards/[id]/estimate', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })
              }}
            >
              <Text className="text-white font-semibold">Next: Estimate Stage</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </>
  )
}
