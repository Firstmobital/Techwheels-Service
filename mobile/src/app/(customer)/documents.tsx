import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
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

export type ClaimMode = 'insurance' | 'cash'
export type OwnershipType = 'individual' | 'firm'
export type DamageSeverity = 'standard' | 'major'

export interface DocumentSlot {
  id: string
  docKey: string
  title: string
  slotLabel: string
  category: 'individual' | 'firm' | 'major'
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
    id: 'rc_front',
    docKey: 'doc_rc',
    title: 'RC (Registration Certificate)',
    slotLabel: 'Front Side Photo',
    category: 'individual',
    pageNumber: 1,
    totalPages: 2,
    isMandatory: true,
    description: 'Front side of Vehicle RC / Smart Card showing Chassis & Engine No.',
  },
  {
    id: 'rc_back',
    docKey: 'doc_rc',
    title: 'RC (Registration Certificate)',
    slotLabel: 'Back Side Photo',
    category: 'individual',
    pageNumber: 2,
    totalPages: 2,
    isMandatory: true,
    description: 'Back side of Vehicle RC showing registration & tax validity.',
  },

  // 5. Insurance Copy (3 pages / PDF)
  {
    id: 'insurance_p1',
    docKey: 'doc_insurance',
    title: 'Insurance Policy Copy',
    slotLabel: 'Page 1 (Policy Schedule)',
    category: 'individual',
    pageNumber: 1,
    totalPages: 3,
    isMandatory: true,
    description: 'First page of insurance policy showing policy number, IDV & validity dates.',
  },
  {
    id: 'insurance_p2',
    docKey: 'doc_insurance',
    title: 'Insurance Policy Copy',
    slotLabel: 'Page 2 (Coverage Details)',
    category: 'individual',
    pageNumber: 2,
    totalPages: 3,
    isMandatory: true,
    description: 'Second page showing OD/TP premium breakup and add-on covers (Zero Dep, etc.).',
  },
  {
    id: 'insurance_p3',
    docKey: 'doc_insurance',
    title: 'Insurance Policy Copy',
    slotLabel: 'Page 3 (Terms & Conditions)',
    category: 'individual',
    pageNumber: 3,
    totalPages: 3,
    isMandatory: true,
    description: 'Third page / policy terms or endorsement sheet.',
  },

  // 6. Claim Form (4 pages / PDF)
  {
    id: 'claim_p1',
    docKey: 'doc_claim_form',
    title: 'Insurance Claim Form',
    slotLabel: 'Page 1 (Accident Details)',
    category: 'individual',
    pageNumber: 1,
    totalPages: 4,
    isMandatory: true,
    description: 'Claim form page 1 filled with accident date, time, location & description.',
  },
  {
    id: 'claim_p2',
    docKey: 'doc_claim_form',
    title: 'Insurance Claim Form',
    slotLabel: 'Page 2 (Driver & Witness Info)',
    category: 'individual',
    pageNumber: 2,
    totalPages: 4,
    isMandatory: true,
    description: 'Page 2 with driver details at time of accident and third party details.',
  },
  {
    id: 'claim_p3',
    docKey: 'doc_claim_form',
    title: 'Insurance Claim Form',
    slotLabel: 'Page 3 (Damaged Parts List)',
    category: 'individual',
    pageNumber: 3,
    totalPages: 4,
    isMandatory: true,
    description: 'Page 3 detailing damage overview and repair workshop name.',
  },
  {
    id: 'claim_p4',
    docKey: 'doc_claim_form',
    title: 'Insurance Claim Form',
    slotLabel: 'Page 4 (Signature & Declaration)',
    category: 'individual',
    pageNumber: 4,
    totalPages: 4,
    isMandatory: true,
    description: 'Final declaration signed by the insured customer/company.',
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

  // 8. Major Accident / Recovery Specific Documents
  // T/P Affidavit (2 pages)
  {
    id: 'major_tp_affidavit_p1',
    docKey: 'doc_tp_affidavit',
    title: 'T/P Affidavit (Third-Party Undertaking)',
    slotLabel: 'Page 1 (Notarized Stamp Paper)',
    category: 'major',
    pageNumber: 1,
    totalPages: 2,
    isMandatory: true,
    description: 'First page of notarized T/P Affidavit / Third-Party Undertaking on stamp paper.',
  },
  {
    id: 'major_tp_affidavit_p2',
    docKey: 'doc_tp_affidavit',
    title: 'T/P Affidavit (Third-Party Undertaking)',
    slotLabel: 'Page 2 (Notary Stamp & Sign)',
    category: 'major',
    pageNumber: 2,
    totalPages: 2,
    isMandatory: true,
    description: 'Second page showing advocate/notary seal, verification & customer signature.',
  },

  // KYC Form (2 pages)
  {
    id: 'major_kyc_p1',
    docKey: 'doc_kyc',
    title: 'KYC Form & Verification',
    slotLabel: 'Page 1 (Identity & Bank Details)',
    category: 'major',
    pageNumber: 1,
    totalPages: 2,
    isMandatory: true,
    description: 'First page of KYC form showing customer details and bank account verification.',
  },
  {
    id: 'major_kyc_p2',
    docKey: 'doc_kyc',
    title: 'KYC Form & Verification',
    slotLabel: 'Page 2 (Signature & Declaration)',
    category: 'major',
    pageNumber: 2,
    totalPages: 2,
    isMandatory: true,
    description: 'Second page with customer signature, photo attestation & declaration.',
  },
]

export default function CustomerDocumentsScreen() {
  const { selectedReg } = useCustomerSession()

  // Filter States
  const [claimMode, setClaimMode] = useState<ClaimMode>('insurance')
  const [ownershipType, setOwnershipType] = useState<OwnershipType>('individual')
  const [damageSeverity, setDamageSeverity] = useState<DamageSeverity>('standard')

  // Upload States
  const [uploads, setUploads] = useState<Record<string, UploadedSlotState>>({})
  const [activeSlotForAction, setActiveSlotForAction] = useState<DocumentSlot | null>(null)
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
          if (parsed.damageSeverity) setDamageSeverity(parsed.damageSeverity)
        }
      } catch (err) {
        console.warn('Failed to load local claim docs state:', err)
      }
    }
    loadSaved()
  }, [storageKey])

  // Save changes
  const persistState = async (
    nextUploads: Record<string, UploadedSlotState>,
    nextMode: ClaimMode,
    nextOwner: OwnershipType,
    nextDamage: DamageSeverity
  ) => {
    try {
      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify({
          uploads: nextUploads,
          claimMode: nextMode,
          ownershipType: nextOwner,
          damageSeverity: nextDamage,
          updatedAt: new Date().toISOString(),
        })
      )
    } catch (e) {
      console.warn('Failed to persist claim docs:', e)
    }
  }

  // Active slots based on filters
  const activeSlots = useMemo(() => {
    if (claimMode === 'cash') return []

    return ALL_SLOTS.filter((slot) => {
      if (slot.category === 'individual') return true
      if (slot.category === 'firm' && ownershipType === 'firm') return true
      if (slot.category === 'major' && damageSeverity === 'major') return true
      return false
    })
  }, [claimMode, ownershipType, damageSeverity])

  // Stats
  const totalRequired = activeSlots.length
  const uploadedCount = activeSlots.filter((s) => Boolean(uploads[s.id]?.uri)).length
  const progressPercent = totalRequired > 0 ? Math.round((uploadedCount / totalRequired) * 100) : 100

  // Camera Handler
  const handleCameraCapture = async (slot: DocumentSlot) => {
    try {
      setActiveSlotForAction(null)
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
        const nextState: Record<string, UploadedSlotState> = {
          ...uploads,
          [slot.id]: {
            uri: asset.uri,
            fileName: `${slot.id}_${Date.now()}.jpg`,
            uploadedAt: new Date().toISOString(),
            fileType: 'image',
            status: 'uploaded',
          },
        }
        setUploads(nextState)
        await persistState(nextState, claimMode, ownershipType, damageSeverity)
      }
    } catch (err: any) {
      Alert.alert('Capture Failed', err?.message || 'Unable to capture document.')
    }
  }

  // Gallery Handler
  const handleGalleryPick = async (slot: DocumentSlot) => {
    try {
      setActiveSlotForAction(null)
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
        const nextState: Record<string, UploadedSlotState> = {
          ...uploads,
          [slot.id]: {
            uri: asset.uri,
            fileName: asset.fileName || `${slot.id}_${Date.now()}.jpg`,
            uploadedAt: new Date().toISOString(),
            fileType: 'image',
            status: 'uploaded',
          },
        }
        setUploads(nextState)
        await persistState(nextState, claimMode, ownershipType, damageSeverity)
      }
    } catch (err: any) {
      Alert.alert('Selection Failed', err?.message || 'Unable to pick photo.')
    }
  }

  // PDF / Document Picker Handler
  const handleDocPick = async (slot: DocumentSlot) => {
    try {
      setActiveSlotForAction(null)
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      })

      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        const asset = res.assets[0]
        const isPdf = (asset.mimeType?.includes('pdf') || asset.name?.toLowerCase().endsWith('.pdf')) ?? false
        const nextState: Record<string, UploadedSlotState> = {
          ...uploads,
          [slot.id]: {
            uri: asset.uri,
            fileName: asset.name,
            uploadedAt: new Date().toISOString(),
            fileType: isPdf ? 'pdf' : 'image',
            status: 'uploaded',
          },
        }
        setUploads(nextState)
        await persistState(nextState, claimMode, ownershipType, damageSeverity)
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
      await persistState(nextState, claimMode, ownershipType, damageSeverity)
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

  return (
    <CustomerScreen
      title="Claim Documents"
      subtitle={`Insurance checklist for ${selectedReg || 'your vehicle'}`}
      showBackButton
    >
      {/* ── Filter 1: Claim Mode Selector (Cash vs Insurance) ── */}
      <CustomerCard>
        <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
          1. Repair & Billing Type
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={() => {
              setClaimMode('insurance')
              persistState(uploads, 'insurance', ownershipType, damageSeverity)
            }}
            style={{
              flex: 1,
              paddingVertical: 14,
              paddingHorizontal: 12,
              borderRadius: 16,
              alignItems: 'center',
              backgroundColor: claimMode === 'insurance' ? '#2563eb' : '#f8fafc',
              borderColor: claimMode === 'insurance' ? '#1d4ed8' : '#cbd5e1',
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
              persistState(uploads, 'cash', ownershipType, damageSeverity)
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

      {/* ── Filter 2 & 3: Additional Insurance Claim Filters ── */}
      {claimMode === 'insurance' && (
        <CustomerCard>
          <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            2. Claim Categories & Filters
          </Text>

          {/* Ownership Category */}
          <Text style={{ color: '#475569', fontWeight: '800', fontSize: 11.5, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Vehicle Registration Name
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => {
                setOwnershipType('individual')
                persistState(uploads, claimMode, 'individual', damageSeverity)
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
                backgroundColor: ownershipType === 'individual' ? '#0f172a' : '#ffffff',
                borderColor: ownershipType === 'individual' ? '#0f172a' : '#cbd5e1',
                borderWidth: 1.5,
              }}
            >
              <Text style={{ fontSize: 18 }}>👤</Text>
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
                persistState(uploads, claimMode, 'firm', damageSeverity)
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
                backgroundColor: ownershipType === 'firm' ? '#0f172a' : '#ffffff',
                borderColor: ownershipType === 'firm' ? '#0f172a' : '#cbd5e1',
                borderWidth: 1.5,
              }}
            >
              <Text style={{ fontSize: 18 }}>🏢</Text>
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

          {/* Accident Damage Severity */}
          <Text style={{ color: '#475569', fontWeight: '800', fontSize: 11.5, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Accident Damage Severity
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                setDamageSeverity('standard')
                persistState(uploads, claimMode, ownershipType, 'standard')
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
                backgroundColor: damageSeverity === 'standard' ? '#0f172a' : '#ffffff',
                borderColor: damageSeverity === 'standard' ? '#0f172a' : '#cbd5e1',
                borderWidth: 1.5,
              }}
            >
              <Text style={{ fontSize: 18 }}>🚗</Text>
              <View>
                <Text
                  style={{
                    fontWeight: '900',
                    fontSize: 12.5,
                    color: damageSeverity === 'standard' ? '#ffffff' : '#0f172a',
                  }}
                >
                  Standard Repair
                </Text>
                <Text
                  style={{
                    fontWeight: '600',
                    fontSize: 10,
                    color: damageSeverity === 'standard' ? '#94a3b8' : '#64748b',
                  }}
                >
                  Normal Damage
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setDamageSeverity('major')
                persistState(uploads, claimMode, ownershipType, 'major')
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
                backgroundColor: damageSeverity === 'major' ? '#b91c1c' : '#ffffff',
                borderColor: damageSeverity === 'major' ? '#991b1b' : '#cbd5e1',
                borderWidth: 1.5,
              }}
            >
              <Text style={{ fontSize: 18 }}>⚠️</Text>
              <View>
                <Text
                  style={{
                    fontWeight: '900',
                    fontSize: 12.5,
                    color: damageSeverity === 'major' ? '#ffffff' : '#0f172a',
                  }}
                >
                  Major / T-Party
                </Text>
                <Text
                  style={{
                    fontWeight: '600',
                    fontSize: 10,
                    color: damageSeverity === 'major' ? '#fecaca' : '#64748b',
                  }}
                >
                  Affidavit + KYC
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </CustomerCard>
      )}

      {/* ── Cash Mode Banner ── */}
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
                Since this vehicle is in Bodyshop on a Cash basis, no insurance forms, policy copies, or KYC affidavits are required from your end.
              </Text>
            </View>
          </View>
        </CustomerCard>
      )}

      {/* ── Insurance Progress Tracker ── */}
      {claimMode === 'insurance' && (
        <CustomerCard>
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Text className="text-slate-900 font-black text-base">Documents Progress</Text>
              <View
                className={`px-2.5 py-0.5 rounded-full ${
                  uploadedCount === totalRequired ? 'bg-emerald-100' : 'bg-blue-100'
                }`}
              >
                <Text
                  className={`text-[11px] font-black ${
                    uploadedCount === totalRequired ? 'text-emerald-800' : 'text-blue-800'
                  }`}
                >
                  {uploadedCount}/{totalRequired} Uploaded
                </Text>
              </View>
            </View>
            <Text className="text-slate-900 font-black text-base">{progressPercent}%</Text>
          </View>

          {/* Progress Bar */}
          <View className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <View
              style={{ width: `${progressPercent}%` }}
              className={`h-full rounded-full ${
                progressPercent === 100 ? 'bg-emerald-500' : 'bg-blue-600'
              }`}
            />
          </View>

          <Text className="text-slate-500 text-[11px]">
            {progressPercent === 100
              ? '🎉 All required documents have been uploaded for claim processing!'
              : 'Please upload the pending document pages below so the insurance surveyor can approve the claim quickly.'}
          </Text>
        </CustomerCard>
      )}

      {/* ── Document Slots List ── */}
      {claimMode === 'insurance' && (
        <View className="space-y-3">
          {activeSlots.map((slot) => {
            const uploaded = uploads[slot.id]
            const isDone = Boolean(uploaded?.uri)
            const isRejected = uploaded?.status === 'rejected'
            const isVerified = uploaded?.status === 'verified'

            return (
              <CustomerCard
                key={slot.id}
                style={{
                  borderColor: isRejected ? '#fca5a5' : isDone ? '#cbd5e1' : '#fde68a',
                  backgroundColor: isRejected ? '#fffafa' : '#ffffff',
                }}
              >
                <View className="flex-row items-start justify-between gap-2 mb-2">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5 flex-wrap">
                      <Text className="text-slate-900 font-black text-[15px]">{slot.title}</Text>
                      {slot.totalPages && slot.totalPages > 1 && (
                        <View className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                          <Text className="text-slate-700 text-[10px] font-extrabold">
                            Page {slot.pageNumber} of {slot.totalPages}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-blue-700 font-bold text-xs mt-0.5">{slot.slotLabel}</Text>
                    <Text className="text-slate-500 text-[11px] leading-4 mt-1">
                      {slot.description}
                    </Text>
                  </View>

                  {/* Status Badge */}
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: isRejected
                        ? '#fee2e2'
                        : isVerified
                        ? '#d1fae5'
                        : isDone
                        ? '#dcfce7'
                        : '#fef3c7',
                      borderColor: isRejected
                        ? '#fca5a5'
                        : isVerified
                        ? '#6ee7b7'
                        : isDone
                        ? '#86efac'
                        : '#fde68a',
                      borderWidth: 1,
                    }}
                  >
                    <Icon
                      name={isRejected ? 'alert-circle' : isDone ? 'check' : 'clock'}
                      size={12}
                      color={isRejected ? '#dc2626' : isDone ? '#059669' : '#d97706'}
                    />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '900',
                        textTransform: 'uppercase',
                        color: isRejected ? '#991b1b' : isDone ? '#166534' : '#92400e',
                      }}
                    >
                      {isRejected ? 'Rejected' : isVerified ? 'Verified' : isDone ? 'Uploaded' : 'Required'}
                    </Text>
                  </View>
                </View>

                {/* Rejection Alert Banner if this specific doc was rejected */}
                {isRejected && (
                  <View
                    style={{
                      backgroundColor: '#fef2f2',
                      borderColor: '#fecaca',
                      borderWidth: 1,
                      borderRadius: 12,
                      padding: 10,
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Icon name="alert-circle" size={16} color="#dc2626" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#991b1b', fontWeight: '800', fontSize: 11.5 }}>
                        Document Rejected by Workshop
                      </Text>
                      <Text style={{ color: '#b91c1c', fontSize: 10.5, marginTop: 2 }}>
                        {uploaded.rejectionReason || 'Photo is unclear or invalid. Please tap below to re-upload this document.'}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Uploaded File View or Action Button */}
                {isDone ? (
                  <View>
                    <View className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex-row items-center justify-between mt-1">
                      <TouchableOpacity
                        onPress={() => setPreviewUri(uploaded.uri)}
                        className="flex-row items-center flex-1 mr-2"
                      >
                        {uploaded.fileType === 'image' ? (
                          <Image
                            source={{ uri: uploaded.uri }}
                            className="w-12 h-12 rounded-lg bg-slate-200 mr-2.5 border border-slate-300"
                            resizeMode="cover"
                          />
                        ) : (
                          <View className="w-12 h-12 rounded-lg bg-red-100 border border-red-200 items-center justify-center mr-2.5">
                            <Icon name="file-text" size={20} color="#dc2626" />
                          </View>
                        )}
                        <View className="flex-1">
                          <Text className="text-slate-900 font-bold text-xs" numberOfLines={1}>
                            {uploaded.fileName || 'Attached Document'}
                          </Text>
                          <Text className="text-slate-500 text-[10px]">
                            Tap to preview • {new Date(uploaded.uploadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <View className="flex-row items-center gap-1.5">
                        <TouchableOpacity
                          onPress={() => setActiveSlotForAction(slot)}
                          className="p-2 bg-white border border-slate-200 rounded-lg active:bg-slate-100"
                        >
                          <Icon name="rotate-cw" size={14} color="#475569" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleRemove(slot.id)}
                          className="p-2 bg-red-50 border border-red-200 rounded-lg active:bg-red-100"
                        >
                          <Icon name="trash-2" size={14} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Quick Re-upload prompt if rejected */}
                    {isRejected && (
                      <TouchableOpacity
                        onPress={() => setActiveSlotForAction(slot)}
                        style={{
                          marginTop: 6,
                          backgroundColor: '#fee2e2',
                          borderColor: '#f87171',
                          borderWidth: 1,
                          borderRadius: 12,
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <Icon name="camera" size={14} color="#dc2626" />
                        <Text style={{ color: '#991b1b', fontWeight: '800', fontSize: 11.5 }}>
                          📸 Re-upload This Document Only
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setActiveSlotForAction(slot)}
                    activeOpacity={0.8}
                    className="mt-2 bg-blue-50 active:bg-blue-100 border border-dashed border-blue-300 rounded-xl py-2.5 px-3 flex-row items-center justify-center gap-2"
                  >
                    <Icon name="cloud-upload" size={16} color="#2563eb" />
                    <Text className="text-blue-700 font-black text-xs">
                      Take Photo / Upload {slot.slotLabel}
                    </Text>
                  </TouchableOpacity>
                )}
              </CustomerCard>
            )
          })}
        </View>
      )}

      {/* ── Action Modal (Camera / Gallery / PDF) ── */}
      <Modal
        visible={Boolean(activeSlotForAction)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveSlotForAction(null)}
      >
        <Pressable
          onPress={() => setActiveSlotForAction(null)}
          className="flex-1 bg-black/60 items-center justify-end p-4"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-3xl p-5 shadow-2xl border-t-2 border-slate-900"
          >
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <View>
                <Text className="text-slate-900 font-black text-base">
                  Upload {activeSlotForAction?.title}
                </Text>
                <Text className="text-blue-600 font-bold text-xs">
                  {activeSlotForAction?.slotLabel}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveSlotForAction(null)}
                className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
              >
                <Icon name="x" size={16} color="#475569" />
              </TouchableOpacity>
            </View>

            <View className="space-y-2 mb-2">
              {/* Option 1: Camera */}
              <TouchableOpacity
                onPress={() => activeSlotForAction && handleCameraCapture(activeSlotForAction)}
                className="flex-row items-center p-3.5 bg-blue-50 active:bg-blue-100 border border-blue-200 rounded-2xl mb-2"
              >
                <View className="w-10 h-10 rounded-xl bg-blue-600 items-center justify-center mr-3">
                  <Icon name="camera" size={20} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 font-black text-sm">Take Photo with Camera</Text>
                  <Text className="text-slate-500 text-[11px]">Capture clear, well-lit document</Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Gallery */}
              <TouchableOpacity
                onPress={() => activeSlotForAction && handleGalleryPick(activeSlotForAction)}
                className="flex-row items-center p-3.5 bg-slate-50 active:bg-slate-100 border border-slate-200 rounded-2xl mb-2"
              >
                <View className="w-10 h-10 rounded-xl bg-slate-800 items-center justify-center mr-3">
                  <Icon name="image" size={20} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 font-black text-sm">Choose from Photo Gallery</Text>
                  <Text className="text-slate-500 text-[11px]">Select existing image from phone</Text>
                </View>
              </TouchableOpacity>

              {/* Option 3: PDF / Document */}
              <TouchableOpacity
                onPress={() => activeSlotForAction && handleDocPick(activeSlotForAction)}
                className="flex-row items-center p-3.5 bg-slate-50 active:bg-slate-100 border border-slate-200 rounded-2xl"
              >
                <View className="w-10 h-10 rounded-xl bg-slate-800 items-center justify-center mr-3">
                  <Icon name="file-text" size={20} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 font-black text-sm">Upload PDF or Document File</Text>
                  <Text className="text-slate-500 text-[11px]">Browse phone files and downloads</Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Document Full Preview Modal ── */}
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
    </CustomerScreen>
  )
}
