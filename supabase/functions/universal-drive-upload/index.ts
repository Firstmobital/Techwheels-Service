import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5.9.6'

type UploadBody = {
  resource_type?: 'document' | 'panel_photo' | 'reception_estimate' | 'reception_invoice' | 'bodyshop_intake_photo'
  resourceType?: 'document' | 'panel_photo' | 'reception_estimate' | 'reception_invoice' | 'bodyshop_intake_photo'
  bucket_id?: string
  bucketId?: string
  object_name?: string
  objectName?: string
  job_card_id?: string
  jobCardId?: string
  reception_entry_id?: number | string
  receptionEntryId?: number | string
  resource_id?: number | string
  resourceId?: number | string
  doc_type?: string
  docType?: string
  file_type?: string
  fileType?: string
  file_size_mb?: number
  fileSizeMb?: number
}

type DriveUploadResult = {
  fileId: string
  driveUrl: string
  wasReplaced: boolean
}

const DOC_TYPES = new Set([
  'ppt_pre',
  'ppt_post',
  'excel_estimate',
  'service_history',
  'video_job_card',
  'car_image',
  'video_delivery',
])

const PHOTO_TYPES = new Set([
  'defect',
  'primer',
  'paint',
])

// Techwheels canonical Drive root: all registration subfolders must be created only under this folder.
const TECHWHEELS_ROOT_FOLDER_ID = '1qbNABzrPC1OdqAFtPhJ6HZHpEOT7hWCQ'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function normalizeBody(body: UploadBody) {
  const rawResourceType = String(body.resource_type ?? body.resourceType ?? 'document').trim().toLowerCase()
  const resourceType = rawResourceType === 'panel_photo'
    ? 'panel_photo'
    : rawResourceType === 'reception_estimate'
      ? 'reception_estimate'
      : rawResourceType === 'reception_invoice'
        ? 'reception_invoice'
        : rawResourceType === 'bodyshop_intake_photo'
          ? 'bodyshop_intake_photo'
      : 'document'
  const bucketId = String(body.bucket_id ?? body.bucketId ?? 'autodoc').trim()
  const objectName = String(body.object_name ?? body.objectName ?? '').trim().replace(/^\/+/, '')
  const jobCardId = String(body.job_card_id ?? body.jobCardId ?? '').trim()
  const receptionEntryId = String(body.reception_entry_id ?? body.receptionEntryId ?? '').trim()
  const resourceId = String(body.resource_id ?? body.resourceId ?? '').trim()
  const fileType = String(body.file_type ?? body.fileType ?? body.doc_type ?? body.docType ?? '').trim()
  const fileSizeMb = Number(body.file_size_mb ?? body.fileSizeMb ?? 0)
  return { resourceType, bucketId, objectName, jobCardId, receptionEntryId, resourceId, fileType, fileSizeMb }
}

function toYmd(input: string | null | undefined): string {
  const date = input ? new Date(input) : new Date()
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

function extFromPath(path: string): string {
  const base = path.split('/').at(-1) ?? ''
  const ext = base.includes('.') ? base.split('.').at(-1) ?? '' : ''
  const clean = ext.toLowerCase().replace(/[^a-z0-9]/g, '')
  return clean.length > 0 ? clean : 'bin'
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function sanitizeFilenamePart(value: string): string {
  const clean = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_-]/g, '')
  return clean.length > 0 ? clean : 'UNKNOWN'
}

function extractDriveFolderId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (!trimmed.includes('http')) return trimmed

  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match?.[1]) return match[1]

  try {
    const url = new URL(trimmed)
    const fromIdParam = url.searchParams.get('id')
    return fromIdParam?.trim() ?? ''
  } catch {
    return ''
  }
}

function decodeServiceAccountKey(rawBase64: string): string {
  const decoded = atob(rawBase64)
  const maybeUnescaped = decoded.includes('\\n') ? decoded.replace(/\\n/g, '\n') : decoded
  if (maybeUnescaped.includes('BEGIN PRIVATE KEY')) return maybeUnescaped
  const normalized = maybeUnescaped.replace(/\r/g, '').replace(/\n/g, '')
  const lines = normalized.match(/.{1,64}/g) ?? []
  return [
    '-----BEGIN PRIVATE KEY-----',
    ...lines,
    '-----END PRIVATE KEY-----',
  ].join('\n')
}

async function fetchGoogleAccessToken(input: {
  serviceEmail: string
  privateKeyPem: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const alg = 'RS256'
  const key = await importPKCS8(input.privateKeyPem, alg)

  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/drive',
  })
    .setProtectedHeader({ alg, typ: 'JWT' })
    .setIssuer(input.serviceEmail)
    .setSubject(input.serviceEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    throw new Error(`Failed to fetch Google access token: ${text}`)
  }

  const payload = await tokenRes.json() as { access_token?: string }
  if (!payload.access_token) throw new Error('Google access token missing in response')
  return payload.access_token
}

async function ensureFolder(input: {
  accessToken: string
  parentId: string
  folderName: string
  cache: Map<string, string>
}): Promise<string> {
  const cacheKey = `${input.parentId}:${input.folderName}`
  const cached = input.cache.get(cacheKey)
  if (cached) return cached

  const q = [
    `'${escapeDriveQueryValue(input.parentId)}' in parents`,
    `name='${escapeDriveQueryValue(input.folderName)}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    'trashed=false',
  ].join(' and ')

  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&spaces=drive`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${input.accessToken}` },
    },
  )

  if (!listRes.ok) {
    const text = await listRes.text()
    throw new Error(`Failed to list Drive folder: ${text}`)
  }

  const listJson = await listRes.json() as { files?: Array<{ id: string }> }
  const existingId = listJson.files?.[0]?.id
  if (existingId) {
    input.cache.set(cacheKey, existingId)
    return existingId
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [input.parentId],
    }),
  })

  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`Failed to create Drive folder: ${text}`)
  }

  const folder = await createRes.json() as { id?: string }
  if (!folder.id) throw new Error('Drive folder create response missing id')

  input.cache.set(cacheKey, folder.id)
  return folder.id
}

function buildMultipartBody(metadata: Record<string, unknown>, bytes: Uint8Array, mimeType: string, boundary: string): Uint8Array {
  const encoder = new TextEncoder()
  const prelude = encoder.encode(
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`,
  )
  const ending = encoder.encode(`\r\n--${boundary}--`)

  const out = new Uint8Array(prelude.length + bytes.length + ending.length)
  out.set(prelude, 0)
  out.set(bytes, prelude.length)
  out.set(ending, prelude.length + bytes.length)
  return out
}

async function patchDriveFileContent(input: {
  accessToken: string
  fileId: string
  bytes: Uint8Array
  mimeType: string
  fileName: string
}): Promise<boolean> {
  const mediaRes = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(input.fileId)}?uploadType=media&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': input.mimeType,
      },
      body: input.bytes as unknown as BodyInit,
    },
  )

  if (!mediaRes.ok) {
    if (mediaRes.status === 403 || mediaRes.status === 404) return false
    const text = await mediaRes.text()
    throw new Error(`Drive media patch failed: ${text}`)
  }

  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: input.fileName }),
  })

  if (!metaRes.ok) {
    const text = await metaRes.text()
    throw new Error(`Drive metadata patch failed: ${text}`)
  }

  return true
}

async function createDriveFile(input: {
  accessToken: string
  folderId: string
  fileName: string
  bytes: Uint8Array
  mimeType: string
}): Promise<string> {
  const boundary = `drive_boundary_${crypto.randomUUID()}`
  const body = buildMultipartBody(
    {
      name: input.fileName,
      parents: [input.folderId],
    },
    input.bytes,
    input.mimeType,
    boundary,
  )

  const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: body as unknown as BodyInit,
  })

  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`Drive create failed: ${text}`)
  }

  const file = await createRes.json() as { id?: string }
  if (!file.id) throw new Error('Drive create response missing id')
  return file.id
}

async function makeDriveFilePublic(input: { accessToken: string; fileId: string }) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}/permissions?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to make Drive file public: ${text}`)
  }
}

function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

async function logPendingUpload(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('pending_drive_uploads').insert(payload)
  if (error) {
    console.warn('[universal-drive-upload] pending log write failed:', error.message)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed', error_code: 'VALIDATION_ERROR' })
  }

  try {
    const body = normalizeBody(await req.json() as UploadBody)
    const isReceptionUpload = body.resourceType === 'reception_estimate' || body.resourceType === 'reception_invoice'
    const isBodyshopIntakeUpload = body.resourceType === 'bodyshop_intake_photo'

    if (!isReceptionUpload && !isBodyshopIntakeUpload && !body.jobCardId) {
      return json(400, { ok: false, error: 'job_card_id is required', error_code: 'VALIDATION_ERROR' })
    }
    if (isReceptionUpload && !body.receptionEntryId) {
      return json(400, { ok: false, error: 'reception_entry_id is required', error_code: 'VALIDATION_ERROR' })
    }
    if (isBodyshopIntakeUpload && !body.resourceId) {
      return json(400, { ok: false, error: 'resource_id is required', error_code: 'VALIDATION_ERROR' })
    }
    if (!body.objectName) {
      return json(400, { ok: false, error: 'object_name is required', error_code: 'VALIDATION_ERROR' })
    }
    if (!isReceptionUpload && !body.fileType) {
      return json(400, {
        ok: false,
        error: 'file_type is required',
        error_code: 'VALIDATION_ERROR',
      })
    }

    if (body.resourceType === 'document' && !DOC_TYPES.has(body.fileType)) {
      return json(400, {
        ok: false,
        error: 'file_type must be a valid document type',
        error_code: 'VALIDATION_ERROR',
      })
    }

    if (body.resourceType === 'panel_photo' && !PHOTO_TYPES.has(body.fileType)) {
      return json(400, {
        ok: false,
        error: 'file_type must be one of defect|primer|paint for panel_photo resource',
        error_code: 'VALIDATION_ERROR',
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const serviceAccountEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const serviceAccountPrivateKeyBase64 = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64')
    const serviceAccountPrivateKeyRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
    const rootFolderInput = (
      Deno.env.get('GDRIVE_TECHWHEELS_SERVICE_FOLDER_ID')
      ?? Deno.env.get('GDRIVE_TECHWHEELS_SERVICE_FOLDER_URL')
      ?? Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')
      ?? Deno.env.get('GOOGLE_DRIVE_FOLDER_URL')
      ?? TECHWHEELS_ROOT_FOLDER_ID
    )
    const configuredRootFolderId = extractDriveFolderId(rootFolderInput)
    const rootFolderId = TECHWHEELS_ROOT_FOLDER_ID

    if (!supabaseUrl || !serviceRole || !serviceAccountEmail || (!serviceAccountPrivateKeyBase64 && !serviceAccountPrivateKeyRaw) || !rootFolderId) {
      return json(500, {
        ok: false,
        error: 'Missing required server env configuration',
        error_code: 'SERVER_CONFIG_ERROR',
      })
    }

    if (configuredRootFolderId && configuredRootFolderId !== TECHWHEELS_ROOT_FOLDER_ID) {
      console.warn(
        '[universal-drive-upload] Ignoring non-canonical root folder config and enforcing Techwheels root folder.',
      )
    }

    const supabase = createClient(supabaseUrl, serviceRole)

    let registrationNo = ''

    let rowId = ''
    let rowCreatedAt: string | null = null
    let existingDriveFileId = ''
    let effectiveFileType = body.fileType || 'estimate'

    if (body.resourceType === 'document') {
      const { data: jobCard, error: jobCardErr } = await supabase
        .from('job_cards')
        .select('reg_number')
        .eq('id', body.jobCardId)
        .maybeSingle<{ reg_number: string | null }>()

      if (jobCardErr) {
        return json(500, { ok: false, error: jobCardErr.message, error_code: 'DB_ERROR' })
      }

      registrationNo = (jobCard?.reg_number ?? '').trim()
      if (!registrationNo) {
        return json(400, {
          ok: false,
          error: 'Registration number not found for job card',
          error_code: 'REGISTRATION_NOT_FOUND',
        })
      }

      const { data: docRows, error: docQueryErr } = await supabase
        .from('documents')
        .select('id, created_at, drive_file_id, doc_type')
        .eq('job_card_id', body.jobCardId)
        .eq('doc_type', body.fileType)
        .eq('storage_path', body.objectName)
        .order('created_at', { ascending: false })
        .limit(1)

      if (docQueryErr) {
        return json(500, { ok: false, error: docQueryErr.message, error_code: 'DB_ERROR' })
      }

      const docRow = docRows?.[0]
      if (!docRow?.id) {
        return json(404, {
          ok: false,
          error: 'Document row not found for upload payload',
          error_code: 'DOCUMENT_NOT_FOUND',
        })
      }

      rowId = docRow.id
      rowCreatedAt = docRow.created_at
      existingDriveFileId = String(docRow.drive_file_id ?? '').trim()
      effectiveFileType = String(docRow.doc_type ?? body.fileType)
    } else if (body.resourceType === 'panel_photo') {
      const { data: jobCard, error: jobCardErr } = await supabase
        .from('job_cards')
        .select('reg_number')
        .eq('id', body.jobCardId)
        .maybeSingle<{ reg_number: string | null }>()

      if (jobCardErr) {
        return json(500, { ok: false, error: jobCardErr.message, error_code: 'DB_ERROR' })
      }

      registrationNo = (jobCard?.reg_number ?? '').trim()
      if (!registrationNo) {
        return json(400, {
          ok: false,
          error: 'Registration number not found for job card',
          error_code: 'REGISTRATION_NOT_FOUND',
        })
      }

      const { data: photoRows, error: photoQueryErr } = await supabase
        .from('panel_photos')
        .select('id, created_at, drive_file_id, photo_type')
        .eq('job_card_id', body.jobCardId)
        .eq('storage_path', body.objectName)
        .order('created_at', { ascending: false })
        .limit(1)

      if (photoQueryErr) {
        return json(500, { ok: false, error: photoQueryErr.message, error_code: 'DB_ERROR' })
      }

      const photoRow = photoRows?.[0]
      if (!photoRow?.id) {
        return json(404, {
          ok: false,
          error: 'Panel photo row not found for upload payload',
          error_code: 'PHOTO_NOT_FOUND',
        })
      }

      rowId = photoRow.id
      rowCreatedAt = photoRow.created_at
      existingDriveFileId = String(photoRow.drive_file_id ?? '').trim()
      effectiveFileType = String(photoRow.photo_type ?? body.fileType)
    } else if (body.resourceType === 'bodyshop_intake_photo') {
      const intakePhotoId = Number(body.resourceId)
      if (!Number.isFinite(intakePhotoId)) {
        return json(400, {
          ok: false,
          error: 'Invalid resource_id for bodyshop_intake_photo',
          error_code: 'VALIDATION_ERROR',
        })
      }

      const { data: intakeRows, error: intakeErr } = await supabase
        .from('bodyshop_intake_vehicle_photos')
        .select('id, created_at, reg_number, drive_file_id')
        .eq('id', intakePhotoId)
        .limit(1)

      if (intakeErr) {
        return json(500, { ok: false, error: intakeErr.message, error_code: 'DB_ERROR' })
      }

      const intakeRow = intakeRows?.[0]
      if (!intakeRow?.id) {
        return json(404, {
          ok: false,
          error: 'Bodyshop intake photo row not found for upload payload',
          error_code: 'BODYSHOP_INTAKE_PHOTO_NOT_FOUND',
        })
      }

      registrationNo = String(intakeRow.reg_number ?? '').trim()
      if (!registrationNo) {
        return json(400, {
          ok: false,
          error: 'Registration number not found for bodyshop intake photo row',
          error_code: 'REGISTRATION_NOT_FOUND',
        })
      }

      rowId = String(intakeRow.id)
      rowCreatedAt = intakeRow.created_at
      existingDriveFileId = String(intakeRow.drive_file_id ?? '').trim()
      effectiveFileType = body.fileType || 'bodyshop_intake_photo'
    } else {
      const receptionId = Number(body.receptionEntryId)
      if (!Number.isFinite(receptionId)) {
        return json(400, {
          ok: false,
          error: 'Invalid reception_entry_id',
          error_code: 'VALIDATION_ERROR',
        })
      }

      const { data: receptionRows, error: receptionErr } = await supabase
        .from('service_reception_entries')
        .select('id, created_at, reg_number, estimate_drive_file_id, invoice_drive_file_id')
        .eq('id', receptionId)
        .limit(1)

      if (receptionErr) {
        return json(500, { ok: false, error: receptionErr.message, error_code: 'DB_ERROR' })
      }

      const receptionRow = receptionRows?.[0]
      if (!receptionRow?.id) {
        return json(404, {
          ok: false,
          error: 'Reception entry row not found for upload payload',
          error_code: 'RECEPTION_ENTRY_NOT_FOUND',
        })
      }

      registrationNo = String(receptionRow.reg_number ?? '').trim()
      if (!registrationNo) {
        return json(400, {
          ok: false,
          error: 'Registration number not found for reception entry',
          error_code: 'REGISTRATION_NOT_FOUND',
        })
      }

      rowId = String(receptionRow.id)
      rowCreatedAt = receptionRow.created_at
      existingDriveFileId = body.resourceType === 'reception_invoice'
        ? String(receptionRow.invoice_drive_file_id ?? '').trim()
        : String(receptionRow.estimate_drive_file_id ?? '').trim()
      effectiveFileType = body.fileType || (body.resourceType === 'reception_invoice' ? 'invoice' : 'estimate')
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from(body.bucketId)
      .download(body.objectName)

    if (dlErr || !blob) {
      return json(500, {
        ok: false,
        error: dlErr?.message ?? 'Storage download failed',
        error_code: 'STORAGE_ERROR',
      })
    }

    const fileBytes = new Uint8Array(await blob.arrayBuffer())
    const ext = extFromPath(body.objectName)
    const normalizedReg = sanitizeFilenamePart(registrationNo)
    const normalizedFileType = sanitizeFilenamePart(effectiveFileType)
    const datePart = toYmd(rowCreatedAt)
    const driveFileName = body.resourceType === 'document'
      ? `${normalizedReg}_${normalizedFileType}_${datePart}.${ext}`
      : body.resourceType === 'panel_photo'
        ? `${normalizedReg}_PANEL_${normalizedFileType}_${datePart}_${rowId.slice(0, 8)}.${ext}`
        : body.resourceType === 'bodyshop_intake_photo'
          ? `${normalizedReg}_SA_BODYSHOP_PHOTO_${datePart}_${rowId}.${ext}`
        : body.resourceType === 'reception_invoice'
          ? `${normalizedReg}_SA_INVOICE_${datePart}_${rowId}.${ext}`
          : `${normalizedReg}_SA_ESTIMATE_${datePart}_${rowId}.${ext}`

    const privateKeyPem = serviceAccountPrivateKeyBase64
      ? decodeServiceAccountKey(serviceAccountPrivateKeyBase64)
      : String(serviceAccountPrivateKeyRaw ?? '').replace(/\\n/g, '\n').trim()

    if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) {
      return json(500, {
        ok: false,
        error: 'Invalid Google service account private key format',
        error_code: 'SERVER_CONFIG_ERROR',
      })
    }

    const accessToken = await fetchGoogleAccessToken({
      serviceEmail: serviceAccountEmail,
      privateKeyPem,
    })

    const folderCache = new Map<string, string>()
    const regFolderId = await ensureFolder({
      accessToken,
      parentId: rootFolderId,
      folderName: normalizedReg,
      cache: folderCache,
    })

    let fileId = existingDriveFileId
    let wasReplaced = false
    const mimeType = blob.type || 'application/octet-stream'

    if (fileId) {
      wasReplaced = await patchDriveFileContent({
        accessToken,
        fileId,
        bytes: fileBytes,
        mimeType,
        fileName: driveFileName,
      })
    }

    if (!fileId || !wasReplaced) {
      fileId = await createDriveFile({
        accessToken,
        folderId: regFolderId,
        fileName: driveFileName,
        bytes: fileBytes,
        mimeType,
      })
    }

    const driveUrl = driveViewUrl(fileId)
    const makePublic = (Deno.env.get('MAKE_DRIVE_FILE_PUBLIC') ?? '').toLowerCase() === 'true'
    if (makePublic) {
      await makeDriveFilePublic({ accessToken, fileId })
    }

    const updatePayload = body.resourceType === 'reception_estimate'
      ? {
          estimate_drive_url: driveUrl,
          estimate_drive_file_id: fileId,
          estimate_storage_path: body.objectName,
          estimate_file_name: body.objectName.split('/').at(-1) ?? null,
          estimate_content_type: mimeType,
          estimate_uploaded_at: new Date().toISOString(),
        }
      : body.resourceType === 'reception_invoice'
        ? {
            invoice_drive_url: driveUrl,
            invoice_drive_file_id: fileId,
            invoice_storage_path: body.objectName,
            invoice_file_name: body.objectName.split('/').at(-1) ?? null,
            invoice_content_type: mimeType,
            invoice_uploaded_at: new Date().toISOString(),
          }
        : body.resourceType === 'bodyshop_intake_photo'
          ? {
              drive_url: driveUrl,
              drive_file_id: fileId,
            }
        : {
            drive_url: driveUrl,
            drive_file_id: fileId,
          }
    const targetTable = body.resourceType === 'document'
      ? 'documents'
      : body.resourceType === 'panel_photo'
        ? 'panel_photos'
        : body.resourceType === 'bodyshop_intake_photo'
          ? 'bodyshop_intake_vehicle_photos'
        : 'service_reception_entries'
    const { error: updateErr } = await supabase
      .from(targetTable)
      .update(updatePayload)
      .eq('id', rowId)

    if (updateErr) {
      await logPendingUpload(supabase, {
        resource_type: body.resourceType,
        resource_id: rowId,
        job_card_id: body.jobCardId || null,
        doc_type: effectiveFileType,
        registration_no: normalizedReg,
        storage_bucket: body.bucketId,
        storage_path: body.objectName,
        drive_file_id: fileId,
        drive_url: driveUrl,
        status: 'db_update_failed',
        error_message: updateErr.message,
      })

      return json(500, {
        ok: false,
        error: `Drive upload succeeded but ${targetTable} table update failed`,
        error_code: 'DB_ERROR',
        db_update_error: updateErr.message,
      })
    }

    const deleteFromStorage = (Deno.env.get('DRIVE_DELETE_SOURCE_OBJECT') ?? '').toLowerCase() === 'true'
    let storageDeleteError: string | null = null

    if (deleteFromStorage) {
      const { error: removeErr } = await supabase.storage
        .from(body.bucketId)
        .remove([body.objectName])
      if (removeErr) storageDeleteError = removeErr.message
    }

    await logPendingUpload(supabase, {
      resource_type: body.resourceType,
      resource_id: rowId,
      job_card_id: body.jobCardId || null,
      doc_type: effectiveFileType,
      registration_no: normalizedReg,
      storage_bucket: body.bucketId,
      storage_path: body.objectName,
      drive_file_id: fileId,
      drive_url: driveUrl,
      status: storageDeleteError ? 'storage_delete_failed' : 'completed',
      error_message: storageDeleteError,
    })

    const result: DriveUploadResult = {
      fileId,
      driveUrl,
      wasReplaced,
    }

    return json(200, {
      ok: true,
      link: driveUrl,
      resource_type: body.resourceType,
      file_type: effectiveFileType,
      drive_file_id: fileId,
      drive_url: driveUrl,
      storage_path: body.objectName,
      doc_type: effectiveFileType,
      registration_no: normalizedReg,
      cleanup_performed: deleteFromStorage && !storageDeleteError,
      result,
    })
  } catch (err) {
    return json(500, {
      ok: false,
      error: (err as Error).message,
      error_code: 'DRIVE_ERROR',
    })
  }
})
