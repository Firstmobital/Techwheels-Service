import { View, Text, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/context/AuthContext'

export default function ImportScreen() {
  const router = useRouter()
  const { signOut } = useAuth()

  const handleLogout = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold mb-6">Import Data</Text>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">📥 CSV Import</Text>
        <Text className="text-gray-600">Upload CSV files for job cards, invoices, and parts</Text>
      </View>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">🔄 Sync Status</Text>
        <Text className="text-gray-600">Pending: 0 | Synced: 0</Text>
      </View>

      <TouchableOpacity
        onPress={handleLogout}
        className="bg-red-500 rounded-lg py-3 mt-auto"
      >
        <Text className="text-white text-center font-semibold">Logout</Text>
      </TouchableOpacity>
    </View>
  )
}
