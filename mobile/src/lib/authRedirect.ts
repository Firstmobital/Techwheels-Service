import * as Linking from 'expo-linking'

/** Web page that shows the new-password form after the email link. */
export const STAFF_PASSWORD_RESET_WEB_URL = 'https://techwheels-service.vercel.app/auth/callback'

/** Deep link target for in-app confirm links (must be allowlisted in Supabase Auth). */
export function getStaffAuthRedirectUrl(): string {
  return Linking.createURL('auth-callback')
}

/** Password-reset mail must open the website form, not an app scheme the inbox cannot show. */
export function getStaffPasswordResetRedirectUrl(): string {
  return STAFF_PASSWORD_RESET_WEB_URL
}
