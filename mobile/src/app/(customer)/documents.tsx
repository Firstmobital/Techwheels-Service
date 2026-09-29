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
import { fetchCustomerDocuments } from '../../lib/customer/customerDocumentsCache'
import { useCustomerVisit } from '../../context/CustomerVisitContext'
import { customerListEstimates } from '../../lib/api/customerPortal'
import { parseEstimate, type EstimateView } from '../../lib/customer/math'
import { MechanicalDocumentsContent } from '../../components/customer/MechanicalDocumentsContent'
import { isMechanicalServiceType } from '../../lib/customer/mechanicalServiceType'
import {
  claimModeFromRepairCard,
  listClaimDocumentsForUpload,
  ownershipFromRepairCard,
  type CustomerClaimDocumentDef,
} from '../../lib/customer/customerClaimDocuments'
import { printMergedTwoSidedDocument } from '../../lib/customer/customerTwoSidedPrint'

function isImageName(name?: string | null, contentType?: string | null) {
  const type = String(contentType || '').toLowerCase()
  const file = String(name || '').toLowerCase()
  return type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic)$/.test(file)
}

export default function CustomerDocumentsScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const [documents, setDocuments] = useState<CustomerBodyshopAsset[]>([])
  const [estimates, setEstimates] = useState<EstimateView[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const initialFocusDone = useRef(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { isMechanical, isBodyshop, repairCard, mechCase, ready: visitReady, refresh: refreshVisit, job } = useCustomerVisit()

  const selected = useMemo(() => {
    const norm = (selectedReg || '').trim().toUpperCase()
    return vehicles.find(
      (v) => (v.reg_no || v.registration_number || v.reg_number || '').trim().toUpperCase() === norm
    ) || vehicles[0] || null
  }, [vehicles, selectedReg])

  const activeServiceType = String(job?.service_type || selected?.service_type || '')
  const isEffectiveMechanical =
    (isMechanical || isMechanicalServiceType(activeServiceType)) &&
    !repairCard &&
    !isBodyshop

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
      setDocuments(snapshot.documents)
    },
    []
  )

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!token || !selectedReg) {
        setDocuments([])
        setEstimates([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const [activeKind, estList] = await Promise.all([
          refreshVisit(),
          customerListEstimates(token, selectedReg).catch(() => [] as Record<string, unknown>[]),
        ])
        setEstimates((estList || []).map(parseEstimate))
        const currentServiceType = String(job?.service_type || selected?.service_type || '')
        if (activeKind === 'mechanical' || isMechanicalServiceType(currentServiceType)) {
          setDocuments([])
        } else {
          const fresh = await fetchCustomerDocuments(token, selectedReg)
          applySnapshot(fresh)
        }
      } catch {
        setDocuments([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [token, selectedReg, applySnapshot, isMechanical, refreshVisit, job, selected]
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
      void load('refresh')
    }, [load])
  )

  useCustomerScreenRefresh(() => load('refresh'))

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
      await load('refresh')
      setNotice(
        result.drivePending
          ? `${slot.title} uploaded. Syncing to Drive — your advisor will be notified once complete.`
          : `${slot.title} uploaded successfully. Waiting for the advisor to approve it.`
      )
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
      await load('refresh')
      setNotice(result.ok ? `${slot.title} Drive sync complete.` : (result.error || 'Drive sync retry in progress.'))
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
    const viewUrl = String(row?.view_url || '').trim()
    const fileAvailable = Boolean(row && (driveUrl || viewUrl))
    const driveSynced = Boolean(row && driveUrl && !row.drive_pending)
    const submitted = fileAvailable
    const approved = repairCard?.[slot.docKey] === true
    const rejectedKeys = Array.isArray(repairCard?.doc_rejected_keys) ? repairCard.doc_rejected_keys.map(String) : []
    const rejected = !approved && rejectedKeys.includes(slot.docKey)
    const busy = busyKey === slot.docKey
    const badgeBg = approved ? '#ECFDF5' : rejected ? '#FEF2F2' : submitted ? '#EFF6FF' : slot.required ? '#FEF3C7' : '#F1F5F9'
    const badgeColor = approved ? '#047857' : rejected ? '#B91C1C' : submitted ? '#1D4ED8' : slot.required ? '#92400E' : CustomerTheme.inkMuted
    const badgeLabel = approved ? 'Approved' : rejected ? 'Rejected' : submitted ? 'With advisor' : slot.required ? 'Required' : 'Optional'

    return (
      <CustomerCard key={slot.docKey} style={{ marginBottom: 12, padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900' }}>{slot.title}</Text>
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{slot.hint}</Text>
          </View>
          <View style={{ backgroundColor: badgeBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: badgeColor }}>
              {badgeLabel}
            </Text>
          </View>
        </View>

        {busy ? (
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={CustomerTheme.primary} />
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12 }}>Saving document…</Text>
          </View>
        ) : null}

        {fileAvailable && row ? (
          <TouchableOpacity onPress={() => void openRow(row)} style={{ marginTop: 12 }}>
            <Text style={{ color: CustomerTheme.ink, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
              {row.file_name || slot.title}
            </Text>
            <Text style={{ color: CustomerTheme.primary, fontSize: 12, marginTop: 3, fontWeight: '700' }}>
              {driveSynced ? 'Open Drive file' : 'View uploaded file'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {fileAvailable && !driveSynced && row && !busy ? (
          <View style={{ marginTop: 8, padding: 8, backgroundColor: '#FEF3C7', borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#92400E', fontSize: 11, flex: 1, marginRight: 8 }}>
              File is saved. Drive backup sync is pending.
            </Text>
            <TouchableOpacity
              onPress={() => void retrySlot(slot, row)}
              style={{ backgroundColor: CustomerTheme.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Retry sync</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {rejected ? (
          <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 10, fontWeight: '800' }}>
            Rejected by advisor. Upload this document again.
          </Text>
        ) : null}
        {!busy && !approved ? renderActions(slot) : null}
        {approved ? (
          <Text style={{ color: '#047857', fontSize: 11, marginTop: 8, fontWeight: '700' }}>
            Advisor approved this document. It cannot be changed.
          </Text>
        ) : null}
        {submitted && !approved && !rejected ? (
          <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, marginTop: 8 }}>
            Waiting for the advisor to approve or reject this file.
          </Text>
        ) : null}

        {(() => {
          const TWO_SIDED_PAIRS: Record<string, { frontKey: string; backKey: string; name: string }> = {
            doc_aadhaar: { frontKey: 'doc_aadhaar', backKey: 'doc_aadhaar_back', name: 'Aadhaar Card' },
            doc_aadhaar_back: { frontKey: 'doc_aadhaar', backKey: 'doc_aadhaar_back', name: 'Aadhaar Card' },
            doc_dl: { frontKey: 'doc_dl', backKey: 'doc_dl_back', name: 'Driving Licence' },
            doc_dl_back: { frontKey: 'doc_dl', backKey: 'doc_dl_back', name: 'Driving Licence' },
            doc_rc: { frontKey: 'doc_rc', backKey: 'doc_rc_back', name: 'Registration Certificate (RC)' },
            doc_rc_back: { frontKey: 'doc_rc', backKey: 'doc_rc_back', name: 'Registration Certificate (RC)' },
          }

          const pair = TWO_SIDED_PAIRS[slot.docKey]
          if (!pair) return null

          const frontRow = byKey.get(pair.frontKey)
          const backRow = byKey.get(pair.backKey)
          const frontUrl = String(frontRow?.view_url || frontRow?.drive_url || '').trim()
          const backUrl = String(backRow?.view_url || backRow?.drive_url || '').trim()

          if (frontUrl && backUrl) {
            return (
              <TouchableOpacity
                onPress={() =>
                  void printMergedTwoSidedDocument({
                    docName: pair.name,
                    regNumber: selectedReg || 'Vehicle',
                    frontUrl,
                    backUrl,
                  })
                }
                style={{
                  marginTop: 12,
                  backgroundColor: '#0284c7',
                  borderRadius: 10,
                  paddingVertical: 11,
                  paddingHorizontal: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Icon name="printer" size={16} color="#ffffff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                  Print 1-Page Merged (Front + Back)
                </Text>
              </TouchableOpacity>
            )
          }

          if (frontUrl || backUrl) {
            const missingSide = frontUrl ? 'Back' : 'Front'
            return (
              <View
                style={{
                  marginTop: 10,
                  padding: 8,
                  backgroundColor: '#F1F5F9',
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon name="info" size={14} color="#64748B" />
                <Text style={{ color: '#475569', fontSize: 11, flex: 1 }}>
                  Upload {missingSide} side as well to enable 1-Page Merged Print.
                </Text>
              </View>
            )
          }

          return null
        })()}
      </CustomerCard>
    )
  }

  if (isEffectiveMechanical) {
    return (
      <CustomerScreen
        title="Documents"
        subtitle={`Workshop paperwork · ${selectedReg || 'your vehicle'}`}
      >
        {loading && !visitReady ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator color={CustomerTheme.primary} />
          </View>
        ) : (
          <MechanicalDocumentsContent mechCase={mechCase} fallbackJob={job || (selected as unknown as Record<string, unknown> | null)} estimates={estimates} />
        )}
      </CustomerScreen>
    )
  }

  return (
    <CustomerScreen
      title="Documents"
      subtitle={
        refreshing && !loading
          ? `Refreshing · ${selectedReg || 'your vehicle'}`
          : `Needed from you · ${selectedReg || 'your vehicle'}`
      }
    >
      <CustomerCard>
        <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 13, marginBottom: 6 }}>
          {claimMode === 'cash' ? 'Cash bodyshop' : 'Insurance claim'}
        </Text>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, lineHeight: 17 }}>
          {ownershipType === 'firm'
            ? 'Firm / company case: RC, insurance, DL, claim form, Aadhaar, PAN, GST, company PAN, and bank details are required (same as workshop SA screen).'
            : 'Individual case: RC, insurance, DL, claim form, Aadhaar, and PAN are required.'}
          {' '}Type is taken from your repair card.
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

      <FromTechwheelsSection repairCard={repairCard} workshopDocuments={documents} />
    </CustomerScreen>
  )
}

