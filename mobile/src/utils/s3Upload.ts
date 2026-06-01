import { Platform } from 'react-native'

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
  if (Platform.OS === 'web') {
    throw new Error('S3 upload is not supported on web build for logger.')
  }

  // Temporary stability guard: avoid loading react-native-aws3 in Android release builds.
  // This keeps logging local while preventing release-only native init crashes.
  if (Platform.OS === 'android' && !__DEV__) {
    return {
      status: 204,
      body: 'android-release-s3-upload-disabled',
    }
  }

  const { RNS3 } = await import('react-native-aws3')
  return RNS3.put(file, s3Options as never)
}
