/** Map Supabase / fetch errors to staff-friendly login messages. */
export function humanizeStaffAuthError(message: string | undefined | null): string {
  const raw = String(message ?? '').trim()
  const lower = raw.toLowerCase()

  if (!raw) {
    return 'Sign in failed. Please try again.'
  }

  if (lower.includes('network request failed') || lower.includes('failed to fetch') || lower.includes('network error')) {
    return 'Cannot reach Techwheels server. Check mobile data or Wi‑Fi, turn off VPN, set correct date/time, then try again. If others can sign in on the same network, update the app from Play Store.'
  }

  if (lower.includes('invalid login credentials') || lower.includes('invalid email or password')) {
    return 'Wrong email or password. Use Forgot password, or ask admin to reset your password.'
  }

  if (lower.includes('email not confirmed')) {
    return 'Email not verified yet. Open the verification link we sent, then sign in again.'
  }

  if (lower.includes('sign in timed out') || lower.includes('timeout')) {
    return 'Sign in timed out. Check internet connection and try again.'
  }

  if (lower.includes('app configuration missing')) {
    return raw
  }

  return raw
}
