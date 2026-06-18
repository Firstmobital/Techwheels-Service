const fs = require('fs')
const path = require('path')

const appJson = require('./app.json')

const envValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return undefined
}

module.exports = ({ config }) => {
  const fallbackConfig = appJson.expo || {}
  const merged = {
    ...fallbackConfig,
    ...config,
  }

  const androidGoogleServicesFile =
    envValue('EXPO_ANDROID_GOOGLE_SERVICES_FILE', 'ANDROID_GOOGLE_SERVICES_FILE') ||
    (fs.existsSync(path.resolve(__dirname, 'google-services.json'))
      ? path.resolve(__dirname, 'google-services.json')
      : undefined)

  const iosGoogleServicesFile =
    envValue('EXPO_IOS_GOOGLE_SERVICES_FILE', 'IOS_GOOGLE_SERVICES_FILE') ||
    (fs.existsSync(path.resolve(__dirname, 'GoogleService-Info.plist'))
      ? path.resolve(__dirname, 'GoogleService-Info.plist')
      : undefined)

  return {
    ...merged,
    android: {
      ...(merged.android || {}),
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
    },
    ios: {
      ...(merged.ios || {}),
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
    extra: {
      ...(merged.extra || {}),
      supabaseUrl: envValue('EXPO_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'),
      supabaseAnonKey: envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'),
      awsRegion: envValue('EXPO_PUBLIC_AWS_REGION', 'AWS_REGION'),
      awsAccessKeyId: envValue('EXPO_PUBLIC_AWS_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'),
      awsSecretAccessKey: envValue('EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'),
      s3BucketName: envValue('EXPO_PUBLIC_S3_BUCKET_NAME', 'S3_BUCKET_NAME'),
    },
  }
}
