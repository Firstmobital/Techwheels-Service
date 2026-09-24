import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { useFocusEffect, useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { Icon } from '../../components/ui/Icon'
import { ClaimFormWidget } from '../../components/ClaimFormWidget'
import { matchInsuranceProviderId } from '../../config/insuranceProviders'
import {
  customerListBodyshopAssets,
  customerUploadBodyshopAsset,
  type CustomerBodyshopAsset,
} from '../../lib/api/customerBodyshopUploads'
import { customerGetRepairCard } from '../../lib/api/customerPortal'

type ClaimMode = 'insurance' | 'cash'
type OwnershipType = 'individual' | 'firm'
type DamageSeverity = 'standard' | 'major'

type RequiredDocument = {
  docKey: string
  title: string
  subtitle: string
  required: boolean
  condition?: 'firm' | 'major'
  hint: string
}

type DamagePhotoSlot = {
  id: string
  title: string
  hint: string
}

const REQUIRED_DOCUMENTS: RequiredDocument[] = [
  { docKey: 'doc_rc', title: 'Registration Certificate (RC)', subtitle: 'Vehicle ownership proof', required: true, hint: 'Upload clear RC front/back or a PDF copy.' },
  { docKey: 'doc_insurance', title: 'Insurance Policy Copy', subtitle: 'Current policy schedule', required: true, hint: 'Upload the current insurance policy PDF or clear photos.' },
  { docKey: 'doc_dl', title: 'Driving Licence', subtitle: 'Driver at time of accident', required: true, hint: 'Upload front and back of the valid driving licence.' },
  { docKey: 'doc_claim_form', title: 'Insurance Claim Form', subtitle: 'Signed claim declaration', required: true, hint: 'Upload the filled and signed insurer claim form.' },
  { docKey: 'doc_aadhaar', title: 'Aadhaar / Identity Proof', subtitle: 'KYC identity proof', required: true, hint: 'Upload a clear Aadhaar or accepted identity proof.' },
  { docKey: 'doc_pan', title: 'PAN Card', subtitle: 'Customer PAN', required: true, hint: 'Upload a clear PAN card image.' },
  { docKey: 'doc_bank_detail', title: 'Bank Details / Cancelled Cheque', subtitle: 'If required by insurer', required: true, hint: 'Upload cancelled cheque or bank detail proof.' },
  { docKey: 'doc_gst', title: 'GST Registration Certificate', subtitle: 'For firm/company vehicles', required: true, condition: 'firm', hint: 'Required when the vehicle is registered to a firm/company.' },
  { docKey: 'doc_company_pan', title: 'Company PAN', subtitle: 'For firm/company vehicles', required: true, condition: 'firm', hint: 'Required when the vehicle is registered to a firm/company.' },
  { docKey: 'doc_kyc', title: 'KYC Form', subtitle: 'For major/insurer-specific cases', required: true, condition: 'major', hint: 'Upload completed KYC if requested for the claim.' },
  { docKey: 'doc_tp_affidavit', title: 'T/P Affidavit / Undertaking', subtitle: 'For major/third-party cases', required: true, condition: 'major', hint: 'Upload notarized undertaking when applicable.' },
]

const DAMAGE_PHOTOS: DamagePhotoSlot[] = [
  { id: 'front', title: 'Front View', hint: 'Full front side of the vehicle' },
  { id: 'rear', title: 'Rear View', hint: 'Full rear side of the vehicle' },
  { id: 'left', title: 'Left Side', hint: 'Full left profile' },
  { id: 'right', title: 'Right Side', hint: 'Full right profile' },
  { id: 'close', title: 'Damage Close-up', hint: 'Clear close photo of damaged area' },
]

function fileNameForPhoto(slot: DamagePhotoSlot) {
  return `customer_${slot.id}_${Date.now()}.jpg`
}

function assetMatchesPhoto(asset: CustomerBodyshopAsset, slot: DamagePhotoSlot) {
  return String(asset.file_name || '').toLowerCase().includes(`customer_${slot.id}_`)
}

export default function CustomerDocumentsScreen() {
  const router = useRouter()
  const { token, selectedReg } = useCustomerSession()
  const [repairCard, setRepairCard] = useState<Record<string, unknown> | null>(null)
  const [assets, setAssets] = useState<{ documents: CustomerBodyshopAsset[]; photos: CustomerBodyshopAsset[] }>({
    documents: [],
    photos: [],
  })
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [claimMode, setClaimMode] = useState<ClaimMode>('insurance')
  const [ownershipType, setOwnershipType] = useState<OwnershipType>('individual')
  const [damageSeverity, setDamageSeverity] = useState<DamageSeverity>('standard')
  const [actionDoc, setActionDoc] = useState<RequiredDocument | null>(null)
  const [actionPhoto, setActionPhoto] = useState<DamagePhotoSlot | null>(null)

  const load = useCallback(async () => {
    if (!token || !selectedReg) return
    setLoading(true)
    try {
      const [card, uploaded] = await Promise.all([
        customerGetRepairCard(token, selectedReg),
        customerListBodyshopAssets(token, selectedReg),
      ])
      setRepairCard(card)
      setAssets(uploaded)
      const cardType = String(card?.customer_type || '').toLowerCase()
      setOwnershipType(cardType.includes('firm') || cardType.includes('company') ? 'firm' : 'individual')
      const insured = Boolean(card?.insurance_company || card?.insurance_policy_no || card?.claim_intimation_no)
      setClaimMode(insured ? 'insurance' : 'cash')
      const major = String(card?.additional_approval || '').toLowerCase().includes('major')
      setDamageSeverity(major ? 'major' : 'standard')
    } catch (error) {
      Alert.alert('Unable to load documents', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg])

  useEffect(() => {
    void load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const activeDocs = useMemo(() => {
    if (claimMode === 'cash') return []
    return REQUIRED_DOCUMENTS.filter((doc) => {
      if (doc.condition === 'firm') return ownershipType === 'firm'
      if (doc.condition === 'major') return damageSeverity === 'major'
      return true
    })
  }, [claimMode, ownershipType, damageSeverity])

  const uploadedDocKeys = useMemo(() => {
    return new Set(assets.documents.map((item) => String(item.doc_key || '')))
  }, [assets.documents])

  const requiredDone = activeDocs.filter((doc) => uploadedDocKeys.has(doc.docKey)).length
  const requiredTotal = activeDocs.length
  const photoDone = DAMAGE_PHOTOS.filter((slot) => assets.photos.some((asset) => assetMatchesPhoto(asset, slot))).length
  const everythingReady = claimMode === 'cash' || (requiredTotal > 0 && requiredDone === requiredTotal)
  const overallPercent = requiredTotal > 0 ? Math.round((requiredDone / requiredTotal) * 100) : 100

  const uploadPickedFile = async (
    kind: 'document' | 'photo',
    uri: string,
    fileName: string,
    contentType: string,
    docKey?: string
  ) => {
    if (!token || !selectedReg) return
    const key = kind === 'document' ? String(docKey) : fileName
    setUploadingKey(key)
    try {
      await customerUploadBodyshopAsset({
        sessionToken: token,
        regNumber: selectedReg,
        kind,
        docKey,
        uri,
        fileName,
        contentType,
      })
      await load()
      Alert.alert('Uploaded', kind === 'document' ? 'Document added to your bodyshop case.' : 'Damage photo added to your bodyshop case.')
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setUploadingKey(null)
      setActionDoc(null)
      setActionPhoto(null)
    }
  }

  const captureDocument = async (doc: RequiredDocument) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (perm.status !== 'granted') {
      Alert.alert('Camera permission required', 'Please allow camera access to photograph documents.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
      allowsEditing: true,
    })
    if (!result.canceled && result.assets[0]?.uri) {
      await uploadPickedFile('document', result.assets[0].uri, `${doc.docKey}_${Date.now()}.jpg`, 'image/jpeg', doc.docKey)
    }
  }

  const chooseDocumentPhoto = async (doc: RequiredDocument) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (perm.status !== 'granted') {
      Alert.alert('Photos permission required', 'Please allow photo library access.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    })
    if (!result.canceled && result.assets[0]?.uri) {
      await uploadPickedFile(
        'document',
        result.assets[0].uri,
        result.assets[0].fileName || `${doc.docKey}_${Date.now()}.jpg`,
        result.assets[0].mimeType || 'image/jpeg',
        doc.docKey
      )
    }
  }

  const chooseDocumentFile = async (doc: RequiredDocument) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    })
    if (!result.canceled && result.assets[0]?.uri) {
      const item = result.assets[0]
      await uploadPickedFile(
        'document',
        item.uri,
        item.name || `${doc.docKey}_${Date.now()}`,
        item.mimeType || 'application/octet-stream',
        doc.docKey
      )
    }
  }

  const captureDamagePhoto = async (slot: DamagePhotoSlot) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (perm.status !== 'granted') {
      Alert.alert('Camera permission required', 'Please allow camera access to photograph vehicle damage.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
      allowsEditing: false,
    })
    if (!result.canceled && result.assets[0]?.uri) {
      await uploadPickedFile('photo', result.assets[0].uri, fileNameForPhoto(slot), 'image/jpeg')
    }
  }

  const chooseDamagePhoto = async (slot: DamagePhotoSlot) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (perm.status !== 'granted') {
      Alert.alert('Photos permission required', 'Please allow photo library access.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    })
    if (!result.canceled && result.assets[0]?.uri) {
      await uploadPickedFile('photo', result.assets[0].uri, fileNameForPhoto(slot), result.assets[0].mimeType || 'image/jpeg')
    }
  }

  const latestDocument = (docKey: string) => assets.documents.find((item) => item.doc_key === docKey)

  return (
    <CustomerScreen
      title="Needed from you"
      subtitle="Complete customer-side requirements for your accidental repair"
      showBackButton
    >
      {loading ? (
        <View style={{ paddingVertical: 48, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#0B5FFF" />
          <Text style={{ marginTop: 12, color: '#64748b', fontWeight: '700' }}>Loading your bodyshop case…</Text>
        </View>
      ) : (
        <>
          <View style={{ backgroundColor: '#062B62', borderRadius: 22, padding: 18, marginBottom: 14 }}>
            <Text style={{ color: '#8EC5FF', fontSize: 11, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' }}>
              Accidental Repair • Customer Self-Service
            </Text>
            <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '900', marginTop: 4 }}>
              Needed from you
            </Text>
            <Text style={{ color: '#DCEBFF', fontSize: 13, lineHeight: 19, marginTop: 5 }}>
              Upload the documents and damage photos you already have. Your bodyshop team can immediately use them in the same repair case.
            </Text>

            <View style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 14, padding: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>Required documents</Text>
                <Text style={{ color: '#8EC5FF', fontWeight: '900', fontSize: 12 }}>{requiredDone}/{requiredTotal || 0}</Text>
              </View>
              <View style={{ height: 7, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${Math.max(4, overallPercent)}%`, backgroundColor: '#55C2FF', borderRadius: 99 }} />
              </View>
              <Text style={{ color: '#DCEBFF', fontSize: 11, marginTop: 8 }}>
                Damage photos: {photoDone}/{DAMAGE_PHOTOS.length} • Job Card: {String(repairCard?.job_card_no || 'Pending')}
              </Text>
            </View>
          </View>

          <CustomerCard style={{ backgroundColor: '#ffffff', borderColor: '#D9E5F5' }}>
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '900', marginBottom: 10 }}>Claim setup</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: claimMode === 'insurance' ? 12 : 0 }}>
              <Choice label="Insurance / Cashless" active={claimMode === 'insurance'} onPress={() => setClaimMode('insurance')} />
              <Choice label="Cash Repair" active={claimMode === 'cash'} onPress={() => setClaimMode('cash')} />
            </View>
            {claimMode === 'insurance' ? (
              <>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '800', marginBottom: 7 }}>REGISTERED OWNER</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <Choice label="Individual" active={ownershipType === 'individual'} onPress={() => setOwnershipType('individual')} />
                  <Choice label="Firm / Company" active={ownershipType === 'firm'} onPress={() => setOwnershipType('firm')} />
                </View>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '800', marginBottom: 7 }}>CASE TYPE</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Choice label="Standard" active={damageSeverity === 'standard'} onPress={() => setDamageSeverity('standard')} />
                  <Choice label="Major / T.P." active={damageSeverity === 'major'} onPress={() => setDamageSeverity('major')} />
                </View>
              </>
            ) : null}
          </CustomerCard>

          {claimMode === 'insurance' ? (
            <ClaimFormWidget userInsurerId={matchInsuranceProviderId(String(repairCard?.insurance_company || ''))} />
          ) : null}

          {claimMode === 'insurance' ? (
            <CustomerCard style={{ backgroundColor: '#ffffff', borderColor: '#D9E5F5' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '900' }}>Required documents</Text>
                <View style={{ backgroundColor: everythingReady ? '#DCFCE7' : '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
                  <Text style={{ color: everythingReady ? '#166534' : '#1D4ED8', fontSize: 11, fontWeight: '900' }}>
                    {everythingReady ? 'Complete' : `${requiredTotal - requiredDone} pending`}
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
                Tap any pending item and choose Camera, Gallery or Files. Documents uploaded by your workshop also appear here automatically.
              </Text>

              {activeDocs.map((doc) => {
                const uploaded = latestDocument(doc.docKey)
                const busy = uploadingKey === doc.docKey
                return (
                  <TouchableOpacity
                    key={doc.docKey}
                    activeOpacity={0.8}
                    onPress={() => uploaded?.view_url ? void Linking.openURL(String(uploaded.view_url)) : setActionDoc(doc)}
                    style={{
                      borderWidth: 1,
                      borderColor: uploaded ? '#BBF7D0' : '#D9E5F5',
                      backgroundColor: uploaded ? '#F0FDF4' : '#F8FBFF',
                      borderRadius: 15,
                      padding: 13,
                      marginBottom: 9,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: uploaded ? '#DCFCE7' : '#E8F1FF', marginRight: 11 }}>
                      {busy ? <ActivityIndicator color="#0B5FFF" /> : <Icon name={uploaded ? 'check-circle' : 'file-text'} size={20} color={uploaded ? '#16A34A' : '#0B5FFF'} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontSize: 13.5, fontWeight: '900' }}>{doc.title}</Text>
                      <Text style={{ color: '#64748b', fontSize: 11.5, marginTop: 2 }}>{uploaded ? `Uploaded • ${uploaded.uploaded_by || 'Workshop/Customer'}` : doc.subtitle}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                      <Text style={{ color: uploaded ? '#16A34A' : '#DC2626', fontSize: 10.5, fontWeight: '900' }}>
                        {uploaded ? 'VIEW' : 'REQUIRED'}
                      </Text>
                      <Icon name="chevron-right" size={16} color="#94A3B8" />
                    </View>
                  </TouchableOpacity>
                )
              })}
            </CustomerCard>
          ) : (
            <CustomerCard style={{ backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }}>
              <Text style={{ color: '#166534', fontWeight: '900', fontSize: 15 }}>Cash repair selected</Text>
              <Text style={{ color: '#15803D', fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                Insurance claim paperwork is not required. Please upload damage photos so your bodyshop team can keep the case visual record complete.
              </Text>
            </CustomerCard>
          )}

          <CustomerCard style={{ backgroundColor: '#ffffff', borderColor: '#D9E5F5' }}>
            <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '900' }}>Damage photos</Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginTop: 3, marginBottom: 12 }}>
              These photos go directly into the same bodyshop repair record used by your workshop team.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {DAMAGE_PHOTOS.map((slot) => {
                const uploaded = assets.photos.find((asset) => assetMatchesPhoto(asset, slot))
                const busy = uploadingKey?.includes(`customer_${slot.id}_`) || false
                return (
                  <TouchableOpacity
                    key={slot.id}
                    onPress={() => uploaded?.view_url ? void Linking.openURL(String(uploaded.view_url)) : setActionPhoto(slot)}
                    activeOpacity={0.8}
                    style={{
                      width: '47.5%',
                      minHeight: 142,
                      borderWidth: 1,
                      borderStyle: uploaded ? 'solid' : 'dashed',
                      borderColor: uploaded ? '#93C5FD' : '#B8C7DA',
                      borderRadius: 15,
                      overflow: 'hidden',
                      backgroundColor: '#F8FBFF',
                    }}
                  >
                    {uploaded?.view_url ? (
                      <Image source={{ uri: String(uploaded.view_url) }} style={{ width: '100%', height: 88 }} resizeMode="cover" />
                    ) : (
                      <View style={{ height: 88, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF5FF' }}>
                        {busy ? <ActivityIndicator color="#0B5FFF" /> : <Icon name="camera" size={26} color="#0B5FFF" />}
                      </View>
                    )}
                    <View style={{ padding: 9 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 12 }}>{slot.title}</Text>
                      <Text style={{ color: uploaded ? '#16A34A' : '#64748b', fontSize: 10.5, marginTop: 2 }}>
                        {uploaded ? 'Uploaded • tap to view' : slot.hint}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </CustomerCard>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <TouchableOpacity
              onPress={() => router.push('/(customer)/tracker')}
              style={{ flex: 1, borderRadius: 15, borderWidth: 1.5, borderColor: '#0B5FFF', paddingVertical: 13, alignItems: 'center', backgroundColor: '#ffffff' }}
            >
              <Text style={{ color: '#0B5FFF', fontWeight: '900' }}>View 18-Stage Tracker</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(customer)/estimate')}
              style={{ flex: 1, borderRadius: 15, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0B5FFF' }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '900' }}>Estimate & Approval</Text>
            </TouchableOpacity>
          </View>

          <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 15, padding: 13, marginBottom: 12 }}>
            <Text style={{ color: '#1E3A8A', fontSize: 12.5, fontWeight: '900' }}>One shared bodyshop case</Text>
            <Text style={{ color: '#1D4ED8', fontSize: 11.5, lineHeight: 17, marginTop: 4 }}>
              Customer uploads, workshop documents, estimate approvals, survey updates, floor repair, QC, billing, DO and delivery all remain connected to the same repair card.
            </Text>
          </View>
        </>
      )}

      <UploadChoiceModal
        visible={Boolean(actionDoc)}
        title={actionDoc?.title || 'Upload document'}
        description={actionDoc?.hint || ''}
        onClose={() => setActionDoc(null)}
        onCamera={() => actionDoc && void captureDocument(actionDoc)}
        onGallery={() => actionDoc && void chooseDocumentPhoto(actionDoc)}
        onFiles={() => actionDoc && void chooseDocumentFile(actionDoc)}
      />

      <PhotoChoiceModal
        visible={Boolean(actionPhoto)}
        title={actionPhoto?.title || 'Damage photo'}
        onClose={() => setActionPhoto(null)}
        onCamera={() => actionPhoto && void captureDamagePhoto(actionPhoto)}
        onGallery={() => actionPhoto && void chooseDamagePhoto(actionPhoto)}
      />
    </CustomerScreen>
  )
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 42,
        borderRadius: 12,
        borderWidth: 1.3,
        borderColor: active ? '#0B5FFF' : '#CBD5E1',
        backgroundColor: active ? '#E8F1FF' : '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
      }}
    >
      <Text style={{ color: active ? '#0B5FFF' : '#334155', fontWeight: '900', fontSize: 11.5, textAlign: 'center' }}>{label}</Text>
    </TouchableOpacity>
  )
}

function UploadChoiceModal({
  visible,
  title,
  description,
  onClose,
  onCamera,
  onGallery,
  onFiles,
}: {
  visible: boolean
  title: string
  description: string
  onClose: () => void
  onCamera: () => void
  onGallery: () => void
  onFiles: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2, 17, 38, 0.70)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 }}>
          <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>{title}</Text>
          <Text style={{ color: '#64748b', fontSize: 12.5, lineHeight: 18, marginTop: 5, marginBottom: 16 }}>{description}</Text>
          <UploadOption icon="camera" title="Take photo" subtitle="Use your phone camera" onPress={onCamera} />
          <UploadOption icon="image" title="Choose from gallery" subtitle="Select an existing photo" onPress={onGallery} />
          <UploadOption icon="file-text" title="Choose from Files" subtitle="Upload PDF or image file" onPress={onFiles} />
          <TouchableOpacity onPress={onClose} style={{ marginTop: 6, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: '#64748b', fontWeight: '800' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function PhotoChoiceModal({
  visible,
  title,
  onClose,
  onCamera,
  onGallery,
}: {
  visible: boolean
  title: string
  onClose: () => void
  onCamera: () => void
  onGallery: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2, 17, 38, 0.70)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 }}>
          <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>{title}</Text>
          <Text style={{ color: '#64748b', fontSize: 12.5, marginTop: 5, marginBottom: 16 }}>Keep the vehicle and damaged area clearly visible.</Text>
          <UploadOption icon="camera" title="Take photo" subtitle="Capture a fresh damage photo" onPress={onCamera} />
          <UploadOption icon="image" title="Choose from gallery" subtitle="Select an existing damage photo" onPress={onGallery} />
          <TouchableOpacity onPress={onClose} style={{ marginTop: 6, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: '#64748b', fontWeight: '800' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function UploadOption({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: 'camera' | 'image' | 'file-text'
  title: string
  subtitle: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D9E5F5',
        backgroundColor: '#F8FBFF',
        borderRadius: 15,
        padding: 13,
        marginBottom: 9,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F1FF', alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
        <Icon name={icon} size={20} color="#0B5FFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 13 }}>{title}</Text>
        <Text style={{ color: '#64748b', fontSize: 11.5, marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Icon name="chevron-right" size={17} color="#94A3B8" />
    </TouchableOpacity>
  )
}
