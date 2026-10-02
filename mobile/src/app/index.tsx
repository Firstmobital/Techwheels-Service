import { useEffect } from 'react'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useAuth } from '../context/AuthContext'
import { useCustomerSession } from '../context/CustomerSessionContext'
import { parseAuthCallbackUrl } from '../lib/parseAuthCallbackUrl'

function isStaffAuthDeepLink(url: string | null): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  if (lower.includes('auth-callback')) return true
  const parsed = parseAuthCallbackUrl(url)
  return Boolean(parsed.code || parsed.accessToken)
}

/** Invisible entry — SessionBootstrapGate keeps splash up until sessions are ready. */
export default function IndexRoute() {
  const router = useRouter()
  const { session } = useAuth()
  const { token } = useCustomerSession()

  useEffect(() => {
    let mounted = true

    async function route() {
      const initialUrl = await Linking.getInitialURL()
      if (!mounted) return

      if (isStaffAuthDeepLink(initialUrl)) {
        router.replace('/(auth)/auth-callback')
        return
      }

      if (token) {
        router.replace('/(customer)')
        return
      }
      if (session) {
        router.replace('/(tabs)/home')
        return
      }
      router.replace('/(audience)')
    }

    void route()

    const sub = Linking.addEventListener('url', (event) => {
      if (isStaffAuthDeepLink(event.url)) {
        router.replace('/(auth)/auth-callback')
      }
    })

    return () => {
      mounted = false
      sub.remove()
    }
  }, [token, session, router])

  return null
}
