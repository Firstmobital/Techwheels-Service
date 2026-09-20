type UploadFileInput = {
  uri: string
  name: string
  type: string
}

type S3Options = {
  bucket?: string
  region?: string
  accessKey?: string
  secretKey?: string
  successActionStatus?: number
}

export async function uploadFileToS3(file: UploadFileInput, s3Options: S3Options) {
  try {
    if (!s3Options.bucket || !s3Options.accessKey || !s3Options.secretKey) {
      return { status: 204, body: 's3-config-missing' }
    }
    const module = await import('react-native-aws3').catch(() => null)
    const RNS3 = module?.RNS3
    if (!RNS3 || typeof RNS3.put !== 'function') {
      return { status: 204, body: 'rns3-unavailable' }
    }
    return await RNS3.put(file, s3Options as never)
  } catch (error) {
    console.warn('S3 upload non-critical error:', error)
    return { status: 500, body: 's3-upload-error' }
  }
}

