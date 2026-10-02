import * as Linking from 'expo-linking'

/** Deep link target for Supabase email confirm / magic links (must be allowlisted in Supabase Auth). */
export function getStaffAuthRedirectUrl(): string {
  return Linking.createURL('auth-callback')
}
