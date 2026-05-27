import { View, Text } from 'react-native'

export default function SettingsScreen() {
  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold mb-6">Settings</Text>

      <View className="bg-white rounded-lg overflow-hidden border border-gray-200 mb-4">
        <View className="p-4 border-b border-gray-200">
          <Text className="text-lg font-semibold text-gray-800">👤 Profile</Text>
        </View>
        <View className="p-4">
          <Text className="text-gray-600">Email: user@example.com</Text>
          <Text className="text-gray-600 mt-2">Role: Technician</Text>
        </View>
      </View>

      <View className="bg-white rounded-lg overflow-hidden border border-gray-200 mb-4">
        <View className="p-4 border-b border-gray-200">
          <Text className="text-lg font-semibold text-gray-800">🏢 Dealer Info</Text>
        </View>
        <View className="p-4">
          <Text className="text-gray-600">Dealer: FIRST MOBITEL PVT. LTD.</Text>
          <Text className="text-gray-600 mt-2">Code: 3000840</Text>
        </View>
      </View>

      <View className="bg-white rounded-lg overflow-hidden border border-gray-200">
        <View className="p-4 border-b border-gray-200">
          <Text className="text-lg font-semibold text-gray-800">⚙️ App Settings</Text>
        </View>
        <View className="p-4">
          <Text className="text-gray-600">Version: 1.0.0</Text>
          <Text className="text-gray-600 mt-2">Last Updated: Today</Text>
        </View>
      </View>
    </View>
  )
}
