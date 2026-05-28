import { FlatList, Image, Text, TouchableOpacity, View, Alert } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { deletePanelPhoto } from '../../lib/api'
import type { PanelPhotoRow } from '../../lib/api'

interface StagPhotoSectionProps {
  stage: 'pre-repair' | 'under-repair' | 'post-repair'
  stageLabel: string
  photos: PanelPhotoRow[]
  panelId: string | null
  jobCardId: string
  onPhotoAction: () => Promise<void>
}

export function StagePhotoSection({
  stage,
  stageLabel,
  photos,
  panelId,
  jobCardId,
  onPhotoAction,
}: StagPhotoSectionProps) {
  const handleRemovePhoto = async (photoId: string) => {
    Alert.alert('Remove Photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const result = await deletePanelPhoto(photoId)
          if (result.error) {
            Alert.alert('Error', result.error)
          } else {
            await onPhotoAction()
          }
        },
      },
    ])
  }

  return (
    <View className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Stage Header */}
      <View className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <Text className="text-sm font-semibold text-gray-700">{stageLabel}</Text>
        <Text className="text-xs text-gray-500 mt-1">
          {photos.length === 0 ? 'No photos yet' : `${photos.length} photo${photos.length > 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* Photos Grid */}
      {photos.length > 0 ? (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="border-b border-gray-200 last:border-b-0">
              <View className="flex-row items-center p-3 gap-3">
                {/* Photo Thumbnail */}
                {item.drive_url ? (
                  <Image
                    source={{ uri: item.drive_url }}
                    className="w-16 h-16 bg-gray-100 rounded-lg"
                  />
                ) : (
                  <View className="w-16 h-16 bg-gray-100 rounded-lg items-center justify-center">
                    <MaterialIcons name="image-not-supported" size={24} color="#999" />
                  </View>
                )}

                {/* Photo Info */}
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-800">
                    {item.photo_type}
                  </Text>
                  {item.gps_city && (
                    <Text className="text-xs text-gray-600 mt-1">
                      📍 {item.gps_city}
                    </Text>
                  )}
                  {item.captured_at && (
                    <Text className="text-xs text-gray-500 mt-1">
                      {new Date(item.captured_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>

                {/* Remove Button */}
                <TouchableOpacity
                  className="p-2"
                  onPress={() => handleRemovePhoto(item.id)}
                >
                  <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          scrollEnabled={false}
        />
      ) : (
        <View className="p-6 items-center justify-center">
          <MaterialIcons name="photo-camera" size={32} color="#ccc" />
          <Text className="text-sm text-gray-500 mt-2">No photos uploaded yet</Text>
        </View>
      )}

      {/* Capture Photo Button */}
      <TouchableOpacity className="bg-blue-600 px-4 py-3 items-center border-t border-gray-200">
        <View className="flex-row items-center gap-2">
          <MaterialIcons name="add-a-photo" size={18} color="white" />
          <Text className="text-white font-semibold">Capture Photo</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}
