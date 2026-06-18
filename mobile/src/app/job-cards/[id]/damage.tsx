import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { getJobCardSummary, type JobCardStatus } from '../../../lib/api/jobCards'
import { listActivePanelLabels } from '../../../lib/api/autodocRates'
import { getActiveModelRates } from '../../../lib/api/autodocRates'
import { listPanels } from '../../../lib/api/panels'
import { listPanelPhotos } from '../../../lib/api/photos'
import { syncDamagePanels } from '../../../lib/api/panels'
import { fetchVehicleByReg } from '../../../lib/api/vehicles'
import { Icon, PrimaryButton, StatusPill } from '../../../components/ui'
import { ScreenHeader } from '../../../components/autodoc/ScreenHeader'
import { WorkflowTabs, type WorkflowTabKey } from '../../../components/autodoc/WorkflowTabs'
import { WorkflowProgress } from '../../../components/autodoc/WorkflowProgress'

type Params = {
  id?: string | string[]
  jcNumber?: string | string[]
  regNumber?: string | string[]
  stage?: string | string[]
}

type PanelDamageSummary = {
  id: string
  panelName: string
  preRepairCount: number
  underRepairCount: number
  postRepairCount: number
}

type DamageStage = 'pre-repair' | 'under-repair' | 'post-repair'

const DAMAGE_STAGES: Array<{ key: DamageStage; label: string }> = [
  {
    key: 'pre-repair',
    label: 'Pre',
  },
  {
    key: 'under-repair',
    label: 'Under',
  },
  {
    key: 'post-repair',
    label: 'Post',
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
  const { id, jcNumber, regNumber, stage } = useLocalSearchParams<Params>()
  const jobCardId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id])
  const jobCardNumberHint = useMemo(() => (Array.isArray(jcNumber) ? jcNumber[0] : jcNumber), [jcNumber])
  const regNumberHint = useMemo(() => (Array.isArray(regNumber) ? regNumber[0] : regNumber), [regNumber])
  const preferredStage = useMemo<DamageStage | null>(() => {
    const raw = Array.isArray(stage) ? stage[0] : stage
    const value = String(raw ?? '').trim().toLowerCase()
    if (value === 'under-repair') return 'under-repair'
    if (value === 'post-repair') return 'post-repair'
    if (value === 'pre-repair') return 'pre-repair'
    return null
  }, [stage])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panelRows, setPanelRows] = useState<PanelDamageSummary[]>([])
  const [panelOptions, setPanelOptions] = useState<string[]>([])
  const [selectedPanels, setSelectedPanels] = useState<string[]>([])
  const [activeStage, setActiveStage] = useState<DamageStage | null>(null)
  const [syncingPanels, setSyncingPanels] = useState(false)
  const [panelSourceNote, setPanelSourceNote] = useState<string>('')
  const [jobStatus, setJobStatus] = useState<JobCardStatus>('draft')

  const loadDamage = useCallback(async () => {
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
    setJobStatus((jobRes.data?.status as JobCardStatus) ?? 'draft')
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
      if (preferredStage) {
        setActiveStage(preferredStage)
      } else {
        setActiveStage((prev) => prev ?? 'pre-repair')
      }
    } else {
      setActiveStage(null)
    }

    setLoading(false)
  }, [jobCardId, jobCardNumberHint, preferredStage, regNumberHint])

  useEffect(() => {
    void loadDamage()
  }, [jobCardId])

  useFocusEffect(
    useCallback(() => {
        void loadDamage()
        return undefined
      }, [loadDamage])
  )

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

  const missingPreRepairPanels = useMemo(
    () => selectedPanelRows.filter((panel) => panel.preRepairCount === 0).map((panel) => panel.panelName),
    [selectedPanelRows],
  )

  const allSelectedPanelsHavePreRepair = useMemo(
    () => selectedPanelRows.length > 0 && missingPreRepairPanels.length === 0,
    [missingPreRepairPanels.length, selectedPanelRows.length],
  )

  const panelPhotoCountByName = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of panelRows) {
      const total = row.preRepairCount + row.underRepairCount + row.postRepairCount
      map.set(row.panelName.toLowerCase(), total)
    }
    return map
  }, [panelRows])

  const stageLabels = ['Intake', 'Document', 'Estimate', 'Pre-Submit', 'Submit']
  const stageIndex = 1

  const onWorkflowTabPress = (tab: WorkflowTabKey) => {
    if (!jobCardId) return

    const params = {
      id: jobCardId,
      jcNumber: jobCardNumberHint ?? '',
      regNumber: regNumberHint ?? '',
    }

    if (tab === 'jobcard') {
      router.push({ pathname: '/job-cards/[id]/jobcard', params })
      return
    }
    if (tab === 'damage') return
    if (tab === 'estimate') {
      router.push({ pathname: '/job-cards/[id]/estimate', params })
      return
    }
    router.push({ pathname: '/job-cards/[id]/submit', params })
  }

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

  const goToPanelPhotos = (panel: PanelDamageSummary) => {
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
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1, backgroundColor: '#f4f2ec' }} contentContainerStyle={{ paddingBottom: 28 }}>
        <ScreenHeader
          title="Damage Documentation"
          eyebrow={jobCardNumberHint || 'Job Card'}
          onBack={() => router.push('/(tabs)/autodoc')}
          rightNode={<StatusPill status={jobStatus} />}
        />

        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e7e3d9', backgroundColor: '#ffffff' }}>
          <WorkflowTabs activeTab="damage" onTabPress={onWorkflowTabPress} disabled={!jobCardId} />
          <WorkflowProgress currentStep={stageIndex + 1} totalSteps={5} stageName={stageLabels[stageIndex]} />
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
            <ActivityIndicator size="large" color="#2a4cd0" />
            <Text style={{ fontSize: 13, color: '#4b4e59', marginTop: 10 }}>Loading damage workflow...</Text>
          </View>
        ) : error ? (
          <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3cdd4', borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#c33b53' }}>Unable to load damage stage</Text>
            <Text style={{ fontSize: 13, color: '#c33b53', marginTop: 4 }}>{error}</Text>
            <View style={{ marginTop: 12 }}>
              <PrimaryButton title="Retry" onPress={loadDamage} />
            </View>
          </View>
        ) : (
          <>
            <View style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', color: '#1a1b21', flexShrink: 1 }}>Affected panels</Text>
                <View style={{ borderWidth: 1, borderColor: '#9fb9f2', backgroundColor: '#dbe7fb', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, flexShrink: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#2a4cd0' }}>{selectedPanels.length} selected</Text>
                </View>
              </View>

              <Text style={{ fontSize: 12, color: '#7d8090', marginTop: 4 }}>{panelSourceNote.replace('Model-wise rate card panels ', 'From the model rate card · ')}</Text>

              <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {panelOptions.map((panelName) => {
                  const active = selectedPanels.includes(panelName)
                  const photoCount = panelPhotoCountByName.get(panelName.toLowerCase()) ?? 0

                  return (
                    <TouchableOpacity
                      key={panelName}
                      onPress={() => { void togglePanel(panelName) }}
                      disabled={syncingPanels}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? '#2a4cd0' : '#d8d2c6',
                        backgroundColor: active ? '#2a4cd0' : '#ffffff',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        opacity: syncingPanels ? 0.65 : 1,
                      }}
                    >
                      {active ? <Icon name="check" size={11} color="#ffffff" strokeWidth={2.5} /> : null}
                      <Text style={{ marginLeft: active ? 5 : 0, fontSize: 12, fontWeight: '600', color: active ? '#ffffff' : '#4b4e59' }}>{panelName}</Text>
                      {active && photoCount > 0 ? (
                        <View style={{ marginLeft: 5, borderRadius: 6, backgroundColor: '#5b7de0', paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '600' }}>{photoCount}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  )
                })}
              </View>

              {selectedPanels.length === 0 ? (
                <View style={{ marginTop: 10, borderRadius: 10, backgroundColor: '#fbefdd', borderWidth: 1, borderColor: '#f1dcb8', paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="alert-circle" size={14} color="#c9751b" strokeWidth={2} />
                  <Text style={{ fontSize: 11, color: '#c9751b', fontWeight: '600', flex: 1 }}>Select at least one panel to unlock stage-wise photo upload.</Text>
                </View>
              ) : null}
            </View>

            {selectedPanels.length > 0 && activeStage ? (
              <>
                <View style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', padding: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#7d8090', textTransform: 'uppercase', marginBottom: 10 }}>Repair Stage</Text>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {DAMAGE_STAGES.map((stage) => {
                      const active = activeStage === stage.key
                      const value = stage.key === 'pre-repair' ? totals.pre : stage.key === 'under-repair' ? totals.under : totals.post

                      const accent = stage.key === 'pre-repair' ? '#c9751b' : stage.key === 'under-repair' ? '#2f63cf' : '#1c8f63'
                      return (
                        <TouchableOpacity
                          key={stage.key}
                          onPress={() => setActiveStage(stage.key)}
                          style={{
                            flex: 1,
                            borderRadius: 12,
                            borderWidth: 1.5,
                            borderColor: active ? accent : '#e7e3d9',
                            backgroundColor: active
                              ? stage.key === 'pre-repair'
                                ? '#fbefdd'
                                : stage.key === 'under-repair'
                                  ? '#e9f0fd'
                                  : '#e4f4ec'
                              : '#ffffff',
                            paddingHorizontal: 12,
                            paddingVertical: 11,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '600', color: accent, lineHeight: 16, textTransform: 'uppercase' }}>{stage.label}</Text>
                          <Text style={{ fontSize: 28, fontWeight: '700', color: active ? accent : '#1a1b21', marginTop: 4 }}>{value}</Text>
                          <Text style={{ fontSize: 12, color: '#7d8090', fontWeight: '600', marginTop: 0.5 }}>photos</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>

                <View style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 24, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', padding: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a1b21', marginBottom: 12 }}>{DAMAGE_STAGES.find((s) => s.key === activeStage)?.label} uploads</Text>

                  <View style={{ gap: 8 }}>
                    {selectedPanelRows.map((panel) => {
                      const count = stageCountForPanel(panel, activeStage)
                      const done = count > 0

                      return (
                        <View key={panel.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e7e3d9', backgroundColor: '#fbfaf6', paddingHorizontal: 12, paddingVertical: 12 }}>
                          <View style={{ width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#e4f4ec' : '#f1efea' }}>
                            <Icon name={done ? 'check' : 'camera'} size={18} color={done ? '#1c8f63' : '#8b90a0'} strokeWidth={done ? 2.5 : 2} />
                          </View>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1a1b21' }}>{panel.panelName}</Text>
                            <Text style={{ fontSize: 12, color: '#7d8090', marginTop: 0.5 }}>{count} photo{count === 1 ? '' : 's'}</Text>
                          </View>

                          <TouchableOpacity
                            onPress={() => goToCapture(panel, activeStage)}
                            style={{ borderRadius: 10, borderWidth: 1, borderColor: '#a8c2f2', backgroundColor: '#d5e1f8', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                          >
                            <Icon name="plus" size={15} color="#2a4cd0" strokeWidth={2.5} />
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#2a4cd0' }}>Add</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => goToPanelPhotos(panel)}
                            style={{ borderRadius: 10, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Icon name="eye" size={15} color="#1a1b21" strokeWidth={2} />
                          </TouchableOpacity>
                        </View>
                      )
                    })}
                  </View>
                </View>
              </>
            ) : null}

            <View style={{ marginHorizontal: 16, marginTop: 14 }}>
              <TouchableOpacity
                style={{ borderRadius: 12, backgroundColor: selectedPanels.length === 0 || !allSelectedPanelsHavePreRepair ? '#a8b6f1' : '#2a4cd0', paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 7 }}
                disabled={selectedPanels.length === 0 || !allSelectedPanelsHavePreRepair}
                onPress={() => {
                  if (!jobCardId) return
                  
                  // Enforce stage transition: cannot proceed to Estimate without completing pre-repair photos for all selected panels
                  if (selectedPanels.length === 0) {
                    Alert.alert('Select Panels', 'Select at least one panel before proceeding to Estimate.')
                    return
                  }
                  
                  if (!allSelectedPanelsHavePreRepair) {
                    const preview = missingPreRepairPanels.slice(0, 3).join(', ')
                    const suffix = missingPreRepairPanels.length > 3 ? '...' : ''
                    const details = preview ? ` Missing: ${preview}${suffix}` : ''
                    Alert.alert('Pre-Repair Photos Required', `All selected panels must have at least one pre-repair photo before proceeding to Estimate.${details}`)
                    return
                  }
                  
                  router.push({ pathname: '/job-cards/[id]/estimate', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>Next · Estimate stage</Text>
                <Icon name="arrow-right" size={18} color="#ffffff" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </>
  )
}
