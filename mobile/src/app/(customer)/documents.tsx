import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { Icon } from '../../components/ui/Icon'
import { FromTechwheelsSection } from '../../components/customer/FromTechwheelsSection'
import { DamagePhotosSection } from '../../components/customer/DamagePhotosSection'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { useCustomerScreenRefresh } from '../../components/customer/customerScreenRefresh'
import {
  customerRetryBodyshopDrive,
  customerUploadBodyshopAsset,
  type CustomerBodyshopAsset,
} from '../../lib/api/customerBodyshopUploads'
import {
  peekCustomerDocumentsMemory,
  readCustomerDocumentsCache,
  syncCustomerDocumentsFromServer,
} from '../../lib/customer/customerDocumentsCache'
import {
  claimModeFromRepairCard,
  listClaimDocumentsForUpload,
  ownershipFromRepairCard,
  type CustomerClaimDocumentDef,
} from '../../lib/customer/customerClaimDocuments'

function isImageName(name?: string | null, contentType?: string | null) {
  const type = String(contentType || '').toLowerCase()
  const file = String(name || '').toLowerCase()
  return type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic)$/.test(file)
}

export default function CustomerDocumentsScreen() {
  const { token, selectedReg } = useCustomerSession()
  const bootMem = peekCustomerDocumentsMemory(selectedReg)
  const [repairCard, setRepairCard] = useState<Record<string, unknown> | null>(bootMem?.repairCard ?? null)
  const [documents, setDocuments] = useState<CustomerBodyshopAsset[]>(bootMem?.documents ?? [])
  const [loading, setLoading] = useState(!bootMem)
  const [syncing, setSyncing] = useState(false)
  const initialFocusDone = useRef(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const claimMode = claimModeFromRepairCard(repairCard)
  const ownershipType = ownershipFromRepairCard(repairCard)
  const slots = useMemo(
    () => listClaimDocumentsForUpload(claimMode, ownershipType),
    [claimMode, ownershipType]
  )
  const requiredSlots = slots.filter((slot) => slot.required)
  const optionalSlots = slots.filter((slot) => !slot.required)

  const byKey = useMemo(() => {
    const map = new Map<string, CustomerBodyshopAsset>()
    for (const doc of documents) {
      const key = String(doc.doc_key || '')
      if (key && !map.has(key)) map.set(key, doc)
    }
    return map
  }, [documents])

  const submittedCount = requiredSlots.filter((slot) => {
    const row = byKey.get(slot.docKey)
    return Boolean(row && String(row.drive_url || '').trim() && !row.drive_pending)
  }).length
  const progressPercent = requiredSlots.length
    ? Math.round((submittedCount / requiredSlots.length) * 100)
    : 100

  const applySnapshot = useCallback(
    (snapshot: { repairCard: Record<string, unknown> | null; documents: CustomerBodyshopAsset[] }) => {
      setRepairCard(snapshot.repairCard)
      setDocuments(snapshot.documents)
    },
    []
  )

  const load = useCallback(
    async (mode: 'initial' | 'background' | 'force' = 'initial') => {
      if (!token || !selectedReg) {
        setRepairCard(null)
        setDocuments([])
        setLoading(false)
        return
      }

      let showedCache = false
      if (mode !== 'force') {
        const instant = peekCustomerDocumentsMemory(selectedReg)
        if (instant) {
          applySnapshot(instant)
          setLoading(false)
          showedCache = true
        }
        const cached = instant ?? (await readCustomerDocumentsCache(selectedReg))
        if (cached) {
          applySnapshot(cached)
          setLoading(false)
          showedCache = true
        }
      }

      if (mode === 'initial' && !showedCache) {
        setLoading(true)
      } else if (mode !== 'force') {
        setSyncing(true)
      }

      try {
        const fresh = await syncCustomerDocumentsFromServer(token, selectedReg)
        applySnapshot(fresh)
      } catch {
        if (!showedCache) {
          setRepairCard(null)
          setDocuments([])
        }
      } finally {
        setLoading(false)
        setSyncing(false)
      }
    },
    [token, selectedReg, applySnapshot]
  )

  useEffect(() => {
    initialFocusDone.current = false
    void load('initial')
  }, [load])

  useFocusEffect(
    useCallback(() => {
      if (!initialFocusDone.current) {
        initialFocusDone.current = true
        return
      }
      void load('background')
    }, [load])
  )

  useCustomerScreenRefresh(() => load('background'))

  const uploadSlot = async (
    slot: CustomerClaimDocumentDef,
    source: 'camera' | 'gallery' | 'file'
  ) => {
    if (!token || !selectedReg) {
      Alert.alert('Session expired', 'Sign in again to upload documents.')
      return
    }
    try {
      let uri = ''
      let fileName = `${slot.docKey}.jpg`
      let contentType = 'image/jpeg'

      if (source === 'camera' || source === 'gallery') {
        const permission = source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (permission.status !== 'granted') {
          Alert.alert('Permission needed', source === 'camera' ? 'Camera access is required.' : 'Photo library access is required.')
          return
        }
        const res = source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
        if (res.canceled || !res.assets?.[0]?.uri) return
        uri = res.assets[0].uri
        fileName = res.assets[0].fileName || `${slot.docKey}.jpg`
        contentType = res.assets[0].mimeType || 'image/jpeg'
      } else {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      })
        if (res.canceled || !res.assets?.[0]?.uri) return
        uri = res.assets[0].uri
        fileName = res.assets[0].name || `${slot.docKey}.pdf`
        contentType = res.assets[0].mimeType || (fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
      }

      setBusyKey(slot.docKey)
      setNotice(null)
      const result = await customerUploadBodyshopAsset({
        sessionToken: token,
        regNumber: selectedReg,
        kind: 'document',
        docKey: slot.docKey,
        uri,
        fileName,
        contentType,
      })
      await load('force')
      setNotice(result.ok
        ? `${slot.title} is saved on Drive.`
        : `${slot.title} is saved. Drive sync is still pending.`)
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload this document.')
    } finally {
      setBusyKey(null)
    }
  }

  const retrySlot = async (slot: CustomerClaimDocumentDef, row: CustomerBodyshopAsset) => {
    if (!token || !selectedReg) return
    setBusyKey(slot.docKey)
    setNotice(null)
    try {
      const result = await customerRetryBodyshopDrive({
        sessionToken: token,
        regNumber: selectedReg,
        resourceId: row.id,
        docKey: slot.docKey,
      })
      await load('force')
      setNotice(result.ok ? `${slot.title} is saved on Drive.` : (result.error || 'Drive sync is still pending.'))
    } catch (error) {
      Alert.alert('Retry failed', error instanceof Error ? error.message : 'Unable to retry Drive sync.')
    } finally {
      setBusyKey(null)
    }
  }

  const openRow = async (row: CustomerBodyshopAsset) => {
    const url = String(row.drive_url || row.view_url || '').trim()
    if (!url) return
    if (isImageName(row.file_name, row.content_type) && !url.includes('drive.google.com')) {
      setPreviewUri(url)
      return
    }
    const supported = await Linking.canOpenURL(url)
    if (supported) await Linking.openURL(url)
  }

  const renderActions = (slot: CustomerClaimDocumentDef) => (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
      <TouchableOpacity
        onPress={() => void uploadSlot(slot, 'camera')}
        disabled={busyKey === slot.docKey}
        style={{ flex: 1, backgroundColor: CustomerTheme.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Photo</Text>
      </TouchableOpacity>
          <TouchableOpacity
        onPress={() => void uploadSlot(slot, 'gallery')}
        disabled={busyKey === slot.docKey}
        style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: CustomerTheme.border }}
      >
        <Text style={{ color: CustomerTheme.ink, fontWeight: '800', fontSize: 12 }}>Gallery</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => void uploadSlot(slot, 'file')}
        disabled={busyKey === slot.docKey}
        style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: CustomerTheme.border }}
      >
        <Text style={{ color: CustomerTheme.ink, fontWeight: '800', fontSize: 12 }}>PDF</Text>
      </TouchableOpacity>
    </View>
  )

  const renderSlot = (slot: CustomerClaimDocumentDef) => {
    const row = byKey.get(slot.docKey)
    const driveUrl = String(row?.drive_url || '').trim()
    const submitted = Boolean(row && driveUrl && !row.drive_pending)
    const pending = Boolean(row && !submitted)
    const busy = busyKey === slot.docKey

    return (
      <CustomerCard key={slot.docKey} style={{ marginBottom: 12, padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900' }}>{slot.title}</Text>
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{slot.hint}</Text>
          </View>
          <View style={{ backgroundColor: submitted ? '#ECFDF5' : pending ? '#FEF3C7' : '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: submitted ? '#047857' : pending ? '#92400E' : CustomerTheme.inkMuted }}>
              {submitted ? 'Done' : pending ? 'Pending' : slot.required ? 'Required' : 'Optional'}
            </Text>
          </View>
        </View>

        {busy ? (
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={CustomerTheme.primary} />
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12 }}>Saving to Drive…</Text>
          </View>
        ) : null}

        {submitted && row ? (
          <TouchableOpacity onPress={() => void openRow(row)} style={{ marginTop: 12 }}>
            <Text style={{ color: CustomerTheme.ink, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>
              {row.file_name || slot.title}
            </Text>
            <Text style={{ color: CustomerTheme.primary, fontSize: 11, marginTop: 2, fontWeight: '700' }}>Open Drive file</Text>
          </TouchableOpacity>
        ) : null}

        {pending && row && !busy ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 17 }}>
              File is stored. Drive sync is still pending, so this is not submitted yet.
            </Text>
            <TouchableOpacity
              onPress={() => void retrySlot(slot, row)}
              style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: CustomerTheme.primary, borderRadius: CustomerTheme.radiusButton, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Retry Drive sync</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!busy ? renderActions(slot) : null}
        {submitted ? (
          <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, marginTop: 8 }}>
            Choose again to replace this file. The workshop copy stays until the new Drive link is saved.
          </Text>
        ) : null}
      </CustomerCard>
    )
  }

  return (
    <CustomerScreen
      title="Documents"
      subtitle={
        syncing && !loading
          ? `Syncing latest · ${selectedReg || 'your vehicle'}`
          : `Needed from you · ${selectedReg || 'your vehicle'}`
      }
    >
      <CustomerCard>
        <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 13, marginBottom: 6 }}>
          {claimMode === 'cash' ? 'Cash bodyshop' : 'Insurance claim'}
                </Text>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, lineHeight: 17 }}>
          {ownershipType === 'firm'
            ? 'This vehicle is registered to a firm, so GST and company PAN are included.'
            : 'This vehicle is registered to an individual.'}
          {' '}Taken from your repair card.
                </Text>
      </CustomerCard>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={CustomerTheme.primary} />
              </View>
      ) : null}

      {notice ? (
        <CustomerCard style={{ backgroundColor: '#F8FAFC' }}>
          <Text style={{ color: CustomerTheme.ink, fontSize: 13 }}>{notice}</Text>
        </CustomerCard>
      ) : null}

      {!loading && claimMode === 'cash' ? (
        <CustomerCard style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <Text style={{ color: '#064E3B', fontWeight: '900', fontSize: 15 }}>No claim documents required</Text>
          <Text style={{ color: '#065F46', fontSize: 12, marginTop: 4, lineHeight: 17 }}>
            This repair is cash. Insurance documents are not collected here.
              </Text>
        </CustomerCard>
      ) : null}

      {!loading && claimMode === 'insurance' ? (
        <CustomerCard>
          <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 15 }}>
            {submittedCount} of {requiredSlots.length} submitted
                </Text>
          <View style={{ height: 8, borderRadius: 999, backgroundColor: '#E2E8F0', marginTop: 10, overflow: 'hidden' }}>
            <View style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: progressPercent === 100 ? CustomerTheme.success : CustomerTheme.primary }} />
          </View>
          <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
            A document counts only after it has a Drive link.
          </Text>
        </CustomerCard>
      ) : null}

      {!loading && claimMode === 'insurance' ? requiredSlots.map(renderSlot) : null}
      {!loading && claimMode === 'insurance' && optionalSlots.length > 0 ? (
        <Text style={{ color: CustomerTheme.ink, fontSize: 16, fontWeight: '900', marginBottom: 8 }}>Optional uploads</Text>
      ) : null}
      {!loading && claimMode === 'insurance' ? optionalSlots.map(renderSlot) : null}

      <Modal visible={Boolean(previewUri)} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 16 }}>
          <TouchableOpacity onPress={() => setPreviewUri(null)} style={{ alignSelf: 'flex-end', marginBottom: 12 }}>
            <Icon name="x" size={22} color="#fff" />
          </TouchableOpacity>
          {previewUri ? <Image source={{ uri: previewUri }} style={{ width: '100%', height: '70%' }} resizeMode="contain" /> : null}
        </View>
      </Modal>

      <DamagePhotosSection sessionToken={token} regNumber={selectedReg} />

      <FromTechwheelsSection />
    </CustomerScreen>
  )
}
