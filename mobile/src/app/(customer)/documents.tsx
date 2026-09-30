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
import { fetchCustomerDocuments, resetCustomerDocumentsInflight } from '../../lib/customer/customerDocumentsCache'
import { useCustomerVisit } from '../../context/CustomerVisitContext'
import { clearCustomerPortalCache, customerListEstimates, customerSetCustomerType } from '../../lib/api/customerPortal'

const CUSTOMER_TYPE_OPTIONS = [
  { key: 'individual', label: '👤 Individual', desc: 'Personal Insurance' },
  { key: 'firm', label: '🏢 Firm / Company', desc: 'Commercial / GST' },
  { key: 'cash', label: '💵 Cash', desc: 'Direct Payment' },
  { key: 'foc', label: '🎁 FOC', desc: 'Free of Cost' },
] as const
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
  const {
    isMechanical,
    isBodyshop,
    repairCard,
    mechCase,
    ready: visitReady,
    refresh: refreshVisit,
    job,
    customerType,
    setCustomerType,
  } = useCustomerVisit()
  const [freshRepairCard, setFreshRepairCard] = useState<Record<string, unknown> | null>(null)

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

  const [updatingType, setUpdatingType] = useState(false)

  const activeCustomerType = customerType || 'individual'

  const effectiveRepairCard = useMemo(() => {
    const base = freshRepairCard || repairCard
    return {
      ...(base || {}),
      customer_type: activeCustomerType,
    }
  }, [freshRepairCard, repairCard, activeCustomerType])

  const claimMode = claimModeFromRepairCard(effectiveRepairCard)
  const ownershipType = ownershipFromRepairCard(effectiveRepairCard)
  const slots = useMemo(
    () => listClaimDocumentsForUpload(claimMode, ownershipType),
    [claimMode, ownershipType]
  )
  const requiredSlots = slots.filter((slot) => slot.required)
  const optionalSlots = slots.filter((slot) => !slot.required)

  const handleSelectCustomerType = async (newType: string) => {
    if (newType === activeCustomerType || updatingType) return
    setUpdatingType(true)
    try {
      await setCustomerType(newType)
    } catch (err) {
      console.warn('Failed to update customer type:', err)
    } finally {
      setUpdatingType(false)
    }
  }

  const [reuploadingKeys, setReuploadingKeys] = useState<Record<string, boolean>>({})

  const toggleReupload = (key: string) => {
    setReuploadingKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const byKey = useMemo(() => {
    const map = new Map<string, CustomerBodyshopAsset>()
    for (const doc of documents) {
      const key = String(doc.doc_key || '')
      if (key && !map.has(key)) map.set(key, doc)
    }
    return map
  }, [documents])

  const baseCard = freshRepairCard || repairCard
  const approvedCount = requiredSlots.filter((slot) => {
    const val = baseCard?.[slot.docKey]
    return val === true || val === 'true' || val === 1
  }).length
  const submittedCount = requiredSlots.filter((slot) => {
    const row = byKey.get(slot.docKey)
    return Boolean(row && (String(row.drive_url || '').trim() || String(row.view_url || '').trim() || String(row.file_name || '').trim()))
  }).length
  const progressPercent = requiredSlots.length
    ? Math.round((submittedCount / requiredSlots.length) * 100)
    : 100

  const applySnapshot = useCallback(
    (snapshot: { repairCard: Record<string, unknown> | null; documents: CustomerBodyshopAsset[] }) => {
      setDocuments(snapshot.documents)
      if (snapshot.repairCard) {
        setFreshRepairCard(snapshot.repairCard)
      }
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
        if (mode === 'refresh') {
          clearCustomerPortalCache()
          resetCustomerDocumentsInflight()
        }
        const [activeKind, estList, freshDocs] = await Promise.all([
          refreshVisit({ bypassCache: mode === 'refresh' }),
          customerListEstimates(token, selectedReg).catch(() => [] as Record<string, unknown>[]),
          fetchCustomerDocuments(token, selectedReg).catch(() => null),
        ])
        setEstimates((estList || []).map(parseEstimate))
        const currentServiceType = String(job?.service_type || selected?.service_type || '')
        if (activeKind === 'mechanical' || isMechanicalServiceType(currentServiceType)) {
          setDocuments([])
        } else if (freshDocs) {
          applySnapshot(freshDocs)
        }
      } catch (err) {
        console.warn('Customer documents load failed, retaining current state:', err)
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

  useEffect(() => {
    if (!token || !selectedReg) return
    const timer = setInterval(() => {
      void load('refresh')
    }, 180000) // 3 minutes auto-refresh
    return () => clearInterval(timer)
  }, [token, selectedReg, load])

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
      // Clear reupload open state once upload finishes
      setReuploadingKeys((prev) => ({ ...prev, [slot.docKey]: false }))
      clearCustomerPortalCache()
      resetCustomerDocumentsInflight()
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
    const fileAvailable = Boolean(row && (driveUrl || viewUrl || row.file_name))
    const driveSynced = Boolean(row && driveUrl && !row.drive_pending)
    const submitted = fileAvailable
    const base = freshRepairCard || repairCard
    const rawApproved = base?.[slot.docKey]
    const approved = Boolean(rawApproved === true || rawApproved === 'true' || rawApproved === 1)
    const rejectedKeys = Array.isArray(base?.doc_rejected_keys) ? base.doc_rejected_keys.map(String) : []
    const rejected = !approved && rejectedKeys.includes(slot.docKey)
    const busy = busyKey === slot.docKey
    const isReuploading = Boolean(reuploadingKeys[slot.docKey])

    const badgeBg = approved
      ? '#DEF7EC'
      : rejected
        ? '#FDE8E8'
        : submitted
          ? '#EFF6FF'
          : slot.required
            ? '#FEF3C7'
            : '#F1F5F9'
    const badgeColor = approved
      ? '#03543F'
      : rejected
        ? '#9B1C1C'
        : submitted
          ? '#1E40AF'
          : slot.required
            ? '#92400E'
            : CustomerTheme.inkMuted
    const badgeLabel = approved
      ? '✓ Approved'
      : rejected
        ? '✕ Rejected'
        : submitted
          ? 'Approval Pending'
          : slot.required
            ? 'Upload Required'
            : 'Optional'

    return (
      <CustomerCard key={slot.docKey} style={{ marginBottom: 12, padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900' }}>{slot.title}</Text>
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{slot.hint}</Text>
          </View>
          <View style={{ backgroundColor: badgeBg, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: badgeColor }}>
              {badgeLabel}
            </Text>
          </View>
        </View>

        {busy ? (
          <View style={{ marginTop: 12, padding: 10, backgroundColor: '#EFF6FF', borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={CustomerTheme.primary} />
            <Text style={{ color: CustomerTheme.primary, fontSize: 12, fontWeight: '700' }}>Saving document…</Text>
          </View>
        ) : null}

        {/* 1. Approved State */}
        {approved ? (
          <View style={{ marginTop: 12, padding: 10, backgroundColor: '#F0FDF4', borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check-circle" size={16} color="#16A34A" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#15803D', fontSize: 12, fontWeight: '800' }}>
                Approved & Verified by Service Advisor
              </Text>
              <Text style={{ color: '#166534', fontSize: 11, marginTop: 1 }}>
                This document is verified and locked.
              </Text>
            </View>
          </View>
        ) : null}

        {/* 2. Rejected State */}
        {rejected ? (
          <View style={{ marginTop: 12, padding: 10, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' }}>
            <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '800' }}>
              ⚠️ Document Rejected by Service Advisor
            </Text>
            <Text style={{ color: '#991B1B', fontSize: 11, marginTop: 2 }}>
              Please re-upload a clear and valid copy using the options below.
            </Text>
          </View>
        ) : null}

        {/* 3. Uploaded / Awaiting Review State */}
        {submitted && !approved && !rejected ? (
          <View style={{ marginTop: 12, padding: 10, backgroundColor: '#EFF6FF', borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Icon name="clock" size={15} color="#2563EB" />
                <Text style={{ color: '#1D4ED8', fontSize: 12, fontWeight: '800' }}>
                  File Uploaded · Awaiting Review
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => toggleReupload(slot.docKey)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor: isReuploading ? '#FEE2E2' : '#DBEAFE',
                  borderRadius: 6,
                }}
              >
                <Text style={{ color: isReuploading ? '#991B1B' : '#1E40AF', fontSize: 11, fontWeight: '800' }}>
                  {isReuploading ? '✕ Cancel' : '🔄 Replace File'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: '#2563EB', fontSize: 11, marginTop: 3 }}>
              Your file is uploaded. Waiting for the Service Advisor to approve or reject it.
            </Text>
          </View>
        ) : null}

        {/* File Link Preview */}
        {fileAvailable && row && !busy ? (
          <TouchableOpacity onPress={() => void openRow(row)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ color: CustomerTheme.ink, fontWeight: '700', fontSize: 12.5 }} numberOfLines={1}>
                📄 {row.file_name || slot.title}
              </Text>
              <Text style={{ color: CustomerTheme.primary, fontSize: 11.5, marginTop: 2, fontWeight: '700' }}>
                {driveSynced ? 'Open Drive file ↗' : 'View uploaded file ↗'}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Drive Sync Pending Note */}
        {fileAvailable && !driveSynced && row && !busy ? (
          <View style={{ marginTop: 8, padding: 8, backgroundColor: '#FEF3C7', borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#92400E', fontSize: 11, flex: 1, marginRight: 8 }}>
              File is saved in app. Drive backup sync is pending.
            </Text>
            <TouchableOpacity
              onPress={() => void retrySlot(slot, row)}
              style={{ backgroundColor: CustomerTheme.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Retry sync</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Upload Action Buttons */}
        {!busy && (!submitted || rejected || isReuploading) && !approved ? (
          <View style={{ marginTop: isReuploading || rejected ? 10 : 0 }}>
            {isReuploading ? (
              <Text style={{ fontSize: 11, fontWeight: '700', color: CustomerTheme.inkMuted, marginBottom: 2 }}>
                Select new file to replace current upload:
              </Text>
            ) : null}
            {renderActions(slot)}
          </View>
        ) : null}

        {/* Two Sided Print section */}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="file-text" size={17} color={CustomerTheme.primary} />
            <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 14 }}>
              Customer & Claim Case Type
            </Text>
          </View>
          {updatingType && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ActivityIndicator size="small" color={CustomerTheme.primary} />
              <Text style={{ fontSize: 11, color: CustomerTheme.inkMuted }}>Saving…</Text>
            </View>
          )}
        </View>

        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, lineHeight: 17, marginBottom: 12 }}>
          Choose your claim type to upload the required documents. Updates live on the workshop portal.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {CUSTOMER_TYPE_OPTIONS.map((opt) => {
            const isSelected = activeCustomerType === opt.key
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => void handleSelectCustomerType(opt.key)}
                activeOpacity={0.7}
                style={{
                  flexBasis: '48%',
                  flexGrow: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: isSelected ? CustomerTheme.primary : '#E2E8F0',
                  backgroundColor: isSelected ? '#EFF6FF' : '#F8FAFC',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '800',
                      color: isSelected ? CustomerTheme.primary : CustomerTheme.ink,
                    }}
                  >
                    {opt.label}
                  </Text>
                  {isSelected && (
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: CustomerTheme.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="check" size={12} color="#fff" />
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    color: isSelected ? '#1E40AF' : CustomerTheme.inkMuted,
                    marginTop: 3,
                    lineHeight: 14,
                  }}
                >
                  {opt.desc}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor: claimMode === 'cash' ? '#ECFDF5' : '#F1F5F9',
            marginTop: 4,
          }}
        >
          <Text
            style={{
              fontSize: 11.5,
              fontWeight: '600',
              color: claimMode === 'cash' ? '#065F46' : '#334155',
              lineHeight: 16,
            }}
          >
            {activeCustomerType === 'firm'
              ? '🏢 Firm / Company: 9 documents required (RC, Insurance, DL, Claim Form, Aadhaar, PAN, GST, Company PAN, Bank Details).'
              : activeCustomerType === 'individual'
                ? '👤 Individual: 6 documents required (RC, Insurance, DL, Claim Form, Aadhaar, PAN Card).'
                : activeCustomerType === 'foc'
                  ? '🎁 Free of Cost (FOC): No insurance claim documents required.'
                  : '💵 Cash Customer: Direct payment repair. No insurance claim documents required.'}
          </Text>
        </View>
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
            This repair is {activeCustomerType === 'foc' ? 'Free of Cost (FOC)' : 'Cash'}. Insurance documents are not collected here.
          </Text>
        </CustomerCard>
      ) : null}

      {!loading && claimMode === 'insurance' ? (
        <CustomerCard>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 15 }}>
              {submittedCount} of {requiredSlots.length} Uploaded
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon
                name="check-circle"
                size={14}
                color={approvedCount === requiredSlots.length && requiredSlots.length > 0 ? '#16A34A' : CustomerTheme.primary}
              />
              <Text
                style={{
                  color: approvedCount === requiredSlots.length && requiredSlots.length > 0 ? '#047857' : CustomerTheme.primary,
                  fontWeight: '800',
                  fontSize: 13,
                }}
              >
                {approvedCount}/{requiredSlots.length} Approved
              </Text>
            </View>
          </View>
          <View style={{ height: 8, borderRadius: 999, backgroundColor: '#E2E8F0', marginTop: 10, overflow: 'hidden' }}>
            <View
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: approvedCount === requiredSlots.length && requiredSlots.length > 0 ? CustomerTheme.success : CustomerTheme.primary,
              }}
            />
          </View>
          <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
            {approvedCount === requiredSlots.length && requiredSlots.length > 0
              ? '🎉 All required documents are approved by the Service Advisor.'
              : `${submittedCount} of ${requiredSlots.length} documents uploaded. Once uploaded, your Service Advisor will review and approve each file.`}
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

      <FromTechwheelsSection repairCard={effectiveRepairCard} workshopDocuments={documents} />
    </CustomerScreen>
  )
}

