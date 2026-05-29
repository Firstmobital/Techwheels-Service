import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'

export default function ProfileScreen() {
  const router = useRouter()
  const { user, signOut } = useAuth()

  const role =
    (user?.app_metadata?.role as string | undefined) ??
    (user?.user_metadata?.role as string | undefined) ??
    'Technician'

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ paddingBottom: 24 }}>
      <View className="px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-slate-900">Profile</Text>
        <Text className="text-slate-600 text-sm mt-1">Account and platform-level controls.</Text>
      </View>

      <View className="px-4">
        <View className="bg-white border border-slate-200 rounded-2xl p-4">
          <View className="h-14 w-14 rounded-full bg-blue-100 items-center justify-center mb-3">
            <Text className="text-2xl">👤</Text>
          </View>
          <Text className="text-slate-900 font-semibold">{user?.email || 'Not signed in'}</Text>
          <Text className="text-slate-500 text-sm mt-1">Role: {String(role)}</Text>
        </View>

        <TouchableOpacity
          className="bg-white border border-slate-200 rounded-xl px-4 py-3 mt-3 flex-row items-center justify-between"
          onPress={() => router.push('/(tabs)/settings')}
        >
          <View>
            <Text className="text-slate-900 font-semibold">Open Settings</Text>
            <Text className="text-slate-500 text-xs mt-0.5">Notifications, app preferences, account settings</Text>
          </View>
          <Text className="text-slate-400">→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white border border-slate-200 rounded-xl px-4 py-3 mt-2 flex-row items-center justify-between"
          onPress={() => router.push('/(tabs)/admin')}
        >
          <View>
            <Text className="text-slate-900 font-semibold">Open Admin</Text>
            <Text className="text-slate-500 text-xs mt-0.5">User management and platform controls</Text>
          </View>
          <Text className="text-slate-400">→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4"
          onPress={handleLogout}
        >
          <Text className="text-red-700 font-semibold">Logout</Text>
          <Text className="text-red-600 text-xs mt-0.5">End your session and return to login</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}