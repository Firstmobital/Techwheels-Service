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
import JobWorkflowHeader from '../../../components/autodoc/JobWorkflowHeader'
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
  const [postRepairPhotoCount, setPostRepairPhotoCount] = useState(0)
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([])
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
    let post = 0
    const postRepairPanelSet = new Set<string>()
    for (const photo of photos) {
      const stage = String((photo as any).repair_stage ?? '').trim().toLowerCase()
      const panelId = String((photo as any).panel_id ?? '').trim()
      if (stage === 'pre-repair') pre += 1
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
    setPostRepairPhotoCount(post)
    setSelectedPanelIds(selectedIds)
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
  const postRepairPptReady = useMemo(() => {
    if (selectedPanelIds.length === 0) return false
    const covered = new Set(postRepairPanelIds)
    return selectedPanelIds.every((panelId) => covered.has(panelId))
  }, [postRepairPanelIds, selectedPanelIds])

  const missingPostRepairPanelsCount = Math.max(selectedPanelIds.length - postRepairPanelIds.length, 0)
  const completionScore = [
    prePptDoc,
    excelDoc,
    walkaroundDoc,
    postPptDoc,
  ].filter(Boolean).length

  const handleGeneratePpt = async (type: 'pre-repair' | 'post-repair') => {
    if (!jobCardId) return

    if (type === 'post-repair' && !postRepairPptReady) {
      Alert.alert('Missing Photos', 'Upload at least one post-repair photo for every selected panel before generating Post-Repair PPT.')
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
      <Stack.Screen options={{ title: 'Submit Stage' }} />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <JobWorkflowHeader jobCardId={jobCardId} jcNumber={jobCardNumberHint} regNumber={regNumberHint} activeTab="submit" />

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading submit workflow...</Text>
          </View>
        ) : error ? (
          <View className="bg-white border border-red-200 rounded-xl p-5">
            <Text className="text-lg font-semibold text-red-700">Unable to load submit stage</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity className="mt-4 bg-blue-600 rounded-lg py-3 items-center" onPress={loadSubmitData}>
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {warning ? (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
                <Text className="text-sm text-amber-800">{warning}</Text>
              </View>
            ) : null}

            <View className="bg-slate-900 rounded-2xl px-4 py-4 mb-3">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-[11px] uppercase tracking-widest text-slate-300">Submit Stage</Text>
                  <Text className="text-xl font-bold text-white mt-1">{jobCard?.jc_number ?? '-'}</Text>
                  <Text className="text-sm text-slate-200 mt-1">Reg: {jobCard?.reg_number ?? '-'}</Text>
                </View>
                <View className="bg-amber-300 rounded-full px-3 py-1">
                  <Text className="text-[11px] font-semibold text-amber-900">Awaiting Approval</Text>
                </View>
              </View>
              <View className="mt-4 rounded-xl bg-slate-800 px-3 py-3">
                <Text className="text-xs text-slate-300">Completion</Text>
                <Text className="text-lg font-semibold text-white mt-1">{completionScore}/4 essentials ready</Text>
                <View className="mt-2 h-2 rounded-full bg-slate-700 overflow-hidden">
                  <View className="h-2 rounded-full bg-cyan-400" style={{ width: `${(completionScore / 4) * 100}%` }} />
                </View>
              </View>
            </View>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
              <Text className="text-xs uppercase tracking-wide text-slate-500">Submission Checklist</Text>
              <View className="mt-3 gap-y-1">
                <Text className="text-sm text-slate-700">Selected panels: {selectedPanelIds.length}</Text>
                <Text className="text-sm text-slate-700">Pre-repair photos: {preRepairPhotoCount}</Text>
                <Text className="text-sm text-slate-700">Post-repair photos: {postRepairPhotoCount}</Text>
                <Text className="text-sm text-slate-700">Estimate rows: {estimateRowsCount}</Text>
                <Text className={`text-sm mt-1 ${prePptDoc ? 'text-emerald-700' : 'text-amber-700'}`}>Pre-Repair PPT: {prePptDoc ? 'Uploaded' : 'Missing'}</Text>
                <Text className={`text-sm ${excelDoc ? 'text-emerald-700' : 'text-amber-700'}`}>Estimate Excel: {excelDoc ? 'Uploaded' : 'Missing'}</Text>
                <Text className={`text-sm ${walkaroundDoc ? 'text-emerald-700' : 'text-amber-700'}`}>Walkaround Video: {walkaroundDoc ? 'Uploaded' : 'Missing'}</Text>
                <Text className={`text-sm ${deliveryDoc ? 'text-emerald-700' : 'text-amber-700'}`}>Delivery Video: {deliveryDoc ? 'Uploaded' : 'Pending'}</Text>
                <Text className={`text-sm ${postPptDoc ? 'text-emerald-700' : 'text-amber-700'}`}>Post-Repair PPT: {postPptDoc ? 'Uploaded' : 'Missing'}</Text>
              </View>
            </View>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
              <Text className="text-base font-semibold text-slate-900">Pre-Submit Actions</Text>
              <Text className="text-xs text-slate-500 mt-1">Generate files first, then send claim email to set job as submitted.</Text>

              <TouchableOpacity
                className={`mt-3 rounded-xl py-3 items-center ${busy === 'pre-ppt' ? 'bg-blue-300' : 'bg-blue-600'}`}
                disabled={!!busy}
                onPress={() => void handleGeneratePpt('pre-repair')}
              >
                <Text className="text-white font-semibold">{busy === 'pre-ppt' ? 'Generating...' : 'Generate Pre-Repair PPT'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`mt-3 rounded-xl py-3 items-center ${busy === 'excel' ? 'bg-indigo-300' : 'bg-indigo-600'}`}
                disabled={!!busy}
                onPress={() => void handleExportEstimate()}
              >
                <Text className="text-white font-semibold">{busy === 'excel' ? 'Generating...' : 'Export Estimate Excel'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`mt-3 rounded-xl py-3 items-center ${(busy === 'compose-send' || !composeReady) ? 'bg-emerald-300' : 'bg-emerald-600'}`}
                disabled={!!busy || !composeReady}
                onPress={() => void handleComposeAndSend()}
              >
                <Text className="text-white font-semibold">{busy === 'compose-send' ? 'Sending...' : 'Compose & Send (Set Submitted)'}</Text>
              </TouchableOpacity>
              {!composeReady ? (
                <Text className="text-xs text-amber-700 mt-2">Upload Pre-Repair PPT, Estimate Excel, and Walkaround Video first.</Text>
              ) : null}
            </View>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
              <Text className="text-base font-semibold text-slate-900">Final Submit</Text>
              <Text className="text-xs text-slate-500 mt-1">Post-repair file generation and final warranty submission.</Text>

              <TouchableOpacity
                className={`mt-3 rounded-xl py-3 items-center ${(busy === 'post-ppt' || !postRepairPptReady) ? 'bg-violet-300' : 'bg-violet-600'}`}
                disabled={!!busy || !postRepairPptReady}
                onPress={() => void handleGeneratePpt('post-repair')}
              >
                <Text className="text-white font-semibold">{busy === 'post-ppt' ? 'Generating...' : 'Generate Post-Repair PPT'}</Text>
              </TouchableOpacity>
              {!postRepairPptReady ? (
                <Text className="text-xs text-amber-700 mt-2">
                  {selectedPanelIds.length === 0
                    ? 'Select and upload panels in Damage stage before generating Post-Repair PPT.'
                    : `${missingPostRepairPanelsCount} selected panel${missingPostRepairPanelsCount === 1 ? '' : 's'} still need post-repair photos.`}
                </Text>
              ) : null}

              <TouchableOpacity
                className={`mt-3 rounded-xl py-3 items-center ${(busy === 'submit-claim' || !submitReady) ? 'bg-slate-400' : 'bg-slate-800'}`}
                disabled={!!busy || !submitReady}
                onPress={() => void handleSubmitClaim()}
              >
                <Text className="text-white font-semibold">{busy === 'submit-claim' ? 'Submitting...' : 'Submit Claim (Set Completed)'}</Text>
              </TouchableOpacity>
              {!submitReady ? (
                <Text className="text-xs text-amber-700 mt-2">Generate Post-Repair PPT first.</Text>
              ) : null}
            </View>

            <View className="flex-row pb-2">
              <TouchableOpacity
                className="flex-1 mr-2 rounded-lg border border-gray-300 bg-white py-3 items-center"
                onPress={() => {
                  if (!jobCardId) return
                  router.push({ pathname: '/job-cards/[id]/damage', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })
                }}
              >
                <Text className="text-gray-700 font-semibold">Open Damage</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 ml-2 rounded-lg border border-gray-300 bg-white py-3 items-center"
                onPress={() => {
                  if (!jobCardId) return
                  router.push({ pathname: '/job-cards/[id]/estimate', params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' } })
                }}
              >
                <Text className="text-gray-700 font-semibold">Open Estimate</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </>
  )
}
