import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function IndexRoute() {
  const { loading, session } = useAuth()

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (session) {
    return <Redirect href="/(tabs)/import" />
  }

  return <Redirect href="/(auth)/login" />
}
