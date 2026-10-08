import { Alert, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

export type PickedWorkPhoto = { uri: string; mime: string }

async function captureOneCameraPhoto(): Promise<PickedWorkPhoto | null> {
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
    exif: false,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset?.uri) return null
  return { uri: asset.uri, mime: asset.mimeType ?? 'image/jpeg' }
}

function askTakeAnotherPhoto(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Photo added',
      'Saved for upload. Take another photo for this vehicle?',
      [
        { text: 'Done', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Take another', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

/** Multi-shot camera session (OTA-safe — uses existing expo-image-picker only). */
export async function captureMultipleWorkPhotosFromCamera(
  onPhoto: (photo: PickedWorkPhoto) => void,
): Promise<void> {
  try {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync()
    if (!camPerm.granted) {
      Alert.alert('Camera', 'Allow camera access to take work photos.')
      return
    }

    let continueSession = true
    while (continueSession) {
      const photo = await captureOneCameraPhoto()
      if (!photo) break

      onPhoto(photo)
      continueSession = await askTakeAnotherPhoto()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open camera'
    Alert.alert('Camera error', message)
  }
}

export async function pickMultipleWorkPhotosFromGallery(
  onPhotos: (photos: PickedWorkPhoto[]) => void,
): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!libPerm.granted) {
        Alert.alert('Gallery', 'Allow photo library access to pick work photos.')
        return
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 0,
    })

    if (result.canceled || !result.assets?.length) return

    const photos = result.assets
      .filter((a) => Boolean(a.uri))
      .map((a) => ({ uri: a.uri, mime: a.mimeType ?? 'image/jpeg' }))

    if (photos.length === 0) return
    onPhotos(photos)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open gallery'
    Alert.alert('Gallery error', message)
  }
}
