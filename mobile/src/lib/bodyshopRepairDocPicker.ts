import { Alert, Platform } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

export type PickedBodyshopFile = {
  uri: string
  fileName: string
  contentType: string | null
  fileSizeBytes: number | null
}

export function pickBodyshopRepairDocument(): Promise<PickedBodyshopFile | null> {
  return new Promise((resolve) => {
    Alert.alert(
      'Upload document',
      'Photo or PDF (same as web Bodyshop Repair)',
      [
        {
          text: 'Take photo',
          onPress: () => {
            void (async () => {
              const perm = await ImagePicker.requestCameraPermissionsAsync()
              if (!perm.granted) {
                resolve(null)
                return
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.85,
              })
              if (result.canceled || !result.assets?.[0]?.uri) {
                resolve(null)
                return
              }
              const asset = result.assets[0]
              resolve({
                uri: asset.uri,
                fileName: asset.fileName ?? `survey_${Date.now()}.jpg`,
                contentType: asset.mimeType ?? 'image/jpeg',
                fileSizeBytes: asset.fileSize ?? null,
              })
            })()
          },
        },
        {
          text: 'Photo library',
          onPress: () => {
            void (async () => {
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
              if (!perm.granted) {
                resolve(null)
                return
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.85,
              })
              if (result.canceled || !result.assets?.[0]?.uri) {
                resolve(null)
                return
              }
              const asset = result.assets[0]
              resolve({
                uri: asset.uri,
                fileName: asset.fileName ?? `survey_${Date.now()}.jpg`,
                contentType: asset.mimeType ?? 'image/jpeg',
                fileSizeBytes: asset.fileSize ?? null,
              })
            })()
          },
        },
        {
          text: 'PDF / file',
          onPress: () => {
            void (async () => {
              const result = await DocumentPicker.getDocumentAsync({
                type: Platform.OS === 'ios' ? ['com.adobe.pdf', 'public.image', 'public.pdf'] : ['application/pdf', 'image/*'],
                copyToCacheDirectory: true,
              })
              if (result.canceled || !result.assets?.[0]?.uri) {
                resolve(null)
                return
              }
              const asset = result.assets[0]
              resolve({
                uri: asset.uri,
                fileName: asset.name ?? `survey_${Date.now()}.pdf`,
                contentType: asset.mimeType ?? 'application/pdf',
                fileSizeBytes: asset.size ?? null,
              })
            })()
          },
        },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    )
  })
}
