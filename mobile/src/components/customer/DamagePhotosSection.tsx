import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Text, TouchableOpacity, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useFocusEffect } from 'expo-router'
import { CustomerCard } from './customerUi'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { DAMAGE_PHOTO_SLOTS, matchPhotoToSlot } from '../../lib/customer/bodyshopDamagePhotos'
import { uploadDamagePhoto } from '../../lib/customer/documentUploadFlow'
import type { CustomerBodyshopAsset } from '../../lib/api/customerBodyshopUploads'
import { fetchCustomerDocuments } from '../../lib/customer/customerDocumentsCache'
import { Icon } from '../ui/Icon'
import { useCustomerScreenRefresh } from './customerScreenRefresh'

type SlotView = {
  slotId: string
  viewUrl?: string | null
  uploading?: boolean
}

export function DamagePhotosSection({
  sessionToken,
  regNumber,
}: {
  sessionToken: string | null
  regNumber?: string | null
}) {
  const [slots, setSlots] = useState<Record<string, SlotView>>({})
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const applyPhotos = useCallback((photos: CustomerBodyshopAsset[]) => {
    const next: Record<string, SlotView> = {}
    for (const slot of DAMAGE_PHOTO_SLOTS) {
      next[slot.id] = { slotId: slot.id }
    }
    for (const photo of photos) {
      const slotId = matchPhotoToSlot(photo.file_name)
      if (slotId && photo.view_url) {
        next[slotId] = { slotId, viewUrl: photo.view_url }
      }
    }
    setSlots(next)
  }, [])

  const refresh = useCallback(async () => {
    if (!sessionToken || !regNumber) return
    setLoading(true)
    try {
      const fresh = await fetchCustomerDocuments(sessionToken, regNumber)
      applyPhotos(fresh.photos)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [sessionToken, regNumber, applyPhotos])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh])
  )

  useCustomerScreenRefresh(refresh)

  const pickAndUpload = async (slotId: string, filePrefix: string, source: 'camera' | 'gallery') => {
    if (!sessionToken || !regNumber) {
      Alert.alert('Sign in required', 'Please open the app again to upload photos.')
      return
    }
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', source === 'camera' ? 'Camera access is required.' : 'Gallery access is required.')
        return
      }

      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true })

      if (res.canceled || !res.assets?.[0]?.uri) return

      const asset = res.assets[0]
      setSlots((prev) => ({ ...prev, [slotId]: { slotId, uploading: true } }))
      await uploadDamagePhoto({
        sessionToken,
        regNumber,
        uri: asset.uri,
        fileName: `${filePrefix}_${Date.now()}.jpg`,
        contentType: asset.mimeType || 'image/jpeg',
      })
      await refresh()
    } catch (err: unknown) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Could not upload photo.')
      setSlots((prev) => ({ ...prev, [slotId]: { ...prev[slotId], slotId, uploading: false } }))
    }
  }

  return (
    <View style={{ marginTop: 8, marginBottom: 14 }}>
      <Text style={{ color: CustomerTheme.ink, fontSize: 16, fontWeight: '900', marginBottom: 4 }}>Damage photos</Text>
      <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 12 }}>
        Help the surveyor assess damage. Use clear daylight photos where possible.
      </Text>

      {loading ? <ActivityIndicator color={CustomerTheme.teal} style={{ marginBottom: 12 }} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
        {DAMAGE_PHOTO_SLOTS.map((slot) => {
          const state = slots[slot.id]
          const done = Boolean(state?.viewUrl)
          const uploading = Boolean(state?.uploading)

          return (
            <CustomerCard
              key={slot.id}
              style={{
                width: '31%',
                minWidth: 100,
                flexGrow: 0,
                padding: 10,
                marginBottom: 0,
                borderStyle: done ? 'solid' : 'dashed',
                borderWidth: done ? 1 : 1.5,
                borderColor: done ? CustomerTheme.border : CustomerTheme.primary,
                backgroundColor: done ? '#FFFFFF' : CustomerTheme.bgMuted,
              }}
            >
              <Text style={{ color: CustomerTheme.ink, fontSize: 11.5, fontWeight: '800' }} numberOfLines={2}>
                {slot.title}
              </Text>
              <Text style={{ color: CustomerTheme.inkMuted, fontSize: 9.5, marginTop: 3, lineHeight: 13 }} numberOfLines={3}>
                {slot.instruction}
              </Text>

              {done && state?.viewUrl ? (
                <TouchableOpacity onPress={() => setPreviewUri(state.viewUrl || null)} style={{ marginTop: 10 }}>
                  <Image source={{ uri: state.viewUrl }} style={{ width: '100%', height: 88, borderRadius: 10 }} resizeMode="cover" />
                </TouchableOpacity>
              ) : (
                <View style={{ marginTop: 10, gap: 6 }}>
                  <TouchableOpacity
                    disabled={uploading}
                    onPress={() => void pickAndUpload(slot.id, slot.filePrefix, 'camera')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: CustomerTheme.primary,
                      paddingVertical: 8,
                      borderRadius: 10,
                    }}
                  >
                    {uploading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Icon name="camera" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Camera</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={uploading}
                    onPress={() => void pickAndUpload(slot.id, slot.filePrefix, 'gallery')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      borderWidth: 1,
                      borderColor: CustomerTheme.border,
                      paddingVertical: 8,
                      borderRadius: 10,
                      backgroundColor: '#fff',
                    }}
                  >
                    <Icon name="image" size={14} color={CustomerTheme.ink} />
                    <Text style={{ color: CustomerTheme.ink, fontWeight: '800', fontSize: 11 }}>Gallery</Text>
                  </TouchableOpacity>
                </View>
              )}
            </CustomerCard>
          )
        })}
      </View>

      <Modal visible={Boolean(previewUri)} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 16 }}>
          <TouchableOpacity onPress={() => setPreviewUri(null)} style={{ position: 'absolute', top: 48, right: 20, zIndex: 2 }}>
            <Icon name="x" size={24} color="#fff" />
          </TouchableOpacity>
          {previewUri ? <Image source={{ uri: previewUri }} style={{ width: '100%', height: '75%' }} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
  )
}
