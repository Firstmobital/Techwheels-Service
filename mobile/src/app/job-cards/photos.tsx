import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { getJobCardSummary, listPanels, listPanelPhotos, type JobCardRow, type PanelRow, type PanelPhotoRow } from '../../lib/api'
import { PanelSelector } from '../../components/autodoc/PanelSelector'
import { StagePhotoSection } from '../../components/autodoc/StagePhotoSection'

type Params = {
  id?: string | string[]
}

export default function PhotoWorkflowScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<Params>()
  const jobCardId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id])

  const [jobCard, setJobCard] = useState<JobCardRow | null>(null)
  const [panels, setPanels] = useState<PanelRow[]>([])
  const [photos, setPhotos] = useState<PanelPhotoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null)

  const loadData = async () => {
    if (!jobCardId) {
      setError('Missing job card id')
      setLoading(false)
      return
    }

    try {
      setError(null)
      const jobRes = await getJobCardSummary(jobCardId)
      if (jobRes.error) {
        setError(jobRes.error)
        setLoading(false)
        return
      }

      setJobCard(jobRes.data)

      const panelsRes = await listPanels(jobCardId)
      if (panelsRes.error) {
        setError(panelsRes.error)
        setLoading(false)
        return
      }

      setPanels(panelsRes.data ?? [])
      if ((panelsRes.data ?? []).length > 0) {
        setSelectedPanel((panelsRes.data ?? [])[0].id)
      }

      const photosRes = await listPanelPhotos(jobCardId)
      if (photosRes.error) {
        setError(photosRes.error)
        setLoading(false)
        return
      }

      setPhotos(photosRes.data ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load job card data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [jobCardId])

  const panelPhotos = useMemo(
    () => photos.filter((p) => p.panel_id === selectedPanel),
    [photos, selectedPanel]
  )

  const stagePhotoMap = useMemo(() => {
    const map: Record<string, PanelPhotoRow[]> = {
      'pre-repair': [],
      'under-repair': [],
      'post-repair': [],
    }

    panelPhotos.forEach((photo) => {
      const stage = photo.repair_stage || 'pre-repair'
      if (stage in map) {
        map[stage as keyof typeof map].push(photo)
      }
    })

    return map
  }, [panelPhotos])

  const selectedPanelData = useMemo(
    () => panels.find((p) => p.id === selectedPanel),
    [panels, selectedPanel]
  )

  return (
    <>
      <Stack.Screen options={{ title: 'Photo Workflow' }} />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingBottom: 20 }}>
        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading photos...</Text>
          </View>
        ) : error ? (
          <View className="m-4 bg-white border border-red-200 rounded-xl p-5">
            <Text className="text-lg font-semibold text-red-700">Unable to load photos</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity
              className="mt-4 bg-blue-600 rounded-lg py-3 items-center"
              onPress={loadData}
            >
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Job Card Header */}
            <View className="bg-white border-b border-gray-200 px-4 pt-4 pb-3">
              <Text className="text-sm text-gray-600">Job Card</Text>
              <Text className="text-2xl font-bold text-gray-800 mt-1">{jobCard?.jc_number ?? '-'}</Text>
            </View>

            {/* Panel Selector */}
            <View className="px-4 pt-4">
              <PanelSelector
                panels={panels}
                selectedPanelId={selectedPanel}
                onSelectPanel={setSelectedPanel}
              />
            </View>

            {/* Stage-wise Photo Sections */}
            {selectedPanelData && (
              <View className="px-4 pt-4 gap-4">
                <Text className="text-lg font-semibold text-gray-800">
                  Panel: {selectedPanelData.name}
                </Text>

                <StagePhotoSection
                  stage="pre-repair"
                  stageLabel="Pre-Repair Damage"
                  photos={stagePhotoMap['pre-repair']}
                  panelId={selectedPanel}
                  jobCardId={jobCardId}
                  onPhotoAction={loadData}
                />

                <StagePhotoSection
                  stage="under-repair"
                  stageLabel="Under-Repair Progress"
                  photos={stagePhotoMap['under-repair']}
                  panelId={selectedPanel}
                  jobCardId={jobCardId}
                  onPhotoAction={loadData}
                />

                <StagePhotoSection
                  stage="post-repair"
                  stageLabel="Post-Repair Completion"
                  photos={stagePhotoMap['post-repair']}
                  panelId={selectedPanel}
                  jobCardId={jobCardId}
                  onPhotoAction={loadData}
                />
              </View>
            )}

            {/* Back Button */}
            <TouchableOpacity className="mt-8 py-3 items-center" onPress={() => router.back()}>
              <Text className="text-blue-600 font-semibold">Back to Job Card</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </>
  )
}
