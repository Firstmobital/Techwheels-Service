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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { getJobCardSummary, type JobCardStatus } from '../../../lib/api/jobCards'
import { listActivePanelLabels } from '../../../lib/api/autodocRates'
import { getActiveModelRates } from '../../../lib/api/autodocRates'
import { listPanels } from '../../../lib/api/panels'
import { listPanelPhotos } from '../../../lib/api/photos'
import { syncDamagePanels } from '../../../lib/api/panels'
import { fetchVehicleByReg } from '../../../lib/api/vehicles'
import { Icon } from '../../../components/ui/Icon'

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

const DAMAGE_STAGES: Array<{ key: DamageStage; label: string }> = [
  {
    key: 'pre-repair',
    label: 'Pre-Repair',
  },
  {
    key: 'under-repair',
    label: 'Under-Repair',
  },
  {
    key: 'post-repair',
    label: 'Post-Repair',
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
  const insets = useSafeAreaInsets()
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
  const [jobStatus, setJobStatus] = useState<JobCardStatus>('draft')

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

  const panelPhotoCountByName = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of panelRows) {
      const total = row.preRepairCount + row.underRepairCount + row.postRepairCount
      map.set(row.panelName.toLowerCase(), total)
    }
    return map
  }, [panelRows])

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
  const stageIndex = 1

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
      <ScrollView style={{ flex: 1, backgroundColor: '#f6f4ee' }} contentContainerStyle={{ paddingBottom: 28 }}>
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
                onPress={() => router.back()}
              >
                <Icon name="chevron-left" size={22} color="#4b4e59" strokeWidth={2} />
              </TouchableOpacity>
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#8b90a0', fontWeight: '700', letterSpacing: 0.12, textTransform: 'uppercase' }}>
                  {jobCardNumberHint || 'Job Card'}
                </Text>
                <Text style={{ fontSize: 18, color: '#1a1b21', fontWeight: '700' }}>Damage Documentation</Text>
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
            <TouchableOpacity style={{ flex: 1, borderRadius: 14, backgroundColor: '#2a4cd0', borderWidth: 1, borderColor: '#2a4cd0', paddingVertical: 14, alignItems: 'center' }}>
              <Icon name="grid" size={18} color="#ffffff" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#ffffff' }}>Damage</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/job-cards/[id]/estimate', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })}
              style={{ flex: 1, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', paddingVertical: 14, alignItems: 'center' }}
            >
              <Icon name="file-text" size={18} color="#8b90a0" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#737786' }}>Estimate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/job-cards/[id]/submit', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })}
              style={{ flex: 1, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', paddingVertical: 14, alignItems: 'center' }}
            >
              <Icon name="send" size={18} color="#8b90a0" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#737786' }}>Submit</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
            {stageLabels.map((label, index) => {
              const isDone = index < stageIndex
              const isCurrent = index === stageIndex
              return (
                <View key={label} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: isDone ? '#1f9a6b' : isCurrent ? '#2f63cf' : '#ffffff',
                        borderWidth: isDone || isCurrent ? 0 : 2,
                        borderColor: '#d8d2c6',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      {isDone ? <Text style={{ color: '#ffffff', fontWeight: '700' }}>✓</Text> : isCurrent ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#ffffff' }} /> : null}
                    </View>
                    {index < stageLabels.length - 1 ? <View style={{ height: 3, flex: 1, backgroundColor: isDone ? '#1f9a6b' : '#d8d2c6', marginHorizontal: 6, borderRadius: 2 }} /> : null}
                  </View>
                  <Text style={{ marginTop: 8, fontSize: 12, fontWeight: isCurrent ? '700' : '600', color: isDone ? '#1f9a6b' : isCurrent ? '#2f63cf' : '#a7a99f' }}>{label}</Text>
                </View>
              )
            })}
          </View>
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 12 }}>Loading damage workflow...</Text>
          </View>
        ) : error ? (
          <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#fecaca', borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#b91c1c' }}>Unable to load damage stage</Text>
            <Text style={{ fontSize: 14, color: '#dc2626', marginTop: 4 }}>{error}</Text>
            <TouchableOpacity style={{ marginTop: 12, backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={loadDamage}>
              <Text style={{ color: '#ffffff', fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 24, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 40, fontWeight: '700', color: '#1a1b21' }}>Affected panels</Text>
                <View style={{ borderWidth: 1, borderColor: '#9fb9f2', backgroundColor: '#dbe7fb', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#2a4cd0' }}>{selectedPanels.length} selected</Text>
                </View>
              </View>

              <Text style={{ fontSize: 13, color: '#7d8090', marginTop: 6 }}>{panelSourceNote.replace('Model-wise rate card panels ', 'From the model rate card · ')}</Text>

              <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
                        paddingHorizontal: 16,
                        paddingVertical: 11,
                        opacity: syncingPanels ? 0.65 : 1,
                      }}
                    >
                      {active ? <Icon name="check" size={14} color="#ffffff" strokeWidth={3} /> : null}
                      <Text style={{ marginLeft: active ? 7 : 0, fontSize: 18, fontWeight: '700', color: active ? '#ffffff' : '#4b4e59' }}>{panelName}</Text>
                      {active && photoCount > 0 ? (
                        <View style={{ marginLeft: 8, borderRadius: 8, backgroundColor: '#5b7de0', paddingHorizontal: 7, paddingVertical: 1 }}>
                          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>{photoCount}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  )
                })}
              </View>

              {selectedPanels.length === 0 ? (
                <View style={{ marginTop: 12, borderRadius: 11, backgroundColor: '#fbefdd', borderWidth: 1, borderColor: '#f1dcb8', paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="alert-circle" size={15} color="#c9751b" strokeWidth={2} />
                  <Text style={{ fontSize: 12, color: '#c9751b', fontWeight: '600', flex: 1 }}>Select at least one panel to unlock stage-wise photo upload.</Text>
                </View>
              ) : null}
            </View>

            {selectedPanels.length > 0 && activeStage ? (
              <>
                <View style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 24, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', padding: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#7d8090', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>Repair Stage</Text>
                  <View style={{ flexDirection: 'row', gap: 9 }}>
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
                            borderRadius: 13,
                            borderWidth: 1.5,
                            borderColor: active ? accent : '#e7e3d9',
                            backgroundColor: active
                              ? stage.key === 'pre-repair'
                                ? '#fbefdd'
                                : stage.key === 'under-repair'
                                  ? '#e9f0fd'
                                  : '#e4f4ec'
                              : '#ffffff',
                            paddingHorizontal: 14,
                            paddingVertical: 13,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '800', color: accent, lineHeight: 16, textTransform: 'uppercase' }}>{stage.label}</Text>
                          <Text style={{ fontSize: 42, fontWeight: '700', color: active ? accent : '#1a1b21', marginTop: 6 }}>{value}</Text>
                          <Text style={{ fontSize: 14, color: '#7d8090', fontWeight: '600', marginTop: 1 }}>photos</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>

                <View style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 24, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', padding: 16 }}>
                  <Text style={{ fontSize: 42, fontWeight: '700', color: '#1a1b21', marginBottom: 12 }}>{DAMAGE_STAGES.find((s) => s.key === activeStage)?.label} uploads</Text>

                  <View style={{ gap: 10 }}>
                    {selectedPanelRows.map((panel) => {
                      const count = stageCountForPanel(panel, activeStage)
                      const done = count > 0

                      return (
                        <View key={panel.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e7e3d9', backgroundColor: '#fbfaf6', paddingHorizontal: 12, paddingVertical: 12 }}>
                          <View style={{ width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#e4f4ec' : '#f1efea' }}>
                            <Icon name={done ? 'check' : 'camera'} size={19} color={done ? '#1c8f63' : '#8b90a0'} strokeWidth={done ? 2.5 : 2} />
                          </View>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1a1b21' }}>{panel.panelName}</Text>
                            <Text style={{ fontSize: 13, color: '#7d8090', marginTop: 1 }}>{count} photo{count === 1 ? '' : 's'}</Text>
                          </View>

                          <TouchableOpacity
                            onPress={() => goToCapture(panel, activeStage)}
                            style={{ borderRadius: 12, borderWidth: 1, borderColor: '#a8c2f2', backgroundColor: '#d5e1f8', paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                          >
                            <Icon name="plus" size={16} color="#2a4cd0" strokeWidth={2.5} />
                            <Text style={{ fontSize: 17, fontWeight: '700', color: '#2a4cd0' }}>Add</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => goToPanelPhotos(panel)}
                            style={{ borderRadius: 12, borderWidth: 1, borderColor: '#d8d2c6', backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Icon name="eye" size={16} color="#1a1b21" strokeWidth={2} />
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
                style={{ borderRadius: 16, backgroundColor: selectedPanels.length === 0 ? '#a8b6f1' : '#2a4cd0', paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 9 }}
                disabled={selectedPanels.length === 0}
                onPress={() => {
                  if (!jobCardId) return
                  router.push({ pathname: '/job-cards/[id]/estimate', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 19, fontWeight: '700' }}>Next · Estimate stage</Text>
                <Icon name="arrow-right" size={19} color="#ffffff" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </>
  )
}
