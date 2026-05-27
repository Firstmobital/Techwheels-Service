import '../env-compat'
import '../global.css'
import { Stack } from 'expo-router'
import { AuthProvider } from '../context/AuthContext'
import { OfflineProvider } from '../context/OfflineContext'

export default function RootLayout() {
  return (
    <AuthProvider>
      <OfflineProvider>
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
