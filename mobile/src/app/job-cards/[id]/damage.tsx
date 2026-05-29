import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { listPanels } from '../../../lib/api/panels'
import { listPanelPhotos } from '../../../lib/api/photos'
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

export default function DamageStageScreen() {
  const router = useRouter()
  const { id, jcNumber, regNumber } = useLocalSearchParams<Params>()
  const jobCardId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id])
  const jobCardNumberHint = useMemo(() => (Array.isArray(jcNumber) ? jcNumber[0] : jcNumber), [jcNumber])
  const regNumberHint = useMemo(() => (Array.isArray(regNumber) ? regNumber[0] : regNumber), [regNumber])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panelRows, setPanelRows] = useState<PanelDamageSummary[]>([])

  const loadDamage = async () => {
    if (!jobCardId) {
      setError('Missing job card id')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [panelRes, photoRes] = await Promise.all([
      listPanels(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listPanelPhotos(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
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
    setLoading(false)
  }

  useEffect(() => {
    void loadDamage()
  }, [jobCardId])

  const totals = useMemo(() => {
    return panelRows.reduce(
      (acc, panel) => {
        acc.pre += panel.preRepairCount
        acc.under += panel.underRepairCount
        acc.post += panel.postRepairCount
        return acc
      },
      { pre: 0, under: 0, post: 0 },
    )
  }, [panelRows])

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
              <Text className="text-xs uppercase tracking-wide text-gray-500">Stage Summary</Text>
              <View className="mt-3 flex-row">
                <View className="flex-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-3 mr-2">
                  <Text className="text-[11px] font-semibold text-orange-800 uppercase">Pre-Repair</Text>
                  <Text className="text-2xl font-bold text-orange-700 mt-1">{totals.pre}</Text>
                </View>
                <View className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 mr-2">
                  <Text className="text-[11px] font-semibold text-blue-800 uppercase">Under-Repair</Text>
                  <Text className="text-2xl font-bold text-blue-700 mt-1">{totals.under}</Text>
                </View>
                <View className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                  <Text className="text-[11px] font-semibold text-emerald-800 uppercase">Post-Repair</Text>
                  <Text className="text-2xl font-bold text-emerald-700 mt-1">{totals.post}</Text>
                </View>
              </View>
            </View>

            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-gray-900">Panel-wise Damage Upload</Text>
                <TouchableOpacity
                  className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2"
                  onPress={() => {
                    if (!jobCardId) return
                    router.push({ pathname: '/job-cards/[id]/panel-selector', params: { id: jobCardId, jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })
                  }}
                >
                  <Text className="text-xs font-semibold text-blue-700">Manage Panels</Text>
                </TouchableOpacity>
              </View>

              {panelRows.length === 0 ? (
                <View className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4">
                  <Text className="text-sm text-gray-600">No panels selected yet. Add panels first to start stage-wise photo capture.</Text>
                </View>
              ) : (
                <View className="mt-3">
                  {panelRows.map((panel) => (
                    <View key={panel.id} className="rounded-lg border border-gray-200 px-3 py-3 mb-2">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-semibold text-gray-900">{panel.panelName}</Text>
                        <TouchableOpacity
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5"
                          onPress={() => {
                            if (!jobCardId) return
                            router.push({
                              pathname: '/job-cards/[id]/panel-photos',
                              params: { id: jobCardId, jobCardId, panelId: panel.id, panelName: panel.panelName, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' },
                            })
                          }}
                        >
                          <Text className="text-xs font-semibold text-gray-700">Open</Text>
                        </TouchableOpacity>
                      </View>

                      <View className="mt-2 flex-row">
                        <Text className="text-xs text-gray-600 mr-3">Pre: {panel.preRepairCount}</Text>
                        <Text className="text-xs text-gray-600 mr-3">Under: {panel.underRepairCount}</Text>
                        <Text className="text-xs text-gray-600">Post: {panel.postRepairCount}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

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
