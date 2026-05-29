import '../env-compat'
import '../global.css'
import { Stack } from 'expo-router'
import { AuthProvider } from '../context/AuthContext'
import { OfflineProvider } from '../context/OfflineContext'
import MandatoryUpdateModal from '../components/MandatoryUpdateModal'
import { useMandatoryOTAUpdate } from '../hooks/useMandatoryOTAUpdate'

export default function RootLayout() {
  const {
    modalVisible,
    checkingUpdate,
    applyingUpdate,
    updateErrorMessage,
    applyMandatoryUpdate,
  } = useMandatoryOTAUpdate()

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
          <Stack.Screen
            name="job-cards"
            options={{
              headerShown: false,
            }}
          />
        </Stack>
        <MandatoryUpdateModal
          visible={modalVisible}
          isApplyingUpdate={applyingUpdate}
          isCheckingUpdate={checkingUpdate}
          errorMessage={updateErrorMessage}
          onUpdateNow={applyMandatoryUpdate}
        />
      </OfflineProvider>
    </AuthProvider>
  )
}
