import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { useCustomerSession } from '../../context/CustomerSessionContext'

export default function AudienceLayout() {
  const { loading: staffLoading, session } = useAuth()
  const { loading: customerLoading, token } = useCustomerSession()

  if (staffLoading || customerLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (token) {
    return <Redirect href="/(customer)" />
  }

  if (session) {
    return <Redirect href="/(tabs)/home" />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  )
}
