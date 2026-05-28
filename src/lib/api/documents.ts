import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { fail, ok, type ApiResult, type DocType, type DocumentInsert, type DocumentRow } from './types'

const DOCUMENT_SELECT = 'id, job_card_id, doc_type, storage_path, drive_url, drive_file_id, file_size_mb, gps_lat, gps_lng, gps_city, captured_at, created_at'

type UniversalDriveResponse = {
  ok?: boolean
  error?: string
  resource_type?: 'document' | 'panel_photo'
  file_type?: string
  drive_url?: string
  drive_file_id?: string
}

export async function invokeUniversalDriveUpload(input: {
  jobCardId: string
  fileType: string
  storagePath: string
  fileSizeMb: number
  resourceType?: 'document' | 'panel_photo'
  bucketId?: string
}): Promise<ApiResult<UniversalDriveResponse>> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  const sessionRes = await supabase.auth.getSession()
  const token = sessionRes.data.session?.access_token

  if (!supabaseUrl || !token) return fail('No active session for Drive offload request')

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/universal-drive-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        resource_type: input.resourceType ?? 'document',
        bucket_id: input.bucketId ?? AUTODOC_BUCKET,
        object_name: input.storagePath,
        job_card_id: input.jobCardId,
        file_type: input.fileType,
        doc_type: input.fileType,
        file_size_mb: input.fileSizeMb,
      }),
    })

    const payload = await res.json().catch(() => ({} as UniversalDriveResponse))
    if (!res.ok || payload?.ok === false) {
      const message = payload?.error || `Universal drive upload failed (${res.status})`
      return fail(message)
    }

    return ok(payload)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Universal drive upload failed')
  }
}

export async function listDocuments(jobCardId: string): Promise<ApiResult<DocumentRow[]>> {
  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENT_SELECT)
    .eq('job_card_id', jobCardId)
    .order('created_at', { ascending: false })

  if (error) return fail(error)
  return ok((data ?? []) as DocumentRow[])
}

export async function addDocument(input: {
  jobCardId: string
  docType: DocType
  storagePath: string
  fileSizeMb: number
  gpsLat?: number | null
  gpsLng?: number | null
  gpsCity?: string | null
  capturedAt?: string | null
}): Promise<ApiResult<DocumentRow>> {
  const payload: DocumentInsert = {
    job_card_id: input.jobCardId,
    doc_type: input.docType,
    storage_path: input.storagePath,
    file_size_mb: Number.isFinite(input.fileSizeMb) ? input.fileSizeMb : 0,
    gps_lat: Number.isFinite(Number(input.gpsLat)) ? Number(input.gpsLat) : null,
    gps_lng: Number.isFinite(Number(input.gpsLng)) ? Number(input.gpsLng) : null,
    gps_city: input.gpsCity?.trim() ? input.gpsCity.trim() : null,
    captured_at: input.capturedAt?.trim() ? input.capturedAt : null,
  }

  const { data, error } = await supabase
    .from('documents')
    .insert(payload)
    .select(DOCUMENT_SELECT)
    .single<DocumentRow>()

  if (error) return fail(error)

  // Offload to Drive asynchronously after DB insert so UI flow is not blocked by external API latency.
  void invokeUniversalDriveUpload({
    jobCardId: input.jobCardId,
    fileType: input.docType,
    storagePath: input.storagePath,
    fileSizeMb: input.fileSizeMb,
    resourceType: 'document',
  })

  return ok(data)
}

export async function upsertDocumentByType(input: {
  jobCardId: string
  docType: DocType
  storagePath: string
  fileSizeMb: number
  gpsLat?: number | null
  gpsLng?: number | null
  gpsCity?: string | null
  capturedAt?: string | null
}): Promise<ApiResult<DocumentRow>> {
  const { data: existing, error: existingError } = await supabase
    .from('documents')
    .select(DOCUMENT_SELECT)
    .eq('job_card_id', input.jobCardId)
    .eq('doc_type', input.docType)
    .order('created_at', { ascending: false })

  if (existingError) return fail(existingError)

  if ((existing ?? []).length > 0) {
    const oldPaths = (existing ?? []).map((doc) => doc.storage_path).filter(Boolean)
    const ids = (existing ?? []).map((doc) => doc.id)

    const { error: deleteRowsError } = await supabase
      .from('documents')
      .delete()
      .in('id', ids)

    if (deleteRowsError) return fail(deleteRowsError)

    if (oldPaths.length > 0) {
      await supabase.storage.from(AUTODOC_BUCKET).remove(oldPaths)
    }
  }

  const created = await addDocument({
    jobCardId: input.jobCardId,
    docType: input.docType,
    storagePath: input.storagePath,
    fileSizeMb: input.fileSizeMb,
    gpsLat: input.gpsLat,
    gpsLng: input.gpsLng,
    gpsCity: input.gpsCity,
    capturedAt: input.capturedAt,
  })

  if (created.error || !created.data) return created

  return ok(created.data)
}

export async function uploadDocumentFile(input: {
  jobCardId: string
  docType: DocType
  file: Blob
  fileName: string
  contentType?: string
  gpsLat?: number | null
  gpsLng?: number | null
  gpsCity?: string | null
  capturedAt?: string | null
}): Promise<ApiResult<DocumentRow>> {
  console.log('[autodoc-upload-debug] uploadDocumentFile start', {
    jobCardId: input.jobCardId,
    docType: input.docType,
    fileName: input.fileName,
    fileType: input.file.type,
    fileSizeBytes: input.file.size,
  })
  const cleanName = (input.fileName.trim() || `${input.docType}.bin`)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
  const timestamp = Date.now()

  const { data: sessionRes } = await supabase.auth.getSession()
  const user = sessionRes.session?.user
  const dealerCode = String(
    user?.user_metadata?.dealer_code
    ?? user?.app_metadata?.dealer_code
    ?? 'unknown',
  ).trim() || 'unknown'

  const storagePath = `${dealerCode}/${input.jobCardId}/documents/${input.docType}/${timestamp}-${cleanName}`
  console.log('[autodoc-upload-debug] Computed storage path for document upload', {
    jobCardId: input.jobCardId,
    docType: input.docType,
    storagePath,
    dealerCode,
  })

  const effectiveContentType = input.contentType || input.file.type || 'application/octet-stream'

  const { error: uploadError } = await supabase.storage
    .from(AUTODOC_BUCKET)
    .upload(storagePath, input.file, {
      contentType: effectiveContentType,
      upsert: false,
    })

  if (uploadError) {
    console.error('[autodoc-upload-debug] Storage upload failed', {
      jobCardId: input.jobCardId,
      docType: input.docType,
      storagePath,
      error: uploadError,
    })
    return fail(uploadError)
  }

  console.log('[autodoc-upload-debug] Storage upload succeeded', {
    jobCardId: input.jobCardId,
    docType: input.docType,
    storagePath,
  })

  const sizeMb = Number((input.file.size / (1024 * 1024)).toFixed(3))

  // Prefer service-role edge function to avoid client-side RLS failures on documents table.
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  const token = sessionRes.session?.access_token
  if (supabaseUrl && token) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/document-link-upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobCardId: input.jobCardId,
          docType: input.docType,
          storagePath,
          fileSizeMb: sizeMb,
          gpsLat: input.gpsLat,
          gpsLng: input.gpsLng,
          gpsCity: input.gpsCity,
          capturedAt: input.capturedAt,
        }),
      })

      const payload = await res.json().catch(() => ({}))
      console.log('[autodoc-upload-debug] document-link-upsert response', {
        jobCardId: input.jobCardId,
        docType: input.docType,
        status: res.status,
        ok: res.ok,
        payload,
      })
      if (res.ok && payload?.data) {
        void invokeUniversalDriveUpload({
          jobCardId: input.jobCardId,
          fileType: input.docType,
          storagePath,
          fileSizeMb: sizeMb,
          resourceType: 'document',
        })
        return ok(payload.data as DocumentRow)
      }
      console.error('[autodoc-upload-debug] document-link-upsert did not return usable data; falling back to client upsert', {
        jobCardId: input.jobCardId,
        docType: input.docType,
        status: res.status,
        payload,
      })
    } catch {
      console.error('[autodoc-upload-debug] document-link-upsert request threw; falling back to client upsert', {
        jobCardId: input.jobCardId,
        docType: input.docType,
      })
      // fallback to client-side upsert below
    }
  }

  const upsertRes = await upsertDocumentByType({
    jobCardId: input.jobCardId,
    docType: input.docType,
    storagePath,
    fileSizeMb: sizeMb,
    gpsLat: input.gpsLat,
    gpsLng: input.gpsLng,
    gpsCity: input.gpsCity,
    capturedAt: input.capturedAt,
  })

  if (upsertRes.error || !upsertRes.data) return upsertRes

  console.log('[autodoc-upload-debug] Client-side document upsert succeeded', {
    jobCardId: input.jobCardId,
    docType: input.docType,
    docId: upsertRes.data.id,
    storagePath: upsertRes.data.storage_path,
  })

  return ok(upsertRes.data)
}
