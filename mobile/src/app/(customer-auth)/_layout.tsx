import { Redirect, Stack, usePathname } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { useCustomerSession } from '../../context/CustomerSessionContext'

export default function CustomerAuthLayout() {
  const pathname = usePathname()
  const onTermsRoute = pathname?.includes('/terms') ?? false
  const { loading: staffLoading, session } = useAuth()
  const { loading: customerLoading, token, termsNeedsAcceptance } = useCustomerSession()

  if (staffLoading || customerLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (token && termsNeedsAcceptance && !onTermsRoute) {
    return <Redirect href="/(customer-auth)/terms" />
  }

  if (token && !termsNeedsAcceptance) {
    return <Redirect href="/(customer)" />
  }

  if (session) {
    return <Redirect href="/(tabs)/home" />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="terms" options={{ gestureEnabled: false }} />
    </Stack>
  )
}
