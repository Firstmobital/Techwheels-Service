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

export async function uploadFileToS3(_file: UploadFileInput, _s3Options: S3Options) {
  throw new Error('S3 upload is not supported on web build for logger.')
}
