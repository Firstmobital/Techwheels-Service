import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { Icon } from '../../components/ui/Icon'
import { FromTechwheelsSection } from '../../components/customer/FromTechwheelsSection'
import { DamagePhotosSection } from '../../components/customer/DamagePhotosSection'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { customerGetRepairCard } from '../../lib/api/customerPortal'
import { customerListBodyshopAssets } from '../../lib/api/customerBodyshopUploads'
import {
  claimModeFromRepairCard,
  ownershipFromRepairCard,
} from '../../lib/customer/customerClaimDocuments'
import { uploadClaimDocument } from '../../lib/customer/documentUploadFlow'
import { countMandatoryDocumentProgress, isRepairCardDocComplete } from '../../lib/customer/repairCardDocuments'
export type ClaimMode = 'insurance' | 'cash'
export type OwnershipType = 'individual' | 'firm'
export interface DocumentSlot {
  id: string
  docKey: string
  title: string
  slotLabel: string
  category: 'individual' | 'firm'
  pageNumber?: number
  totalPages?: number
  isMandatory: boolean
  description: string
}

export interface UploadedSlotState {
  uri: string
  fileName?: string
  uploadedAt: string
  fileType: 'image' | 'pdf'
  remotePath?: string
  status: 'uploaded' | 'verified' | 'rejected' | 'pending'
  rejectionReason?: string
}

const ALL_SLOTS: DocumentSlot[] = [
  // 1. Driving Licence (2 photos: Front & Back)
  {
    id: 'dl_front',
    docKey: 'doc_dl',
    title: 'Driving Licence',
    slotLabel: 'Front Side Photo',
    category: 'individual',
    pageNumber: 1,
    totalPages: 2,
    isMandatory: true,
    description: "Clear photo of the driver's licence front side showing name & licence number.",
  },
  {
    id: 'dl_back',
    docKey: 'doc_dl',
    title: 'Driving Licence',
    slotLabel: 'Back Side Photo',
    category: 'individual',
    pageNumber: 2,
    totalPages: 2,
    isMandatory: true,
    description: 'Photo of the back side showing validity & vehicle class endorsement.',
  },

  // 2. PAN Card (1 photo)
  {
    id: 'pan_card',
    docKey: 'doc_pan',
    title: 'PAN Card',
    slotLabel: 'Front Photo',
    category: 'individual',
    pageNumber: 1,
    totalPages: 1,
    isMandatory: true,
    description: "Clear photo of the vehicle owner's PAN card.",
  },

  {
    id: 'bank_detail_upload',
    docKey: 'doc_bank_detail',
    title: 'Bank details / cancelled cheque',
    slotLabel: 'Cancelled cheque or passbook (photo or PDF)',
    category: 'individual',
    pageNumber: 1,
    totalPages: 1,
    isMandatory: true,
    description: 'Bank proof for claim settlement credit.',
  },

  // 3. Aadhaar Card (2 photos: Front & Back)
  {
    id: 'aadhaar_front',
    docKey: 'doc_aadhaar',
    title: 'Aadhaar Card',
    slotLabel: 'Front Side Photo',
    category: 'individual',
    pageNumber: 1,
    totalPages: 2,
    isMandatory: true,
    description: 'Front side of Aadhaar card showing photo, name & DOB.',
  },
  {
    id: 'aadhaar_back',
    docKey: 'doc_aadhaar',
    title: 'Aadhaar Card',
    slotLabel: 'Back Side Photo',
    category: 'individual',
    pageNumber: 2,
    totalPages: 2,
    isMandatory: true,
    description: 'Back side of Aadhaar card showing complete address.',
  },

  // 4. RC Copy (2 photos: Front & Back)
  {
    id: 'rc_copy',
    docKey: 'doc_rc',
    title: 'RC (Registration Certificate)',
    slotLabel: 'RC copy (photo or PDF)',
    category: 'individual',
    pageNumber: 1,
    totalPages: 1,
    isMandatory: true,
    description: 'Vehicle RC / smart card showing registration, chassis and validity.',
  },

  {
    id: 'insurance_copy',
    docKey: 'doc_insurance',
    title: 'Insurance Policy Copy',
    slotLabel: 'Policy copy (photo or PDF)',
    category: 'individual',
    pageNumber: 1,
    totalPages: 1,
    isMandatory: true,
    description: 'Current insurance policy schedule with policy number and validity.',
  },

  {
    id: 'claim_form_upload',
    docKey: 'doc_claim_form',
    title: 'Signed Insurance Claim Form',
    slotLabel: 'Completed claim form (photo or PDF)',
    category: 'individual',
    pageNumber: 1,
    totalPages: 1,
    isMandatory: true,
    description: 'Upload the signed claim form after filling (download blank form from the Γÿ░ menu).',
  },

  {
    id: 'tp_affidavit',
    docKey: 'doc_tp_affidavit',
    title: 'T/P Affidavit',
    slotLabel: 'Notarized affidavit (photo or PDF)',
    category: 'individual',
    pageNumber: 1,
    totalPages: 1,
    isMandatory: false,
    description: 'Third-party undertaking on stamp paper (download template from the Γÿ░ menu). Optional unless your insurer asks for it.',
  },

  // Optional ΓÇö major / third-party cases (not required for progress)
  {
    id: 'kyc_upload',
    docKey: 'doc_kyc',
    title: 'KYC Form & Verification',
    slotLabel: 'KYC form (photo or PDF)',
    category: 'individual',
    pageNumber: 1,
    totalPages: 1,
    isMandatory: false,
    description: 'Extra KYC when required for major damage or third-party claims.',
  },
  // 7. Firm / Company Specific Documents
  {
    id: 'firm_gst',
    docKey: 'doc_gst',
    title: 'GST Registration Certificate',
    slotLabel: 'GST Certificate Photo/PDF',
    category: 'firm',
    pageNumber: 1,
    totalPages: 1,
    isMandatory: true,
    description: 'Official GST Certificate of the registered firm/company.',
  },
  {
    id: 'firm_pan',
    docKey: 'doc_company_pan',
    title: 'Firm / Company PAN Card',
    slotLabel: 'Company PAN Photo',
    category: 'firm',
    pageNumber: 1,
    totalPages: 1,
    isMandatory: true,
    description: "PAN Card registered in the firm or company's name.",
  },

]

export function getActiveClaimDocumentSlots(
  claimMode: ClaimMode,
  ownershipType: OwnershipType
): DocumentSlot[] {
  if (claimMode === 'cash') return []
  return ALL_SLOTS.filter((slot) => {
    if (slot.category === 'individual') return true
    if (slot.category === 'firm' && ownershipType === 'firm') return true
    return false
  })
}

export default function CustomerDocumentsScreen() {
  const { selectedReg, token } = useCustomerSession()

  // Filter States
  const [claimMode, setClaimMode] = useState<ClaimMode>('insurance')
  const [ownershipType, setOwnershipType] = useState<OwnershipType>('individual')
  const [repairCard, setRepairCard] = useState<Record<string, unknown> | null>(null)

  // Upload States
  const [uploads, setUploads] = useState<Record<string, UploadedSlotState>>({})
  const [uploadingSlotIds, setUploadingSlotIds] = useState<Record<string, boolean>>({})
  const [previewUri, setPreviewUri] = useState<string | null>(null)

  const storageKey = `claim_docs_${selectedReg || 'default'}`

  // Load saved slots
  useEffect(() => {
    async function loadSaved() {
      try {
        const raw = await AsyncStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.uploads) setUploads(parsed.uploads)
          if (parsed.claimMode) setClaimMode(parsed.claimMode)
          if (parsed.ownershipType) setOwnershipType(parsed.ownershipType)
        }
      } catch (err) {
        console.warn('Failed to load local claim docs state:', err)
      }
    }
    loadSaved()
  }, [storageKey])

  const refreshRepairCardAndAssets = useCallback(async () => {
    if (!token || !selectedReg) return
    try {
      const card = await customerGetRepairCard(token, selectedReg)
      if (card) {
        setRepairCard(card)
        setClaimMode(claimModeFromRepairCard(card))
        setOwnershipType(ownershipFromRepairCard(card))
      }
      const { documents } = await customerListBodyshopAssets(token, selectedReg)
      setUploads((prev) => {
        const next = { ...prev }
        for (const doc of documents) {
          const docKey = String(doc.doc_key || '')
          const matchingSlots = ALL_SLOTS.filter((s) => s.docKey === docKey)
          for (const slot of matchingSlots) {
            if (doc.view_url) {
              next[slot.id] = {
                uri: doc.view_url,
                fileName: doc.file_name || undefined,
                uploadedAt: doc.uploaded_at || new Date().toISOString(),
                fileType: String(doc.content_type || '').includes('pdf') ? 'pdf' : 'image',
                status: 'uploaded',
              }
            }
          }
        }
        return next
      })
    } catch (err) {
      console.warn('Failed to refresh repair card assets:', err)
    }
  }, [token, selectedReg])

  useFocusEffect(
    useCallback(() => {
      void refreshRepairCardAndAssets()
    }, [refreshRepairCardAndAssets])
  )

  // Save changes
  const persistState = async (
    nextUploads: Record<string, UploadedSlotState>,
    nextMode: ClaimMode,
    nextOwner: OwnershipType
  ) => {
    try {
      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify({
          uploads: nextUploads,
          claimMode: nextMode,
          ownershipType: nextOwner,
          updatedAt: new Date().toISOString(),
        })
      )
    } catch (e) {
      console.warn('Failed to persist claim docs:', e)
    }
  }

  // Active slots based on filters
  const activeSlots = useMemo(
    () => getActiveClaimDocumentSlots(claimMode, ownershipType),
    [claimMode, ownershipType]
  )

  const slotSideLabel = (slot: DocumentSlot) => {
    if (slot.totalPages && slot.totalPages > 1) {
      if (slot.pageNumber === 1) return 'Front'
      if (slot.pageNumber === 2) return 'Back'
      return `Page ${slot.pageNumber}`
    }
    return null
  }

  const mandatorySlots = useMemo(() => activeSlots.filter((s) => s.isMandatory), [activeSlots])
  const optionalSlotGroups = useMemo(() => {
    const optional = activeSlots.filter((s) => !s.isMandatory)
    const groups: { docKey: string; title: string; slots: DocumentSlot[] }[] = []
    const seen = new Set<string>()
    for (const slot of optional) {
      if (seen.has(slot.docKey)) continue
      seen.add(slot.docKey)
      groups.push({
        docKey: slot.docKey,
        title: slot.title,
        slots: optional.filter((s) => s.docKey === slot.docKey),
      })
    }
    return groups
  }, [activeSlots])

  const slotGroupsMandatory = useMemo(() => {
    const groups: { docKey: string; title: string; slots: DocumentSlot[] }[] = []
    const seen = new Set<string>()
    for (const slot of mandatorySlots) {
      if (seen.has(slot.docKey)) continue
      seen.add(slot.docKey)
      groups.push({
        docKey: slot.docKey,
        title: slot.title,
        slots: mandatorySlots.filter((s) => s.docKey === slot.docKey),
      })
    }
    return groups
  }, [mandatorySlots])

  const displayDocumentGroups = useMemo(
    () => [
      ...slotGroupsMandatory.map((g) => ({ ...g, section: 'required' as const })),
      ...optionalSlotGroups.map((g) => ({ ...g, section: 'optional' as const })),
    ],
    [slotGroupsMandatory, optionalSlotGroups]
  )

  const docProgress = useMemo(
    () => countMandatoryDocumentProgress(repairCard, claimMode, ownershipType),
    [repairCard, claimMode, ownershipType]
  )
  const totalRequired = docProgress.totalRequired
  const uploadedCount = docProgress.uploadedCount
  const progressPercent = docProgress.progressPercent

  const slotIsComplete = useCallback(
    (slot: DocumentSlot) => isRepairCardDocComplete(repairCard, slot.docKey) || Boolean(uploads[slot.id]?.uri),
    [repairCard, uploads]
  )

  const persistUploadedSlot = async (
    slot: DocumentSlot,
    payload: { uri: string; fileName: string; fileType: 'image' | 'pdf'; contentType: string }
  ) => {
    if (!token || !selectedReg) {
      throw new Error('Session expired. Please sign in again.')
    }
    setUploadingSlotIds((prev) => ({ ...prev, [slot.id]: true }))
    try {
      await uploadClaimDocument({
        sessionToken: token,
        regNumber: selectedReg,
        docKey: slot.docKey,
        uri: payload.uri,
        fileName: payload.fileName,
        contentType: payload.contentType,
      })
      await refreshRepairCardAndAssets()
    } finally {
      setUploadingSlotIds((prev) => ({ ...prev, [slot.id]: false }))
    }
  }

  // Camera Handler
  const handleCameraCapture = async (slot: DocumentSlot) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to capture documents.')
        return
      }

      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
      })

      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        const asset = res.assets[0]
        await persistUploadedSlot(slot, {
          uri: asset.uri,
          fileName: `${slot.docKey}_${Date.now()}.jpg`,
          fileType: 'image',
          contentType: asset.mimeType || 'image/jpeg',
        })
      }
    } catch (err: any) {
      Alert.alert('Capture Failed', err?.message || 'Unable to capture document.')
    }
  }

  // Gallery Handler
  const handleGalleryPick = async (slot: DocumentSlot) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery access permission is required.')
        return
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
      })

      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        const asset = res.assets[0]
        await persistUploadedSlot(slot, {
          uri: asset.uri,
          fileName: asset.fileName || `${slot.docKey}_${Date.now()}.jpg`,
          fileType: 'image',
          contentType: asset.mimeType || 'image/jpeg',
        })
      }
    } catch (err: any) {
      Alert.alert('Selection Failed', err?.message || 'Unable to pick photo.')
    }
  }

  // PDF / Document Picker Handler
  const handleDocPick = async (slot: DocumentSlot) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      })

      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        const asset = res.assets[0]
        const isPdf = (asset.mimeType?.includes('pdf') || asset.name?.toLowerCase().endsWith('.pdf')) ?? false
        await persistUploadedSlot(slot, {
          uri: asset.uri,
          fileName: asset.name || `${slot.docKey}_${Date.now()}.${isPdf ? 'pdf' : 'jpg'}`,
          fileType: isPdf ? 'pdf' : 'image',
          contentType: asset.mimeType || (isPdf ? 'application/pdf' : 'image/jpeg'),
        })
      }
    } catch (err: any) {
      Alert.alert('Document Pick Failed', err?.message || 'Unable to pick document.')
    }
  }

  // Remove Slot
  const handleRemove = async (slotId: string) => {
    const executeDelete = async () => {
      const nextState = { ...uploads }
      delete nextState[slotId]
      setUploads(nextState)
      await persistState(nextState, claimMode, ownershipType)
    }

    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm('Are you sure you want to delete this uploaded document?')) {
        await executeDelete()
      }
      return
    }

    Alert.alert('Remove Document', 'Are you sure you want to remove this uploaded document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: executeDelete,
      },
    ])
  }

  const renderUploadActions = (slot: DocumentSlot) => {
    const busy = Boolean(uploadingSlotIds[slot.id])
    return (
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <TouchableOpacity
          disabled={busy}
          onPress={() => void handleCameraCapture(slot)}
          activeOpacity={0.88}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            backgroundColor: CustomerTheme.teal,
            paddingVertical: 11,
            borderRadius: 12,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Icon name="camera" size={15} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 11.5 }}>Camera</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy}
          onPress={() => void handleGalleryPick(slot)}
          activeOpacity={0.88}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            backgroundColor: '#FFFFFF',
            paddingVertical: 11,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: CustomerTheme.border,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Icon name="image" size={15} color={CustomerTheme.ink} />
          <Text style={{ color: CustomerTheme.ink, fontWeight: '800', fontSize: 11.5 }}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy}
          onPress={() => void handleDocPick(slot)}
          activeOpacity={0.88}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            backgroundColor: '#FFFFFF',
            paddingVertical: 11,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: CustomerTheme.border,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Icon name="cloud-upload" size={15} color={CustomerTheme.ink} />
          <Text style={{ color: CustomerTheme.ink, fontWeight: '800', fontSize: 11.5 }}>File</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <CustomerScreen
      title="Needed from you"
      subtitle={`Complete customer-side requirements for your repair ┬╖ ${selectedReg || 'your vehicle'}`}
    >
      {/* ΓöÇΓöÇ Filter 1: Claim Mode Selector (Cash vs Insurance) ΓöÇΓöÇ */}
      <CustomerCard>
        <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
          1. Repair & Billing Type
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={() => {
              setClaimMode('insurance')
              persistState(uploads, 'insurance', ownershipType)
            }}
            style={{
              flex: 1,
              paddingVertical: 14,
              paddingHorizontal: 12,
              borderRadius: 16,
              alignItems: 'center',
              backgroundColor: claimMode === 'insurance' ? CustomerTheme.teal : '#f8fafc',
              borderColor: claimMode === 'insurance' ? CustomerTheme.teal : CustomerTheme.border,
              borderWidth: 1.5,
            }}
          >
            <Icon
              name="shield-check"
              size={22}
              color={claimMode === 'insurance' ? '#ffffff' : '#475569'}
            />
            <Text
              style={{
                fontWeight: '900',
                fontSize: 13.5,
                marginTop: 6,
                color: claimMode === 'insurance' ? '#ffffff' : '#0f172a',
              }}
            >
              Insurance Claim
            </Text>
            <Text
              style={{
                fontSize: 10.5,
                textAlign: 'center',
                marginTop: 2,
                color: claimMode === 'insurance' ? '#dbeafe' : '#64748b',
                fontWeight: '600',
              }}
            >
              Cashless / Surveyor Case
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setClaimMode('cash')
              persistState(uploads, 'cash', ownershipType)
            }}
            style={{
              flex: 1,
              paddingVertical: 14,
              paddingHorizontal: 12,
              borderRadius: 16,
              alignItems: 'center',
              backgroundColor: claimMode === 'cash' ? '#059669' : '#f8fafc',
              borderColor: claimMode === 'cash' ? '#047857' : '#cbd5e1',
              borderWidth: 1.5,
            }}
          >
            <Icon
              name="file-text"
              size={22}
              color={claimMode === 'cash' ? '#ffffff' : '#475569'}
            />
            <Text
              style={{
                fontWeight: '900',
                fontSize: 13.5,
                marginTop: 6,
                color: claimMode === 'cash' ? '#ffffff' : '#0f172a',
              }}
            >
              Cash Bodyshop
            </Text>
            <Text
              style={{
                fontSize: 10.5,
                textAlign: 'center',
                marginTop: 2,
                color: claimMode === 'cash' ? '#d1fae5' : '#64748b',
                fontWeight: '600',
              }}
            >
              No Insurance Claim
            </Text>
          </TouchableOpacity>
        </View>
      </CustomerCard>

      {/* ΓöÇΓöÇ Filter 2: Ownership ΓöÇΓöÇ */}
      {claimMode === 'insurance' && (
        <CustomerCard>
          <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            2. Vehicle registered in name of
          </Text>

          {/* Ownership Category */}
          <Text style={{ color: CustomerTheme.inkMuted, fontWeight: '800', fontSize: 11.5, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Vehicle Registration Name
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                setOwnershipType('individual')
                persistState(uploads, claimMode, 'individual')
              }}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderRadius: 14,
                backgroundColor: ownershipType === 'individual' ? CustomerTheme.teal : '#ffffff',
                borderColor: ownershipType === 'individual' ? CustomerTheme.teal : CustomerTheme.border,
                borderWidth: 1.5,
              }}
            >
              <Text style={{ fontSize: 18 }}>≡ƒæñ</Text>
              <View>
                <Text
                  style={{
                    fontWeight: '900',
                    fontSize: 12.5,
                    color: ownershipType === 'individual' ? '#ffffff' : '#0f172a',
                  }}
                >
                  Individual
                </Text>
                <Text
                  style={{
                    fontWeight: '600',
                    fontSize: 10,
                    color: ownershipType === 'individual' ? '#94a3b8' : '#64748b',
                  }}
                >
                  Personal Car
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setOwnershipType('firm')
                persistState(uploads, claimMode, 'firm')
              }}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderRadius: 14,
                backgroundColor: ownershipType === 'firm' ? CustomerTheme.teal : '#ffffff',
                borderColor: ownershipType === 'firm' ? CustomerTheme.teal : CustomerTheme.border,
                borderWidth: 1.5,
              }}
            >
              <Text style={{ fontSize: 18 }}>≡ƒÅó</Text>
              <View>
                <Text
                  style={{
                    fontWeight: '900',
                    fontSize: 12.5,
                    color: ownershipType === 'firm' ? '#ffffff' : '#0f172a',
                  }}
                >
                  Firm / Company
                </Text>
                <Text
                  style={{
                    fontWeight: '600',
                    fontSize: 10,
                    color: ownershipType === 'firm' ? '#94a3b8' : '#64748b',
                  }}
                >
                  GST Registered
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </CustomerCard>
      )}

      {/* ΓöÇΓöÇ Cash Mode Banner ΓöÇΓöÇ */}
      {claimMode === 'cash' && (
        <CustomerCard style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-2xl bg-emerald-100 items-center justify-center">
              <Icon name="check-circle" size={24} color="#059669" />
            </View>
            <View className="flex-1">
              <Text className="text-emerald-950 font-black text-[15px]">
                No Claim Documents Required
              </Text>
              <Text className="text-emerald-800 text-[12px] leading-4 mt-0.5">
                No insurance claim forms are required on cash repairs. You can still upload damage photos below for workshop records.
              </Text>
            </View>
          </View>
        </CustomerCard>
      )}

      {/* ΓöÇΓöÇ Insurance Progress Tracker ΓöÇΓöÇ */}
      {claimMode === 'insurance' && (
        <CustomerCard>
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 15 }}>
                {uploadedCount} of {totalRequired} submitted
              </Text>
              {uploadedCount < totalRequired ? (
                <View style={{ backgroundColor: CustomerTheme.peach, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
                  <Text style={{ color: CustomerTheme.peachInk, fontSize: 11, fontWeight: '800' }}>
                    {totalRequired - uploadedCount} need you
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 15 }}>{progressPercent}%</Text>
          </View>

          {/* Progress Bar */}
          <View className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <View
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: progressPercent === 100 ? CustomerTheme.success : CustomerTheme.teal,
              }}
            />
          </View>

          <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11.5, lineHeight: 17 }}>
            {progressPercent === 100
              ? 'All required documents have been uploaded for claim processing.'
              : 'Please upload the pending document pages below so the insurance surveyor can approve the claim quickly.'}
          </Text>
        </CustomerCard>
      )}

      {claimMode === 'insurance' ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: CustomerTheme.ink, fontSize: 16, fontWeight: '900' }}>Needed from you</Text>
          <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
            Photos are fine. Keep all four corners in view.
          </Text>
        </View>
      ) : null}

      {/* ΓöÇΓöÇ Document upload cards (reference layout) ΓöÇΓöÇ */}
      {claimMode === 'insurance' && (
        <View style={{ gap: 14 }}>
          {displayDocumentGroups.map((group, groupIdx) => {
            const showOptionalHeader =
              group.section === 'optional' &&
              (groupIdx === 0 || displayDocumentGroups[groupIdx - 1]?.section !== 'optional')
            return (
              <View key={`${group.section}-${group.docKey}`}>
                {showOptionalHeader ? (
                  <View style={{ marginBottom: 10, marginTop: 4 }}>
                    <Text style={{ color: CustomerTheme.ink, fontSize: 16, fontWeight: '900' }}>
                      Optional uploads
                    </Text>
                    <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
                      For major or third-party cases ΓÇö only if your advisor or insurer asks.
                    </Text>
                  </View>
                ) : null}
              <CustomerCard
                style={{
                  borderColor: CustomerTheme.border,
                  backgroundColor: '#FFFFFF',
                  padding: 16,
                  marginBottom: 14,
                }}
              >
                <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900', marginBottom: 2 }}>
                  {group.title}
                </Text>
                <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginBottom: 14, lineHeight: 17 }}>
                  {group.slots[0]?.description}
                </Text>

                {group.slots.map((slot, slotIdx) => {
                  const uploaded = uploads[slot.id]
                  const isDone = slotIsComplete(slot)
                  const isRejected = uploaded?.status === 'rejected'
                  const side = slotSideLabel(slot)

                  return (
                    <View
                      key={slot.id}
                      style={{
                        marginTop: slotIdx > 0 ? 16 : 0,
                        paddingTop: slotIdx > 0 ? 16 : 0,
                        borderTopWidth: slotIdx > 0 ? 1 : 0,
                        borderTopColor: CustomerTheme.border,
                      }}
                    >
                      {side ? (
                        <Text style={{ color: CustomerTheme.ink, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>
                          {side}
                        </Text>
                      ) : null}

                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            backgroundColor: CustomerTheme.bgMuted,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon name="file-text" size={20} color={CustomerTheme.inkSoft} />
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ color: CustomerTheme.ink, fontSize: 14, fontWeight: '800' }}>
                                {group.slots.length === 1 ? group.title : slot.slotLabel}
                              </Text>
                              <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 2 }}>
                                {isRejected
                                  ? 'Rejected ΓÇö please upload again'
                                  : isDone
                                    ? 'Uploaded'
                                    : 'Not uploaded yet'}
                              </Text>
                            </View>
                            <View
                              style={{
                                backgroundColor: isDone ? '#ECFDF5' : '#F1F5F9',
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: isDone ? '#047857' : CustomerTheme.inkMuted,
                                }}
                              >
                                {isDone ? 'Done' : slot.isMandatory ? 'Required' : 'Optional'}
                              </Text>
                            </View>
                          </View>

                          {isRejected && uploaded?.rejectionReason ? (
                            <Text style={{ color: '#B91C1C', fontSize: 11, marginTop: 6, lineHeight: 16 }}>
                              {uploaded.rejectionReason}
                            </Text>
                          ) : null}

                          {isDone && uploaded ? (
                            <View
                              style={{
                                marginTop: 10,
                                borderWidth: 1,
                                borderColor: CustomerTheme.border,
                                borderRadius: 12,
                                padding: 10,
                                flexDirection: 'row',
                                alignItems: 'center',
                              }}
                            >
                              <TouchableOpacity
                                onPress={() => setPreviewUri(uploaded.uri)}
                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                              >
                                {uploaded.fileType === 'image' ? (
                                  <Image
                                    source={{ uri: uploaded.uri }}
                                    style={{
                                      width: 44,
                                      height: 44,
                                      borderRadius: 8,
                                      backgroundColor: CustomerTheme.bgMuted,
                                      marginRight: 10,
                                    }}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <View
                                    style={{
                                      width: 44,
                                      height: 44,
                                      borderRadius: 8,
                                      backgroundColor: '#FEE2E2',
                                      marginRight: 10,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Icon name="file-text" size={18} color="#DC2626" />
                                  </View>
                                )}
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={{ color: CustomerTheme.ink, fontWeight: '700', fontSize: 12 }}
                                    numberOfLines={1}
                                  >
                                    {uploaded.fileName || 'Document attached'}
                                  </Text>
                                  <Text style={{ color: CustomerTheme.teal, fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                                    Tap to preview
                                  </Text>
                                </View>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleRemove(slot.id)} style={{ padding: 8 }}>
                                <Icon name="trash-2" size={16} color="#DC2626" />
                              </TouchableOpacity>
                            </View>
                          ) : null}

                          {(!isDone || isRejected) ? renderUploadActions(slot) : null}
                          {isDone && !isRejected ? (
                            <View style={{ marginTop: 8 }}>
                              <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, marginBottom: 6 }}>
                                Need a clearer photo?
                              </Text>
                              {renderUploadActions(slot)}
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  )
                })}
              </CustomerCard>
              </View>
            )
          })}
        </View>
      )}

      {/* ΓöÇΓöÇ Document Full Preview Modal ΓöÇΓöÇ */}
      <Modal
        visible={Boolean(previewUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <View className="flex-1 bg-black/90 items-center justify-center p-4">
          <TouchableOpacity
            onPress={() => setPreviewUri(null)}
            className="absolute top-12 right-6 w-10 h-10 rounded-full bg-white/20 items-center justify-center z-50"
          >
            <Icon name="x" size={20} color="#ffffff" />
          </TouchableOpacity>

          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={{ width: '100%', height: '80%' }}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      <DamagePhotosSection sessionToken={token} regNumber={selectedReg} />

      <FromTechwheelsSection />
    </CustomerScreen>
  )
}
