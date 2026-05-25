import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { fail, ok, type ApiResult, type DocType, type DocumentInsert, type DocumentRow } from './types'

const DOCUMENT_SELECT = 'id, job_card_id, doc_type, storage_path, file_size_mb, created_at'

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
}): Promise<ApiResult<DocumentRow>> {
  const payload: DocumentInsert = {
    job_card_id: input.jobCardId,
    doc_type: input.docType,
    storage_path: input.storagePath,
    file_size_mb: Number.isFinite(input.fileSizeMb) ? input.fileSizeMb : 0,
  }

  const { data, error } = await supabase
    .from('documents')
    .insert(payload)
    .select(DOCUMENT_SELECT)
    .single<DocumentRow>()

  if (error) return fail(error)
  return ok(data)
}

export async function upsertDocumentByType(input: {
  jobCardId: string
  docType: DocType
  storagePath: string
  fileSizeMb: number
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

  return addDocument({
    jobCardId: input.jobCardId,
    docType: input.docType,
    storagePath: input.storagePath,
    fileSizeMb: input.fileSizeMb,
  })
}

export async function uploadDocumentFile(input: {
  jobCardId: string
  docType: DocType
  file: Blob
  fileName: string
  contentType?: string
}): Promise<ApiResult<DocumentRow>> {
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

  const { error: uploadError } = await supabase.storage
    .from(AUTODOC_BUCKET)
    .upload(storagePath, input.file, {
      contentType: input.contentType,
      upsert: false,
    })

  if (uploadError) return fail(uploadError)

  const sizeMb = Number((input.file.size / (1024 * 1024)).toFixed(3))
  return upsertDocumentByType({
    jobCardId: input.jobCardId,
    docType: input.docType,
    storagePath,
    fileSizeMb: sizeMb,
  })
}
