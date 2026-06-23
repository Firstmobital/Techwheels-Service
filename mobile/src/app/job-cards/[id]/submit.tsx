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
import * as FileSystem from 'expo-file-system/legacy'
import {
  addDocument,
  listDocuments,
  invokeUniversalDriveUpload,
} from '../../../lib/api/documents'
import { supabase } from '../../../lib/supabase'
import { AUTODOC_BUCKET } from '../../../lib/autodocStorage'
import { getSupabaseBaseUrl } from '../../../lib/env'
import type { DocumentRow } from '../../../lib/api/types'
import { generateRepairPPT } from '../../../lib/generators/generatePPT'
import { generateEstimateCsvString } from '../../../lib/generators/generateEstimateCsv'
import {
  generateClaimEmailContent,
  sendClaimEmail,
  type EmailAttachmentRef,
} from '../../../lib/api/email'
import { Icon, PrimaryButton, StatusPill } from '../../../components/ui'
import { ScreenHeader } from '../../../components/autodoc/ScreenHeader'
import { WorkflowProgress } from '../../../components/autodoc/WorkflowProgress'
import { WorkflowTabs, type WorkflowTabKey } from '../../../components/autodoc/WorkflowTabs'

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

type StatusPillValue = 'draft' | 'submitted' | 'approved' | 'in_work' | 'completed'

function toPillStatus(value: string | null | undefined): StatusPillValue {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'submitted') return 'submitted'
  if (normalized === 'approved') return 'approved'
  if (normalized === 'in_work') return 'in_work'
  if (normalized === 'completed') return 'completed'
  return 'draft'
}

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
  const [underRepairPhotoCount, setUnderRepairPhotoCount] = useState(0)
  const [postRepairPhotoCount, setPostRepairPhotoCount] = useState(0)
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([])
  const [underRepairPanelIds, setUnderRepairPanelIds] = useState<string[]>([])
  const [postRepairPanelIds, setPostRepairPanelIds] = useState<string[]>([])
  // Local override: set to true immediately after successful upload so UI reacts instantly
  const [localExcelUploaded, setLocalExcelUploaded] = useState(false)
  const [localPrePptUploaded, setLocalPrePptUploaded] = useState(false)

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

  // Always use the resolved UUID for DB/storage operations (jobCardId from URL may be a JC number)
  const resolvedJobCardId = (jobCard?.job_card_id ?? jobCardId) as string

  const prePptDoc = docsByType.get('ppt_pre')
  const postPptDoc = docsByType.get('ppt_post')
  const excelDoc = docsByType.get('excel_estimate')
  const walkaroundDoc = docsByType.get('video_job_card')
  const deliveryDoc = docsByType.get('video_delivery')

  const composeReady = Boolean((prePptDoc || localPrePptUploaded) && (excelDoc || localExcelUploaded) && walkaroundDoc)
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
    { label: 'Pre-Repair PPT', ok: !!(prePptDoc || localPrePptUploaded), val: (prePptDoc || localPrePptUploaded) ? 'Uploaded' : 'Missing' },
    { label: 'Estimate Excel', ok: !!(excelDoc || localExcelUploaded), val: (excelDoc || localExcelUploaded) ? 'Uploaded' : 'Missing' },
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

  const onWorkflowTabPress = (tab: WorkflowTabKey) => {
    if (!jobCardId) return
    const params = {
      id: jobCardId,
      jcNumber: jobCardNumberHint ?? '',
      regNumber: regNumberHint ?? '',
    }

    if (tab === 'jobcard') {
      router.push({ pathname: '/job-cards/[id]/jobcard', params })
      return
    }
    if (tab === 'damage') {
      router.push({ pathname: '/job-cards/[id]/damage', params })
      return
    }
    if (tab === 'estimate') {
      router.push({ pathname: '/job-cards/[id]/estimate', params })
      return
    }
  }

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
      const docType = type === 'pre-repair' ? 'ppt_pre' : 'ppt_post'
      const contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

      // Generate PPT as ArrayBuffer
      const arrayBuffer = await generateRepairPPT(jobCardId, type, { download: false, fileName })

      // Write to temp file (base64) — avoids Blob upload which fails on Android
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((acc, byte) => acc + String.fromCharCode(byte), '')
      )
      const tmpUri = `${FileSystem.cacheDirectory}${fileName}`
      await FileSystem.writeAsStringAsync(tmpUri, base64, { encoding: FileSystem.EncodingType.Base64 })

      const { data: sessionRes } = await supabase.auth.getSession()
      const user = sessionRes.session?.user
      const dealerCode = String(user?.user_metadata?.dealer_code ?? user?.app_metadata?.dealer_code ?? 'unknown').trim() || 'unknown'
      const storagePath = `${dealerCode}/${resolvedJobCardId}/documents/${docType}/${Date.now()}-${fileName}`

      // Get signed upload URL
      const { data: signedData, error: signedErr } = await supabase.storage
        .from(AUTODOC_BUCKET).createSignedUploadUrl(storagePath)
      if (signedErr || !signedData?.signedUrl) throw new Error(signedErr?.message ?? 'Failed to get signed upload URL')

      // Upload via FileSystem.uploadAsync (retry × 2)
      let uploadOk = false
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await FileSystem.uploadAsync(signedData.signedUrl, tmpUri, {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': contentType },
          })
          if (result.status >= 200 && result.status < 300) { uploadOk = true; break }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1200))
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1200))
        }
      }
      if (!uploadOk) throw new Error('Upload failed after retries. Check your internet connection.')

      // Register document in DB (edge function first, fallback to direct client insert)
      const sizeMb = Number(arrayBuffer.byteLength / (1024 * 1024))
      void FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {})

      const supabaseUrl = getSupabaseBaseUrl()
      const token = sessionRes.session?.access_token
      let dbRegistered = false
      if (supabaseUrl && token) {
        try {
          const upsertRes = await fetch(`${supabaseUrl}/functions/v1/document-link-upsert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ jobCardId: resolvedJobCardId, docType, storagePath, fileSizeMb: sizeMb }),
          })
          if (upsertRes.ok) dbRegistered = true
        } catch (e) {
          console.warn('[submit-ppt] Edge function failed, will use direct insert:', e)
        }
      }
      if (!dbRegistered) {
        const insertRes = await addDocument({ jobCardId: resolvedJobCardId, docType, storagePath, fileSizeMb: sizeMb })
        if (!insertRes.error) dbRegistered = true
        else console.warn('[submit-ppt] Direct insert failed:', insertRes.error)
      }
      void invokeUniversalDriveUpload({ jobCardId: resolvedJobCardId, fileType: docType, storagePath, fileSizeMb: sizeMb, resourceType: 'document', bucketId: AUTODOC_BUCKET })
        .catch((e) => console.warn('[submit-ppt] Drive offload failed:', e?.message))

      // Mark locally so checklist shows Uploaded immediately
      if (type === 'pre-repair') setLocalPrePptUploaded(true)
      Alert.alert('Generated', `${type === 'pre-repair' ? 'Pre-repair' : 'Post-repair'} PPT generated and uploaded.`)
      await loadSubmitData()
    } catch (err: any) {
      Alert.alert('Generate Failed', err?.message ?? 'Unable to generate PPT. Check internet connection.')
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

      // Generate CSV as string (Blob upload fails on Android with network error)
      const csvString = await generateEstimateCsvString(jobCardId)
      const tmpUri = `${FileSystem.cacheDirectory}${fileName}`
      await FileSystem.writeAsStringAsync(tmpUri, csvString, { encoding: FileSystem.EncodingType.UTF8 })

      const { data: sessionRes } = await supabase.auth.getSession()
      const user = sessionRes.session?.user
      const dealerCode = String(user?.user_metadata?.dealer_code ?? user?.app_metadata?.dealer_code ?? 'unknown').trim() || 'unknown'
      const storagePath = `${dealerCode}/${resolvedJobCardId}/documents/excel_estimate/${Date.now()}-${fileName}`

      // Get signed upload URL
      const { data: signedData, error: signedErr } = await supabase.storage
        .from(AUTODOC_BUCKET).createSignedUploadUrl(storagePath)
      if (signedErr || !signedData?.signedUrl) throw new Error(signedErr?.message ?? 'Failed to get signed upload URL')

      // Upload via FileSystem.uploadAsync (retry × 2)
      let uploadOk = false
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await FileSystem.uploadAsync(signedData.signedUrl, tmpUri, {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': 'text/csv' },
          })
          if (result.status >= 200 && result.status < 300) { uploadOk = true; break }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000))
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000))
        }
      }
      if (!uploadOk) throw new Error('Upload failed after retries. Check your internet connection.')

      // Register document in DB (try edge function first, fallback to direct client insert)
      const fileInfo = await FileSystem.getInfoAsync(tmpUri, { size: true }).catch(() => ({} as any))
      const sizeMb = Number(((fileInfo as any).size ?? 0) / (1024 * 1024))
      void FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {})

      const supabaseUrl = getSupabaseBaseUrl()
      const token = sessionRes.session?.access_token
      let dbRegistered = false
      if (supabaseUrl && token) {
        try {
          const upsertRes = await fetch(`${supabaseUrl}/functions/v1/document-link-upsert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ jobCardId: resolvedJobCardId, docType: 'excel_estimate', storagePath, fileSizeMb: sizeMb }),
          })
          if (upsertRes.ok) dbRegistered = true
        } catch (e) {
          console.warn('[submit-export] Edge function failed, will use direct insert:', e)
        }
      }
      if (!dbRegistered) {
        // Fallback: direct client insert (resolves UUID internally)
        const insertRes = await addDocument({ jobCardId: resolvedJobCardId, docType: 'excel_estimate', storagePath, fileSizeMb: sizeMb })
        if (!insertRes.error) dbRegistered = true
        else console.warn('[submit-export] Direct insert failed:', insertRes.error)
      }
      void invokeUniversalDriveUpload({ jobCardId: resolvedJobCardId, fileType: 'excel_estimate', storagePath, fileSizeMb: sizeMb, resourceType: 'document', bucketId: AUTODOC_BUCKET })
        .catch((e) => console.warn('[submit-export] Drive offload failed:', e?.message))

      // Mark locally so checklist shows Uploaded immediately even before DB refresh
      setLocalExcelUploaded(true)
      Alert.alert('Generated', 'Estimate Excel generated and uploaded.')
      await loadSubmitData()
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message ?? 'Unable to export estimate. Check internet connection.')
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

      const sendRes = await sendClaimEmail(jobCardId, {
        to: 'vinodexodus@gmail.com', // overridden server-side by dealer_settings
        subject: content.subject,
        html: content.html,
        attachments,
        purpose: 'autodoc_claim',
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

      const sendRes = await sendClaimEmail(jobCardId, {
        to: 'vinodexodus@gmail.com', // overridden server-side by dealer_settings
        subject: `[POST-REPAIR] ${content.subject}`,
        html: content.html,
        attachments,
        purpose: 'autodoc_claim',
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
      <ScrollView style={{ flex: 1, backgroundColor: '#f4f2ec' }} contentContainerStyle={{ paddingBottom: 32 }}>
        <ScreenHeader
          title="Submit Claim"
          eyebrow={jobCardNumberHint || 'Job Card'}
          onBack={() => router.push('/(tabs)/autodoc')}
          rightNode={<StatusPill status={toPillStatus(jobCard?.status)} />}
        />

        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e7e3d9', backgroundColor: '#ffffff' }}>
          <WorkflowTabs activeTab="submit" onTabPress={onWorkflowTabPress} disabled={!jobCardId} />
          <WorkflowProgress currentStep={stageIndex + 1} totalSteps={5} stageName={stageLabels[Math.min(stageIndex, stageLabels.length - 1)]} />
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 16 }}>
            <ActivityIndicator size="large" color="#2a4cd0" />
            <Text style={{ fontSize: 13, color: '#4b4e59', marginTop: 10 }}>Loading submit workflow...</Text>
          </View>
        ) : error ? (
          <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3cdd4', borderRadius: 12, padding: 16, marginHorizontal: 16, marginTop: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#c33b53' }}>Unable to load submit stage</Text>
            <Text style={{ fontSize: 13, color: '#c33b53', marginTop: 4 }}>{error}</Text>
            <View style={{ marginTop: 12 }}>
              <PrimaryButton title="Retry" onPress={loadSubmitData} />
            </View>
          </View>
        ) : (
          <>
            {warning ? (
              <View style={{ backgroundColor: '#fbefdd', borderWidth: 1, borderColor: '#f1dcb8', borderRadius: 12, padding: 14, marginBottom: 12, marginHorizontal: 16, marginTop: 16 }}>
                <Text style={{ fontSize: 13, color: '#c9751b' }}>{warning}</Text>
              </View>
            ) : null}

            <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 16, padding: 14, marginBottom: 12, marginHorizontal: 16, marginTop: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: '#82858f', fontWeight: '700' }}>Submission Checklist</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#4b4e59' }}>{checklistReadyCount}/{checklistItems.length}</Text>
              </View>
              <View style={{ gap: 8 }}>
                {checklistItems.map((item) => {
                  const tone = item.ok
                    ? { bg: '#e4f4ec', border: '#bfe6d2', dot: '#1c8f63', text: '#1c8f63', icon: 'check' as const }
                    : { bg: '#fbefdd', border: '#f1dcb8', dot: '#c9751b', text: '#c9751b', icon: 'x' as const }

                  return (
                    <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                      <View style={{ minWidth: 0, flex: 1, marginRight: 10, flexDirection: 'row', alignItems: 'center' }}>
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
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#1a1b21', flexShrink: 1 }}>{item.label}</Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: item.ok ? '#7d8090' : '#c9751b' }}>{item.val}</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 16, padding: 14, marginBottom: 12, marginHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#dbe7fb', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Text style={{ color: '#2f63cf', fontSize: 18, fontWeight: '700' }}>1</Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#1a1b21' }}>Pre-submit</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#82858f', marginTop: 3 }}>Generate documents and send the initial claim.</Text>

              <View style={{ marginTop: 12, gap: 10 }}>
                <TouchableOpacity
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#a7dec4',
                    backgroundColor: (prePptDoc || localPrePptUploaded) ? '#d9eee4' : '#e9f0fd',
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
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#1c8f63', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Icon name="check" size={24} color="#ffffff" strokeWidth={2.5} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a1b21', flexShrink: 1 }}>Generate Pre-Repair PPT</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1c8f63' }}>{busy === 'pre-ppt' ? 'Working...' : ((prePptDoc || localPrePptUploaded) ? 'Uploaded' : 'Required')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#a7dec4',
                    backgroundColor: (excelDoc || localExcelUploaded) ? '#d9eee4' : '#e9f0fd',
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
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#1c8f63', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Icon name="check" size={24} color="#ffffff" strokeWidth={2.5} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a1b21', flexShrink: 1 }}>Export Estimate Excel</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1c8f63' }}>{busy === 'excel' ? 'Working...' : ((excelDoc || localExcelUploaded) ? 'Uploaded' : 'Required')}</Text>
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
                    <Text style={{ color: composeReady ? '#ffffff' : '#b1b4bd', fontSize: 15, fontWeight: '700' }}>
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
                  <Text style={{ color: preSubmitFollowUpMode === 'done' ? '#a5a9b2' : '#ffffff', fontSize: 15, fontWeight: '700' }}>
                    {preSubmitFollowUpMode === 'under-repair'
                      ? 'Upload Under Repair Photos'
                      : preSubmitFollowUpMode === 'post-repair'
                        ? 'Upload Post Repair Photos'
                        : 'Pre Repair - Submitted'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {!composeReady ? (
                <Text style={{ fontSize: 12, color: '#c9751b', marginTop: 12, paddingHorizontal: 4 }}>Upload Pre-Repair PPT, Estimate Excel, and Walkaround Video first.</Text>
              ) : null}
            </View>

            <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 16, padding: 14, marginBottom: 12, marginHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#eef0f7', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Text style={{ color: '#55618f', fontSize: 18, fontWeight: '700' }}>2</Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#1a1b21' }}>Final submit</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#82858f', marginTop: 3 }}>After repair, document the result and submit the claim.</Text>

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
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a1b21', flexShrink: 1 }}>
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
                  <Text style={{ color: submitReady ? '#ffffff' : '#a5a9b2', fontSize: 15, fontWeight: '700' }}>
                    {busy === 'submit-claim' ? 'Submitting...' : 'Submit claim · set Completed'}
                  </Text>
                </TouchableOpacity>
              </View>

              {!finalPhotoStagesReady ? (
                <Text style={{ fontSize: 12, color: '#c9751b', marginTop: 12, paddingHorizontal: 4 }}>
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
