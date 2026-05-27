import '@/env-compat'
import { Stack } from 'expo-router'
import { useColorScheme } from 'react-native'
import { AuthProvider } from '@/context/AuthContext'
import { OfflineProvider } from '@/context/OfflineContext'
import { syncHandlers } from '@/lib/syncHandlers'

export default function RootLayout() {
  const colorScheme = useColorScheme()

  return (
    <AuthProvider>
      <OfflineProvider syncHandlers={syncHandlers}>
        <Stack>
          <Stack.Screen
            name="(auth)"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
            }}
          />
        </Stack>
      </OfflineProvider>
    </AuthProvider>
  )
}
