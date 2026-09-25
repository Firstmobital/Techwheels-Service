import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { useAuth } from '../context/AuthContext'
import { useCustomerSession } from '../context/CustomerSessionContext'

/** Invisible entry — SessionBootstrapGate keeps splash up until sessions are ready. */
export default function IndexRoute() {
  const router = useRouter()
  const { session } = useAuth()
  const { token } = useCustomerSession()

  useEffect(() => {
    if (token) {
      router.replace('/(customer)')
      return
    }
    if (session) {
      router.replace('/(tabs)/home')
      return
    }
    router.replace('/(audience)')
  }, [token, session, router])

  return null
}
