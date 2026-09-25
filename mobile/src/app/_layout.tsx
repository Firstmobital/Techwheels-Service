import '../env-compat'
import '../global.css'
import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import * as Font from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans'
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono'
import { AuthProvider } from '../context/AuthContext'
import { CustomerSessionProvider } from '../context/CustomerSessionContext'
import { OfflineProvider } from '../context/OfflineContext'
import MandatoryUpdateModal from '../components/MandatoryUpdateModal'
import { SessionBootstrapGate } from '../components/auth/SessionBootstrapGate'
import { useMandatoryOTAUpdate } from '../hooks/useMandatoryOTAUpdate'

void SplashScreen.preventAutoHideAsync().catch(() => {})

// AppShell is inside all providers so hooks can safely access any context
function AppShell() {
  const {
    modalVisible,
    checkingUpdate,
    applyingUpdate,
    updateErrorMessage,
    applyMandatoryUpdate,
  } = useMandatoryOTAUpdate()

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(audience)" options={{ headerShown: false }} />
        <Stack.Screen name="(customer-auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(customer)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="job-cards" options={{ headerShown: false }} />
        <Stack.Screen name="help-tickets" options={{ headerShown: false }} />
      </Stack>
      <MandatoryUpdateModal
        visible={modalVisible}
        isApplyingUpdate={applyingUpdate}
        isCheckingUpdate={checkingUpdate}
        errorMessage={updateErrorMessage}
        onUpdateNow={applyMandatoryUpdate}
      />
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadFonts() {
      try {
        await Font.loadAsync({
          'SpaceGrotesk_400Regular': SpaceGrotesk_400Regular,
          'SpaceGrotesk_500Medium': SpaceGrotesk_500Medium,
          'SpaceGrotesk_600SemiBold': SpaceGrotesk_600SemiBold,
          'SpaceGrotesk_700Bold': SpaceGrotesk_700Bold,
          'PlusJakartaSans_400Regular': PlusJakartaSans_400Regular,
          'PlusJakartaSans_500Medium': PlusJakartaSans_500Medium,
          'PlusJakartaSans_600SemiBold': PlusJakartaSans_600SemiBold,
          'PlusJakartaSans_700Bold': PlusJakartaSans_700Bold,
          'JetBrainsMono_400Regular': JetBrainsMono_400Regular,
          'JetBrainsMono_500Medium': JetBrainsMono_500Medium,
          'JetBrainsMono_600SemiBold': JetBrainsMono_600SemiBold,
        })
      } catch (e) {
        console.warn('Font load non-critical error:', e)
      } finally {
        if (isMounted) {
          setFontsLoaded(true)
        }
      }
    }

    void loadFonts()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <AuthProvider>
      <CustomerSessionProvider>
        <OfflineProvider>
          <SessionBootstrapGate fontsLoaded={fontsLoaded}>
            <AppShell />
          </SessionBootstrapGate>
        </OfflineProvider>
      </CustomerSessionProvider>
    </AuthProvider>
  )
}

