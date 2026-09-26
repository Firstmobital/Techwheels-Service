import { Linking } from 'react-native'
import { supabase } from '../supabase'

export async function openReceptionDocument(input: {
  driveUrl?: string | null
  storagePath?: string | null
  bucket?: string
}): Promise<void> {
  const drive = String(input.driveUrl || '').trim()
  if (drive) {
    await Linking.openURL(drive)
    return
  }
  const path = String(input.storagePath || '').trim()
  if (!path) {
    throw new Error('This document is not available yet.')
  }
  const bucket = input.bucket || 'autodoc'
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    throw new Error('Unable to open this document.')
  }
  await Linking.openURL(data.signedUrl)
}
