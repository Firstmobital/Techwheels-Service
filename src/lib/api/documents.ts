import { supabase } from '../supabase'
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
