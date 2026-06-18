import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import {
  getJobCardSummary,
  updateJobCardStatus,
} from '../../../lib/api/jobCards'
import { listEstimateRows } from '../../../lib/api/estimate'
import { listPanelPhotos } from '../../../lib/api/photos'
import { listPanels } from '../../../lib/api/panels'
import {
  listDocuments,
  uploadDocumentFile,
} from '../../../lib/api/documents'
import type { DocumentRow } from '../../../lib/api/types'
import { generateRepairPPT } from '../../../lib/generators/generatePPT'
import { generateEstimateCsv } from '../../../lib/generators/generateEstimateCsv'
import {
  generateClaimEmailContent,
  sendClaimEmail,
  type EmailAttachmentRef,
} from '../../../lib/api/email'
import { AUTODOC_BUCKET } from '../../../lib/autodocStorage'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '../../../components/ui/Icon'

type Params = {
  id?: string | string[]
  jcNumber?: string | string[]
  regNumber?: string | string[]
}

type BusyAction =
  | 'pre-ppt'
  | 'excel'
  | 'compose-send'
  | 'post-ppt'
  | 'submit-claim'
  | null

function storageFileName(path: string, fallback: string): string {
  const last = path.split('/').pop()?.trim()
  return last && last.length > 0 ? last : fallback
}

function buildAttachment(doc: DocumentRow, fallbackName: string): EmailAttachmentRef {
  return {
    filename: storageFileName(doc.storage_path, fallbackName),
    storagePath: doc.storage_path,
    bucket: AUTODOC_BUCKET,
    driveFileId: doc.drive_file_id,
    driveUrl: doc.drive_url,
  }
}

export default function SubmitStageScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id, jcNumber, regNumber } = useLocalSearchParams<Params>()
  const jobCardId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id])
  const jobCardNumberHint = useMemo(() => (Array.isArray(jcNumber) ? jcNumber[0] : jcNumber), [jcNumber])
  const regNumberHint = useMemo(() => (Array.isArray(regNumber) ? regNumber[0] : regNumber), [regNumber])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [jobCard, setJobCard] = useState<any>(null)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [warning, setWarning] = useState<string | null>(null)
  const [estimateRowsCount, setEstimateRowsCount] = useState(0)
  const [preRepairPhotoCount, setPreRepairPhotoCount] = useState(0)
  const [underRepairPhotoCount, setUnderRepairPhotoCount] = useState(0)
  const [postRepairPhotoCount, setPostRepairPhotoCount] = useState(0)
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([])
  const [underRepairPanelIds, setUnderRepairPanelIds] = useState<string[]>([])
  const [postRepairPanelIds, setPostRepairPanelIds] = useState<string[]>([])

  const loadSubmitData = async () => {
    if (!jobCardId) {
      setError('Missing job card id')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setWarning(null)

    const [jobRes, docsRes, estimateRes, photosRes, panelsRes] = await Promise.all([
      getJobCardSummary(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listDocuments(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listEstimateRows(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      listPanelPhotos(jobCardId),
      listPanels(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
    ])

    const nonBlockingWarnings: string[] = []
    if (jobRes.error || !jobRes.data) {
      nonBlockingWarnings.push(`Job summary unavailable: ${jobRes.error ?? 'not found'}`)
    }
    if (docsRes.error) nonBlockingWarnings.push(`Documents unavailable: ${docsRes.error}`)
    if (estimateRes.error) nonBlockingWarnings.push(`Estimate rows unavailable: ${estimateRes.error}`)
    if (photosRes.error) nonBlockingWarnings.push(`Photos unavailable: ${photosRes.error}`)
    if (panelsRes.error) nonBlockingWarnings.push(`Panels unavailable: ${panelsRes.error}`)

    setJobCard(jobRes.data ?? {
      job_card_id: jobCardId,
      jc_number: String(jobCardId),
      reg_number: null,
      model: null,
      colour: null,
      complaint_date: new Date().toISOString(),
      dealer_name: null,
      total_estimate_amount: 0,
    })
    setDocuments(docsRes.error ? [] : (docsRes.data ?? []))
    setEstimateRowsCount(estimateRes.error ? 0 : (estimateRes.data ?? []).length)

    const photos = photosRes.error ? [] : (photosRes.data ?? [])
    let pre = 0
    let under = 0
    let post = 0
    const underRepairPanelSet = new Set<string>()
    const postRepairPanelSet = new Set<string>()
    for (const photo of photos) {
      const stage = String((photo as any).repair_stage ?? '').trim().toLowerCase()
      const panelId = String((photo as any).panel_id ?? '').trim()
      if (stage === 'pre-repair') pre += 1
      if (stage === 'under-repair') {
        under += 1
        if (panelId) underRepairPanelSet.add(panelId)
      }
      if (stage === 'post-repair') {
        post += 1
        if (panelId) postRepairPanelSet.add(panelId)
      }
    }

    const panels = panelsRes.error ? [] : (panelsRes.data ?? [])
    const selectedIds = panels
      .map((panel) => String(panel.id ?? '').trim())
      .filter((idValue) => idValue.length > 0)

    setPreRepairPhotoCount(pre)
    setUnderRepairPhotoCount(under)
    setPostRepairPhotoCount(post)
    setSelectedPanelIds(selectedIds)
    setUnderRepairPanelIds(Array.from(underRepairPanelSet))
    setPostRepairPanelIds(Array.from(postRepairPanelSet))
    setWarning(nonBlockingWarnings.length > 0 ? nonBlockingWarnings.join(' | ') : null)

    setLoading(false)
  }

  useFocusEffect(
    useCallback(() => {
      void loadSubmitData()
    }, [jobCardId]),
  )

  const docsByType = useMemo(() => {
    const map = new Map<string, DocumentRow>()
    for (const doc of documents) {
      if (!map.has(doc.doc_type)) map.set(doc.doc_type, doc)
    }
    return map
  }, [documents])

  const prePptDoc = docsByType.get('ppt_pre')
  const postPptDoc = docsByType.get('ppt_post')
  const excelDoc = docsByType.get('excel_estimate')
  const walkaroundDoc = docsByType.get('video_job_card')
  const deliveryDoc = docsByType.get('video_delivery')

  const composeReady = Boolean(prePptDoc && excelDoc && walkaroundDoc)
  const submitReady = Boolean(postPptDoc)
  const underRepairReady = useMemo(() => {
    if (selectedPanelIds.length === 0) return false
    const covered = new Set(underRepairPanelIds)
    return selectedPanelIds.every((panelId) => covered.has(panelId))
  }, [selectedPanelIds, underRepairPanelIds])

  const postRepairReady = useMemo(() => {
    if (selectedPanelIds.length === 0) return false
    const covered = new Set(postRepairPanelIds)
    return selectedPanelIds.every((panelId) => covered.has(panelId))
  }, [postRepairPanelIds, selectedPanelIds])

  const finalPhotoStagesReady = underRepairReady && postRepairReady

  const missingUnderRepairPanelsCount = Math.max(selectedPanelIds.length - underRepairPanelIds.length, 0)
  const missingPostRepairPanelsCount = Math.max(selectedPanelIds.length - postRepairPanelIds.length, 0)
  const preSubmitSubmitted = useMemo(() => {
    const status = String(jobCard?.status ?? '').trim().toLowerCase()
    return status === 'submitted' || status === 'completed'
  }, [jobCard?.status])

  const preSubmitFollowUpMode = useMemo<'under-repair' | 'post-repair' | 'done'>(() => {
    if (!underRepairReady) return 'under-repair'
    if (!postRepairReady) return 'post-repair'
    return 'done'
  }, [postRepairReady, underRepairReady])
  const completionScore = [
    prePptDoc,
    excelDoc,
    walkaroundDoc,
    postPptDoc,
  ].filter(Boolean).length

  const checklistItems = useMemo(() => ([
    { label: 'Pre-repair photos', ok: preRepairPhotoCount > 0, val: `${preRepairPhotoCount} captured` },
    { label: 'Post-repair photos', ok: postRepairPhotoCount > 0, val: postRepairPhotoCount > 0 ? `${postRepairPhotoCount} captured` : 'Missing' },
    { label: 'Estimate rows', ok: estimateRowsCount > 0, val: `${estimateRowsCount} panels` },
    { label: 'Pre-Repair PPT', ok: !!prePptDoc, val: prePptDoc ? 'Uploaded' : 'Missing' },
    { label: 'Estimate Excel', ok: !!excelDoc, val: excelDoc ? 'Uploaded' : 'Missing' },
    { label: 'Walkaround video', ok: !!walkaroundDoc, val: walkaroundDoc ? 'Uploaded' : 'Missing' },
    { label: 'Post-Repair PPT', ok: !!postPptDoc, val: postPptDoc ? 'Uploaded' : 'Missing' },
  ]), [estimateRowsCount, excelDoc, postPptDoc, postRepairPhotoCount, prePptDoc, preRepairPhotoCount, walkaroundDoc])

  const checklistReadyCount = checklistItems.filter((item) => item.ok).length

  const stageIndex = useMemo(() => {
    const status = String(jobCard?.status ?? '').trim().toLowerCase()
    if (status === 'completed') return 4
    return 3
  }, [jobCard?.status])

  const stageLabels = ['Intake', 'Document', 'Estimate', 'Pre-Submit', 'Submit']

  const statusPill = useMemo(() => {
    const status = String(jobCard?.status ?? '').trim().toLowerCase()
    if (status === 'completed') return { text: 'Completed', bg: '#e4f4ec', border: '#bfe6d2', dot: '#1c8f63', textColor: '#1c8f63' }
    if (status === 'submitted') return { text: 'Submitted', bg: '#e4f4ec', border: '#bfe6d2', dot: '#1c8f63', textColor: '#1c8f63' }
    return { text: 'Awaiting Approval', bg: '#fbefdd', border: '#e3ceb0', dot: '#c9751b', textColor: '#c9751b' }
  }, [jobCard?.status])

  const handleGeneratePpt = async (type: 'pre-repair' | 'post-repair') => {
    if (!jobCardId) return

    if (type === 'post-repair' && !finalPhotoStagesReady) {
      Alert.alert('Missing Photos', 'Upload under-repair and post-repair photos for every selected panel before generating Post-Repair PPT.')
      return
    }

    setBusy(type === 'pre-repair' ? 'pre-ppt' : 'post-ppt')

    try {
      const regSlug = String(jobCard?.reg_number ?? jobCardId).replace(/\s+/g, '_')
      const fileName = `${type === 'pre-repair' ? 'pre' : 'post'}_repair_${regSlug}.pptx`
      const blob = await generateRepairPPT(jobCardId, type, { download: false, fileName })

      const uploadRes = await uploadDocumentFile({
        jobCardId,
        docType: type === 'pre-repair' ? 'ppt_pre' : 'ppt_post',
        file: blob,
        fileName,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })

      if (uploadRes.error) {
        Alert.alert('Upload Failed', uploadRes.error)
        return
      }

      Alert.alert('Generated', `${type === 'pre-repair' ? 'Pre-repair' : 'Post-repair'} PPT generated and uploaded.`)
      await loadSubmitData()
    } catch (err: any) {
      Alert.alert('Generate Failed', err?.message ?? 'Unable to generate PPT')
    } finally {
      setBusy(null)
    }
  }

  const handleExportEstimate = async () => {
    if (!jobCardId) return

    setBusy('excel')

    try {
      const regSlug = String(jobCard?.reg_number ?? jobCardId).replace(/\s+/g, '_')
      const fileName = `estimate_${regSlug}.csv`
      const blob = await generateEstimateCsv(jobCardId)

      const uploadRes = await uploadDocumentFile({
        jobCardId,
        docType: 'excel_estimate',
        file: blob,
        fileName,
        contentType: 'text/csv',
      })

      if (uploadRes.error) {
        Alert.alert('Upload Failed', uploadRes.error)
        return
      }

      Alert.alert('Generated', 'Estimate Excel generated and uploaded.')
      await loadSubmitData()
    } catch (err: any) {
      Alert.alert('Generate Failed', err?.message ?? 'Unable to generate estimate excel')
    } finally {
      setBusy(null)
    }
  }

  const handleComposeAndSend = async () => {
    if (!jobCardId || !jobCard) return

    if (!composeReady) {
      Alert.alert('Missing Attachments', 'Pre-Repair PPT, Estimate Excel, and Walkaround Video are required before Compose & Send.')
      return
    }

    setBusy('compose-send')

    try {
      const content = generateClaimEmailContent({
        jc_number: String(jobCard.jc_number ?? 'JC-NA'),
        reg_number: String(jobCard.reg_number ?? 'REG-NA'),
        model: jobCard.model ?? null,
        colour: jobCard.colour ?? null,
        complaint_date: String(jobCard.complaint_date ?? new Date().toISOString()),
        dealer_name: jobCard.dealer_name ?? null,
        total_estimate_amount: Number(jobCard.total_estimate_amount ?? 0),
      })

      const attachments: EmailAttachmentRef[] = []
      
      // Only include attachments with non-zero file size
      if (prePptDoc && (prePptDoc.file_size_mb ?? 0) > 0) {
        attachments.push(buildAttachment(prePptDoc, 'pre-repair.pptx'))
      }
      if (excelDoc && (excelDoc.file_size_mb ?? 0) > 0) {
        attachments.push(buildAttachment(excelDoc, 'estimate.xlsx'))
      }
      if (walkaroundDoc && (walkaroundDoc.file_size_mb ?? 0) > 0) {
        attachments.push(buildAttachment(walkaroundDoc, 'vehicle-walkaround.mp4'))
      }

      const targetEmail = 'vinodexodus@gmail.com'
      const sendRes = await sendClaimEmail(jobCardId, {
        to: targetEmail,
        subject: content.subject,
        html: content.html,
        attachments,
      })

      if (sendRes.error) {
        Alert.alert('Send Failed', sendRes.error)
        return
      }

      const statusRes = await updateJobCardStatus(jobCardId, 'submitted')
      if (statusRes.error) {
        Alert.alert('Status Update Failed', statusRes.error)
        return
      }

      Alert.alert('Email Sent', 'Claim email sent and status updated to submitted.')
      await loadSubmitData()
    } catch (err: any) {
      Alert.alert('Send Failed', err?.message ?? 'Unable to send claim email')
    } finally {
      setBusy(null)
    }
  }

  const handleSubmitClaim = async () => {
    if (!jobCardId || !jobCard) return

    if (!submitReady) {
      Alert.alert('Missing Post-Repair PPT', 'Generate post-repair PPT before final submit.')
      return
    }

    setBusy('submit-claim')

    try {
      const content = generateClaimEmailContent({
        jc_number: String(jobCard.jc_number ?? 'JC-NA'),
        reg_number: String(jobCard.reg_number ?? 'REG-NA'),
        model: jobCard.model ?? null,
        colour: jobCard.colour ?? null,
        complaint_date: String(jobCard.complaint_date ?? new Date().toISOString()),
        dealer_name: jobCard.dealer_name ?? null,
        total_estimate_amount: Number(jobCard.total_estimate_amount ?? 0),
      })

      const attachments: EmailAttachmentRef[] = []
      
      // Only include attachments with non-zero file size
      if (postPptDoc && (postPptDoc.file_size_mb ?? 0) > 0) {
        attachments.push(buildAttachment(postPptDoc, 'post-repair.pptx'))
      }
      if (excelDoc && (excelDoc.file_size_mb ?? 0) > 0) {
        attachments.push(buildAttachment(excelDoc, 'estimate.xlsx'))
      }
      if (prePptDoc && (prePptDoc.file_size_mb ?? 0) > 0) {
        attachments.push(buildAttachment(prePptDoc, 'pre-repair.pptx'))
      }
      if (deliveryDoc && (deliveryDoc.file_size_mb ?? 0) > 0) {
        attachments.push(buildAttachment(deliveryDoc, 'delivery-video.mp4'))
      }

      const targetEmail = 'vinodexodus@gmail.com'
      const sendRes = await sendClaimEmail(jobCardId, {
        to: targetEmail,
        subject: `[POST-REPAIR] ${content.subject}`,
        html: content.html,
        attachments,
      })

      if (sendRes.error) {
        Alert.alert('Send Failed', sendRes.error)
        return
      }

      const statusRes = await updateJobCardStatus(jobCardId, 'completed')
      if (statusRes.error) {
        Alert.alert('Status Update Failed', statusRes.error)
        return
      }

      Alert.alert('Claim Submitted', 'Post-repair claim email sent and job card marked completed.')
      await loadSubmitData()
    } catch (err: any) {
      Alert.alert('Submit Failed', err?.message ?? 'Unable to complete submit stage')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView className="flex-1" style={{ backgroundColor: '#f6f4ee' }} contentContainerStyle={{ paddingBottom: 32 }}>
        <SafeAreaView
          edges={['top']}
          style={{
            backgroundColor: '#ffffff',
            borderBottomWidth: 1,
            borderBottomColor: '#e7e3d9',
            paddingHorizontal: 16,
            paddingTop: Math.max(insets.top > 0 ? 8 : 18, 8),
            paddingBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <TouchableOpacity
                style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#d8d2c6', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}
                onPress={() => router.push('/(tabs)/autodoc')}
              >
                <Icon name="chevron-left" size={22} color="#4b4e59" strokeWidth={2} />
              </TouchableOpacity>
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#8b90a0', fontWeight: '700', letterSpacing: 0.12, textTransform: 'uppercase' }}>
                  {jobCardNumberHint || 'Job Card'}
                </Text>
                <Text style={{ fontSize: 20, color: '#1a1b21', fontWeight: '700' }}>Submit Claim</Text>
              </View>
            </View>
            <View style={{ borderWidth: 1, borderColor: statusPill.border, backgroundColor: statusPill.bg, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: statusPill.dot, marginRight: 7 }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: statusPill.textColor }}>{statusPill.text}</Text>
            </View>
          </View>
        </SafeAreaView>

        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e7e3d9', backgroundColor: '#ffffff' }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/job-cards/[id]/jobcard', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })}
              style={{ flex: 1, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', paddingVertical: 14, alignItems: 'center' }}
            >
              <Icon name="file" size={18} color="#8b90a0" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#737786' }}>Job Card</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/job-cards/[id]/damage', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })}
              style={{ flex: 1, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', paddingVertical: 14, alignItems: 'center' }}
            >
              <Icon name="grid" size={18} color="#8b90a0" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#737786' }}>Damage</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/job-cards/[id]/estimate', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })}
              style={{ flex: 1, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', paddingVertical: 14, alignItems: 'center' }}
            >
              <Icon name="file-text" size={18} color="#8b90a0" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#737786' }}>Estimate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, borderRadius: 14, backgroundColor: '#2a4cd0', borderWidth: 1, borderColor: '#2a4cd0', paddingVertical: 14, alignItems: 'center' }}>
              <Icon name="send" size={18} color="#ffffff" strokeWidth={1.8} />
              <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '700', color: '#ffffff' }}>Submit</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
            {stageLabels.map((label, idx) => {
              const active = idx <= stageIndex
              const current = idx === stageIndex

              return (
                <View key={label} style={{ flex: idx === stageLabels.length - 1 ? 0 : 1, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ alignItems: 'center' }}>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: active ? '#1f9a6b' : '#cfc8b8',
                        backgroundColor: current ? '#2a4cd0' : '#ffffff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active && !current ? <Icon name="check" size={12} color="#1f9a6b" strokeWidth={2.6} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: current ? '#ffffff' : '#cfc8b8' }} />}
                    </View>
                    <Text style={{ marginTop: 5, fontSize: 11, fontWeight: current ? '700' : '600', color: current ? '#2a4cd0' : active ? '#1f9a6b' : '#9a9ea9' }}>{label}</Text>
                  </View>

                  {idx < stageLabels.length - 1 ? (
                    <View style={{ flex: 1, height: 2, marginHorizontal: 6, backgroundColor: idx < stageIndex ? '#1f9a6b' : '#e2ddcf' }} />
                  ) : null}
                </View>
              )
            })}
          </View>
        </View>

        {loading ? (
          <View className="items-center justify-center py-20 px-4">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading submit workflow...</Text>
          </View>
        ) : error ? (
          <View className="bg-white border border-red-200 rounded-xl p-5 mx-4 mt-4">
            <Text className="text-lg font-semibold text-red-700">Unable to load submit stage</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity className="mt-4 bg-blue-600 rounded-lg py-3 items-center" onPress={loadSubmitData}>
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {warning ? (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3 mx-4 mt-4">
                <Text className="text-sm text-amber-800">{warning}</Text>
              </View>
            ) : null}

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 mx-4 mt-4">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Submission Checklist</Text>
                <Text className="text-xs font-bold text-slate-700">{checklistReadyCount}/{checklistItems.length}</Text>
              </View>
              <View className="gap-y-2">
                {checklistItems.map((item) => {
                  const tone = item.ok
                    ? { bg: '#e4f4ec', border: '#d4ebdf', dot: '#1f9a6b', text: '#1f9a6b', icon: 'check' as const }
                    : { bg: '#fbefdd', border: '#f1dcb8', dot: '#c9751b', text: '#c9751b', icon: 'x' as const }

                  return (
                    <View key={item.label} className="flex-row items-center justify-between py-2">
                      <View className="flex-row items-center" style={{ minWidth: 0, flex: 1, marginRight: 10 }}>
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            borderWidth: 1,
                            borderColor: tone.border,
                            backgroundColor: tone.bg,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                          }}
                        >
                          <Icon name={tone.icon} size={17} color={tone.dot} strokeWidth={2.4} />
                        </View>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a1b21', flexShrink: 1 }}>{item.label}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: item.ok ? '#7d8090' : '#c9751b' }}>{item.val}</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 mx-4">
              <View className="flex-row items-center mb-1">
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#dbe7fb', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Text style={{ color: '#2f63cf', fontSize: 21, fontWeight: '700' }}>1</Text>
                </View>
                <Text style={{ fontSize: 26, fontWeight: '700', color: '#1a1b21' }}>Pre-submit</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#7d8090', marginTop: 3 }}>Generate documents and send the initial claim.</Text>

              <View style={{ marginTop: 12, gap: 10 }}>
                <TouchableOpacity
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#a7dec4',
                    backgroundColor: prePptDoc ? '#d9eee4' : '#e9f0fd',
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  disabled={!!busy}
                  onPress={() => void handleGeneratePpt('pre-repair')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#1f9a6b', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Icon name="check" size={24} color="#ffffff" strokeWidth={2.5} />
                    </View>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: '#1a1b21', flexShrink: 1 }}>Generate Pre-Repair PPT</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1f9a6b' }}>{busy === 'pre-ppt' ? 'Working...' : (prePptDoc ? 'Uploaded' : 'Required')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#a7dec4',
                    backgroundColor: excelDoc ? '#d9eee4' : '#e9f0fd',
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  disabled={!!busy}
                  onPress={() => void handleExportEstimate()}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#1f9a6b', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Icon name="check" size={24} color="#ffffff" strokeWidth={2.5} />
                    </View>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: '#1a1b21', flexShrink: 1 }}>Export Estimate Excel</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1f9a6b' }}>{busy === 'excel' ? 'Working...' : (excelDoc ? 'Uploaded' : 'Required')}</Text>
                </TouchableOpacity>

                {!preSubmitSubmitted ? (
                  <TouchableOpacity
                    style={{
                      marginTop: 2,
                      borderRadius: 14,
                      backgroundColor: composeReady ? '#2a4cd0' : '#e7e3d9',
                      paddingVertical: 14,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                    disabled={!composeReady || !!busy}
                    onPress={() => void handleComposeAndSend()}
                  >
                    <Icon name="send" size={17} color={composeReady ? '#ffffff' : '#b1b4bd'} strokeWidth={2.2} />
                    <Text style={{ color: composeReady ? '#ffffff' : '#b1b4bd', fontSize: 16, fontWeight: '700' }}>
                      {busy === 'compose-send' ? 'Sending...' : 'Compose & send · set Submitted'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {preSubmitSubmitted ? (
                <TouchableOpacity
                  style={{
                    marginTop: 14,
                    borderRadius: 14,
                    backgroundColor: preSubmitFollowUpMode === 'done' ? '#e7e3d9' : '#2a4cd0',
                    paddingVertical: 14,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                  disabled={preSubmitFollowUpMode === 'done'}
                  onPress={() => {
                    if (!jobCardId || preSubmitFollowUpMode === 'done') return
                    const stage = preSubmitFollowUpMode === 'under-repair' ? 'under-repair' : 'post-repair'
                    router.push({
                      pathname: '/job-cards/[id]/damage',
                      params: {
                        id: jobCardId,
                        jcNumber: jobCardNumberHint ?? '',
                        regNumber: regNumberHint ?? '',
                        stage,
                      },
                    })
                  }}
                >
                  <Text style={{ color: preSubmitFollowUpMode === 'done' ? '#a5a9b2' : '#ffffff', fontSize: 16, fontWeight: '700' }}>
                    {preSubmitFollowUpMode === 'under-repair'
                      ? 'Upload Under Repair Photos'
                      : preSubmitFollowUpMode === 'post-repair'
                        ? 'Upload Post Repair Photos'
                        : 'Pre Repair - Submitted'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {!composeReady ? (
                <Text className="text-xs text-amber-700 mt-3 px-1">Upload Pre-Repair PPT, Estimate Excel, and Walkaround Video first.</Text>
              ) : null}
            </View>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 mx-4">
              <View className="flex-row items-center mb-1">
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#eef0f7', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Text style={{ color: '#55618f', fontSize: 21, fontWeight: '700' }}>2</Text>
                </View>
                <Text style={{ fontSize: 26, fontWeight: '700', color: '#1a1b21' }}>Final submit</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#7d8090', marginTop: 3 }}>After repair, document the result and submit the claim.</Text>

              <View style={{ marginTop: 12, gap: 10 }}>
                <TouchableOpacity
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#d8d2c6',
                    backgroundColor: '#ffffff',
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    opacity: finalPhotoStagesReady ? 1 : 0.7,
                  }}
                  disabled={!finalPhotoStagesReady || !!busy}
                  onPress={() => void handleGeneratePpt('post-repair')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#f3f2ef', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Icon name="file-image" size={21} color="#8b90a0" strokeWidth={2} />
                    </View>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: '#1a1b21', flexShrink: 1 }}>
                      {busy === 'post-ppt' ? 'Generating Post-Repair PPT...' : 'Generate Post-Repair PPT'}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color="#8b90a0" strokeWidth={2.2} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    borderRadius: 14,
                    backgroundColor: submitReady ? '#2a4cd0' : '#e7e3d9',
                    paddingVertical: 14,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                  disabled={!submitReady || !!busy}
                  onPress={() => void handleSubmitClaim()}
                >
                  <Icon name="check-circle" size={17} color={submitReady ? '#ffffff' : '#a5a9b2'} strokeWidth={2.2} />
                  <Text style={{ color: submitReady ? '#ffffff' : '#a5a9b2', fontSize: 16, fontWeight: '700' }}>
                    {busy === 'submit-claim' ? 'Submitting...' : 'Submit claim · set Completed'}
                  </Text>
                </TouchableOpacity>
              </View>

              {!finalPhotoStagesReady ? (
                <Text className="text-xs text-amber-700 mt-3 px-1">
                  {selectedPanelIds.length === 0
                    ? 'Select and upload panels in Damage stage before generating Post-Repair PPT.'
                    : `${missingUnderRepairPanelsCount} panel${missingUnderRepairPanelsCount === 1 ? '' : 's'} missing under-repair and ${missingPostRepairPanelsCount} panel${missingPostRepairPanelsCount === 1 ? '' : 's'} missing post-repair photos.`}
                </Text>
              ) : null}
            </View>

            <View style={{ height: 6 }} />
          </>
        )}
      </ScrollView>
    </>
  )
}
