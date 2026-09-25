import * as FileSystem from 'expo-file-system/legacy'
import { customerUploadBodyshopAsset } from '../api/customerBodyshopUploads'

const MAX_BYTES = 15 * 1024 * 1024

export async function assertFileWithinSizeLimit(uri: string): Promise<number> {
  const fileInfo = await FileSystem.getInfoAsync(uri)
  const fileSize = fileInfo.exists && 'size' in fileInfo ? Number(fileInfo.size || 0) : 0
  if (!fileSize) throw new Error('Unable to read the selected file.')
  if (fileSize > MAX_BYTES) throw new Error('Please upload a file smaller than 15 MB.')
  return fileSize
}

export async function uploadClaimDocument(input: {
  sessionToken: string
  regNumber: string
  docKey: string
  uri: string
  fileName: string
  contentType: string
}) {
  await assertFileWithinSizeLimit(input.uri)
  await customerUploadBodyshopAsset({
    sessionToken: input.sessionToken,
    regNumber: input.regNumber,
    kind: 'document',
    docKey: input.docKey,
    uri: input.uri,
    fileName: input.fileName,
    contentType: input.contentType,
  })
}

export async function uploadDamagePhoto(input: {
  sessionToken: string
  regNumber: string
  uri: string
  fileName: string
  contentType: string
}) {
  await assertFileWithinSizeLimit(input.uri)
  await customerUploadBodyshopAsset({
    sessionToken: input.sessionToken,
    regNumber: input.regNumber,
    kind: 'photo',
    uri: input.uri,
    fileName: input.fileName,
    contentType: input.contentType,
  })
}
