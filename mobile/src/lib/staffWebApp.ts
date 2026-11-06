import { readEnv } from './env'

/** Production web app (Service Advisor, Technician, SA Tracker, etc.). */
export function getStaffWebAppBaseUrl(): string {
  const fromEnv = readEnv('EXPO_PUBLIC_STAFF_WEB_APP_URL', ['VITE_STAFF_WEB_APP_URL'])
  const trimmed = String(fromEnv ?? '').trim().replace(/\/$/, '')
  return trimmed || 'https://techwheels-service.vercel.app'
}

export function staffWebModuleUrl(path: string): string {
  const base = getStaffWebAppBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}
