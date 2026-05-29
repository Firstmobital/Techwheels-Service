/**
 * Mobile Panel Selector Screen
 * Allows user to select a vehicle panel to upload damage photos
 * Mobile-optimized UI - not a web port
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { createPanel, listActivePanelLabels, listPanels, listPanelPhotos, type PanelRow } from '../../../lib/api'
import { logEvent } from '../../../utils/logger'
import JobWorkflowHeader from '../../../components/autodoc/JobWorkflowHeader'

type Params = {
  id?: string | string[]
  jobCardId?: string | string[]
  jcNumber?: string | string[]
  regNumber?: string | string[]
}

interface PanelTile {
  id: string
  name: string
  photoCount: number
}

export default function PanelSelectorScreen() {
  const router = useRouter()
  const { id: rawId, jobCardId: rawJobCardId, jcNumber, regNumber } = useLocalSearchParams<Params>()

  const idFromRoute = useMemo(
    () => (Array.isArray(rawId) ? rawId[0] : rawId),
    [rawId]
  )

  const jobCardId = useMemo(() => {
    const legacyId = Array.isArray(rawJobCardId) ? rawJobCardId[0] : rawJobCardId
    return idFromRoute || legacyId
  }, [idFromRoute, rawJobCardId])
  const jobCardNumberHint = useMemo(() => (Array.isArray(jcNumber) ? jcNumber[0] : jcNumber), [jcNumber])
  const regNumberHint = useMemo(() => (Array.isArray(regNumber) ? regNumber[0] : regNumber), [regNumber])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panels, setPanels] = useState<PanelTile[]>([])
  const [masterPanelLabels, setMasterPanelLabels] = useState<string[]>([])
  const [customPanelName, setCustomPanelName] = useState('')
  const [addingPanelName, setAddingPanelName] = useState<string | null>(null)

  const loadPanels = async () => {
    if (!jobCardId) {
      setError('Missing job card ID')
      setLoading(false)
      return
    }

    try {
      setError(null)
      logEvent('panel_list_load_start', { job_card_id: jobCardId }, 'panel-selector')

      const [panelsResult, photosResult, labelsResult] = await Promise.all([
        listPanels(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
        listPanelPhotos(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
        listActivePanelLabels(),
      ])

      if (panelsResult.error) {
        setError(panelsResult.error)
        logEvent(
          'panel_list_load_failed',
          { job_card_id: jobCardId, error: panelsResult.error },
          'panel-selector'
        )
        return
      }

      if (photosResult.error) {
        setError(photosResult.error)
        logEvent(
          'panel_photos_count_load_failed',
          { job_card_id: jobCardId, error: photosResult.error },
          'panel-selector'
        )
        return
      }

      const photoCountByPanelId = new Map<string, number>()
      for (const photo of photosResult.data ?? []) {
        if (!photo.panel_id) continue
        photoCountByPanelId.set(photo.panel_id, (photoCountByPanelId.get(photo.panel_id) ?? 0) + 1)
      }

      // Convert to tile data
      const panelData = (panelsResult.data ?? []).map((p: PanelRow) => ({
        id: p.id,
        name: p.panel_name || 'Unknown Panel',
        photoCount: photoCountByPanelId.get(p.id) ?? 0,
      }))

      setPanels(panelData)
      if (!labelsResult.error && labelsResult.data) {
        setMasterPanelLabels(labelsResult.data)
      }
      logEvent(
        'panel_list_loaded',
        { job_card_id: jobCardId, count: panelData.length },
        'panel-selector'
      )
    } catch (err: any) {
      const msg = err?.message || 'Failed to load panels'
      setError(msg)
      logEvent('panel_list_error', { job_card_id: jobCardId, error: msg }, 'panel-selector')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPanels()
  }, [jobCardId])

  const handleSelectPanel = (panelId: string, panelName: string) => {
    logEvent('panel_selected', { job_card_id: jobCardId, panel_id: panelId }, 'panel-selector')
    router.push({
      pathname: '/job-cards/[id]/panel-photos',
      params: {
        id: jobCardId,
        jobCardId,
        panelId,
        panelName,
        jcNumber: jobCardNumberHint ?? '',
        regNumber: regNumberHint ?? '',
      },
    })
  }

  const handleAddPanel = async (panelNameInput: string) => {
    if (!jobCardId) return
    const panelName = panelNameInput.trim()
    if (!panelName) return

    const existing = new Set(panels.map((panel) => panel.name.trim().toLowerCase()))
    if (existing.has(panelName.toLowerCase())) {
      Alert.alert('Already Added', `${panelName} is already selected for this job card.`)
      return
    }

    setAddingPanelName(panelName)
    const createRes = await createPanel(jobCardId, panelName, { jcNumber: jobCardNumberHint, regNumber: regNumberHint })
    setAddingPanelName(null)

    if (createRes.error) {
      Alert.alert('Add Panel Failed', createRes.error)
      return
    }

    setCustomPanelName('')
    await loadPanels()
  }

  const availableToAdd = useMemo(() => {
    const existing = new Set(panels.map((panel) => panel.name.trim().toLowerCase()))
    return masterPanelLabels.filter((label) => !existing.has(label.trim().toLowerCase()))
  }, [masterPanelLabels, panels])

  const renderPanelTile = ({ item }: { item: PanelTile }) => (
    <TouchableOpacity
      className="bg-white rounded-xl border border-gray-200 p-4 mb-3"
      onPress={() => handleSelectPanel(item.id, item.name)}
      activeOpacity={0.7}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-900">{item.name}</Text>
          <Text className="text-xs text-gray-500 mt-1">
            {item.photoCount > 0 ? `${item.photoCount} photo${item.photoCount > 1 ? 's' : ''}` : 'No photos'}
          </Text>
        </View>
        <View className="bg-blue-600 rounded-full w-8 h-8 items-center justify-center">
          <Text className="text-white text-lg">›</Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Select Panel',
          headerShown: true,
        }}
      />

      <View className="flex-1 bg-gray-50">
        <View className="px-4 pt-4">
          <JobWorkflowHeader jobCardId={jobCardId} jcNumber={jobCardNumberHint} regNumber={regNumberHint} activeTab="damage" />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading panels...</Text>
          </View>
        ) : error ? (
          <View className="flex-1 p-4 items-center justify-center">
            <View className="bg-white border border-red-200 rounded-xl p-5 w-full">
              <Text className="text-lg font-semibold text-red-700">Unable to load panels</Text>
              <Text className="text-sm text-red-600 mt-2">{error}</Text>
              <TouchableOpacity
                className="mt-4 bg-blue-600 rounded-lg py-3 items-center"
                onPress={loadPanels}
              >
                <Text className="text-white font-semibold">Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : panels.length === 0 ? (
          <View className="flex-1 p-4 items-center justify-center">
            <View className="bg-white border border-gray-200 rounded-xl p-5 w-full">
              <Text className="text-lg font-semibold text-gray-900">No panels</Text>
              <Text className="text-sm text-gray-600 mt-2">
                Add panels to this job card to upload damage photos.
              </Text>

              {availableToAdd.length > 0 ? (
                <View className="mt-4">
                  <Text className="text-xs uppercase tracking-wide text-gray-500 mb-2">Quick Add Panels</Text>
                  <View className="flex-row flex-wrap">
                    {availableToAdd.slice(0, 24).map((label) => (
                      <TouchableOpacity
                        key={label}
                        className="mr-2 mb-2 rounded-full border border-blue-300 bg-blue-50 px-3 py-2"
                        onPress={() => void handleAddPanel(label)}
                        disabled={addingPanelName === label}
                      >
                        <Text className="text-xs font-semibold text-blue-700">
                          {addingPanelName === label ? 'Adding...' : label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              <View className="mt-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-3">
                <Text className="text-xs uppercase tracking-wide text-gray-500 mb-2">Custom Panel</Text>
                <TextInput
                  value={customPanelName}
                  onChangeText={setCustomPanelName}
                  placeholder="Enter panel name"
                  placeholderTextColor="#9ca3af"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                />
                <TouchableOpacity
                  className="mt-3 bg-blue-600 rounded-lg py-2.5 items-center"
                  onPress={() => void handleAddPanel(customPanelName)}
                  disabled={addingPanelName !== null}
                >
                  <Text className="text-white font-semibold">Add Panel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <FlatList
            data={panels}
            renderItem={renderPanelTile}
            keyExtractor={(item) => item.id}
            scrollEnabled={true}
            contentContainerStyle={{ padding: 16 }}
            ListHeaderComponent={
              <View>
                <Text className="text-sm uppercase tracking-wide text-gray-600 font-semibold mb-3">
                  Select a panel to upload damage photos
                </Text>

                {availableToAdd.length > 0 ? (
                  <View className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
                    <Text className="text-xs uppercase tracking-wide text-gray-500 mb-2">Add More Panels</Text>
                    <View className="flex-row flex-wrap">
                      {availableToAdd.slice(0, 18).map((label) => (
                        <TouchableOpacity
                          key={label}
                          className="mr-2 mb-2 rounded-full border border-blue-300 bg-blue-50 px-3 py-2"
                          onPress={() => void handleAddPanel(label)}
                          disabled={addingPanelName === label}
                        >
                          <Text className="text-xs font-semibold text-blue-700">
                            {addingPanelName === label ? 'Adding...' : label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            }
          />
        )}
      </View>
    </>
  )
}
