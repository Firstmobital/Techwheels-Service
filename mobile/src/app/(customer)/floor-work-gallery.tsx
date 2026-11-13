import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Modal, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { useCustomerVisit } from '../../context/CustomerVisitContext'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { useCustomerScreenRefresh } from '../../components/customer/customerScreenRefresh'
import {
  customerListFloorWorkGallery,
  customerOpenFloorWorkPhoto,
  type CustomerFloorWorkGalleryEntry,
  type CustomerFloorWorkGalleryPhoto,
} from '../../lib/api/customerPortal'
import {
  BODYSHOP_FLOOR_WORK_ROLE_LABELS,
  type BodyshopFloorWorkLogRole,
} from '../../lib/bodyshopFloorWork/roles'
import {
  extractGoogleDriveFileId,
  googleDriveThumbnailUrl,
} from '../../lib/api/bodyshopFloorRoleWorkLog'
import { isEffectiveMechanicalCustomerVisit } from '../../lib/customer/mechanicalServiceType'

function roleLabel(role: string | null | undefined): string {
  const key = String(role ?? '').trim().toUpperCase() as BodyshopFloorWorkLogRole
  return BODYSHOP_FLOOR_WORK_ROLE_LABELS[key] ?? (role ? String(role) : 'Workshop')
}

function workerLine(entry: CustomerFloorWorkGalleryEntry): string {
  const name = String(entry.employee_name ?? '').trim()
  const code = String(entry.employee_code ?? '').trim()
  const who = name || code || 'Team member'
  const support = entry.is_support ? ' (Support)' : ''
  return `${who}${support} · ${roleLabel(entry.floor_role)}`
}

function thumbFromPhoto(photo: CustomerFloorWorkGalleryPhoto): string | null {
  const fileId =
    extractGoogleDriveFileId(photo.drive_file_id) || extractGoogleDriveFileId(photo.drive_url)
  if (fileId) return googleDriveThumbnailUrl(fileId, 'w400')
  return null
}

export default function CustomerFloorWorkGalleryScreen() {
  const { token, selectedReg } = useCustomerSession()
  const { kind, repairCard, ready: visitReady } = useCustomerVisit()
  const isMechanical = isEffectiveMechanicalCustomerVisit(kind, repairCard)

  const [entries, setEntries] = useState<CustomerFloorWorkGalleryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<number | null>(null)
  const [thumbById, setThumbById] = useState<Record<number, string>>({})

  const photoCount = useMemo(
    () => entries.reduce((n, e) => n + (e.photos?.length ?? 0), 0),
    [entries],
  )

  const load = useCallback(async () => {
    if (!token || !selectedReg || isMechanical) {
      setLoading(false)
      return
    }
    setError(null)
    try {
      const payload = await customerListFloorWorkGallery(token, selectedReg)
      setEntries(payload.entries ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workshop photos.')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg, isMechanical])

  const resolveThumbs = useCallback(async (list: CustomerFloorWorkGalleryEntry[]) => {
    if (!token || !selectedReg) return
    const next: Record<number, string> = {}
    const needSign: CustomerFloorWorkGalleryPhoto[] = []
    for (const entry of list) {
      for (const photo of entry.photos ?? []) {
        const id = Number(photo.photo_id)
        if (!Number.isFinite(id)) continue
        const driveThumb = thumbFromPhoto(photo)
        if (driveThumb) {
          next[id] = driveThumb
        } else if (photo.storage_path) {
          needSign.push(photo)
        }
      }
    }
    setThumbById((prev) => ({ ...prev, ...next }))
    for (const photo of needSign.slice(0, 24)) {
      const id = Number(photo.photo_id)
      try {
        const url = await customerOpenFloorWorkPhoto(token, selectedReg, photo)
        setThumbById((prev) => ({ ...prev, [id]: url }))
      } catch {
        /* skip */
      }
    }
  }, [token, selectedReg])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load().then(() => {
        /* thumbs after load */
      })
    }, [load]),
  )

  useCustomerScreenRefresh(async () => {
    setLoading(true)
    await load()
  })

  useFocusEffect(
    useCallback(() => {
      if (entries.length > 0) void resolveThumbs(entries)
    }, [entries, resolveThumbs]),
  )

  const openPhoto = async (photo: CustomerFloorWorkGalleryPhoto) => {
    if (!token || !selectedReg) return
    const id = Number(photo.photo_id)
    setOpeningId(id)
    try {
      const uri =
        thumbById[id] && !thumbFromPhoto(photo)
          ? thumbById[id]
          : await customerOpenFloorWorkPhoto(token, selectedReg, photo)
      setPreviewUri(uri)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open photo.')
    } finally {
      setOpeningId(null)
    }
  }

  if (visitReady && isMechanical) {
    return (
      <CustomerScreen title="Repair work photos" showBackButton>
        <CustomerCard>
          <Text style={{ color: CustomerTheme.inkSoft }}>This section is for bodyshop repair visits only.</Text>
        </CustomerCard>
      </CustomerScreen>
    )
  }

  return (
    <CustomerScreen title="Repair work photos" showBackButton subtitle={selectedReg || undefined}>
      <View style={{ gap: 12 }}>
        <CustomerCard>
          <Text style={{ fontSize: 15, fontWeight: '700', color: CustomerTheme.navy }}>
            Workshop progress on your car
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 19, color: CustomerTheme.inkSoft }}>
            Photos uploaded from our floor team (denting, painting, rubbing) with the technician name for each update.
          </Text>
          {!loading && photoCount > 0 ? (
            <Text style={{ marginTop: 8, fontSize: 12, fontWeight: '600', color: CustomerTheme.primary }}>
              {photoCount} photo{photoCount === 1 ? '' : 's'}
            </Text>
          ) : null}
        </CustomerCard>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={CustomerTheme.primary} />
          </View>
        ) : null}

        {error ? (
          <CustomerCard>
            <Text style={{ color: '#B42318', fontSize: 13 }}>{error}</Text>
          </CustomerCard>
        ) : null}

        {!loading && !error && entries.length === 0 ? (
          <CustomerCard>
            <Text style={{ color: CustomerTheme.inkSoft, fontSize: 14 }}>
              No workshop photos yet. When our team uploads progress pictures from the floor module, they will appear here.
            </Text>
          </CustomerCard>
        ) : null}

        {entries.map((entry) => (
          <CustomerCard key={entry.log_id}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: CustomerTheme.navy }}>{workerLine(entry)}</Text>
            {entry.update_date ? (
              <Text style={{ marginTop: 4, fontSize: 12, color: CustomerTheme.inkSoft }}>
                Date: {entry.update_date}
              </Text>
            ) : null}
            {String(entry.note_text ?? '').trim() ? (
              <Text style={{ marginTop: 6, fontSize: 13, color: CustomerTheme.ink, lineHeight: 18 }}>
                {String(entry.note_text).trim()}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {(entry.photos ?? []).map((photo) => {
                const id = Number(photo.photo_id)
                const uri = thumbById[id] ?? thumbFromPhoto(photo)
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => void openPhoto(photo)}
                    activeOpacity={0.85}
                    style={{
                      width: '31%',
                      aspectRatio: 1,
                      borderRadius: 10,
                      overflow: 'hidden',
                      backgroundColor: CustomerTheme.border,
                    }}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        {openingId === id ? (
                          <ActivityIndicator size="small" color={CustomerTheme.primary} />
                        ) : (
                          <Text style={{ fontSize: 10, color: CustomerTheme.inkSoft }}>Photo</Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          </CustomerCard>
        ))}
      </View>

      <Modal visible={Boolean(previewUri)} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 48, right: 20, zIndex: 2, padding: 12 }}
            onPress={() => setPreviewUri(null)}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Close</Text>
          </TouchableOpacity>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </CustomerScreen>
  )
}
