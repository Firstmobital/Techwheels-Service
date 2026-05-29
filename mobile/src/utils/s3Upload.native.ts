import { RNS3 } from 'react-native-aws3'

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
  return RNS3.put(file, s3Options as never)
}
