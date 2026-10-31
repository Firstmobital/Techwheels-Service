/** Shared customer portal session expiry detection and login redirect (MOBILE-017). */

export function isCustomerSessionExpiredMessage(message: string | null | undefined): boolean {
  return String(message ?? '').includes('Session expired')
}

export type CustomerSessionExpiredRouter = {
  replace: (href: string) => void
}

export type CustomerSignOutFn = () => Promise<void>

export function customerLoginHrefAfterExpiry(returnTo?: 'terms'): string {
  const params = new URLSearchParams({ reason: 'expired' })
  if (returnTo === 'terms') {
    params.set('returnTo', 'terms')
  }
  return `/(customer-auth)/login?${params.toString()}`
}

export async function routeCustomerSessionExpired(
  router: CustomerSessionExpiredRouter,
  signOut: CustomerSignOutFn,
  returnTo?: 'terms',
): Promise<void> {
  await signOut()
  router.replace(customerLoginHrefAfterExpiry(returnTo))
}
