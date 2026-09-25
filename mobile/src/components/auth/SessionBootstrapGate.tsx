import { ReactNode, useEffect } from 'react'
import * as SplashScreen from 'expo-splash-screen'
import { useAuth } from '../../context/AuthContext'
import { useCustomerSession } from '../../context/CustomerSessionContext'

/**
 * Keeps the native splash visible until staff + customer sessions are restored,
 * so the audience chooser / index spinner does not flash before redirect.
 */
export function SessionBootstrapGate({
  fontsLoaded,
  children,
}: {
  fontsLoaded: boolean
  children: ReactNode
}) {
  const { loading: staffLoading } = useAuth()
  const { loading: customerLoading } = useCustomerSession()
  const bootstrapping = staffLoading || customerLoading || !fontsLoaded

  useEffect(() => {
    if (bootstrapping) return
    void SplashScreen.hideAsync()
  }, [bootstrapping])

  if (bootstrapping) {
    return null
  }

  return <>{children}</>
}
