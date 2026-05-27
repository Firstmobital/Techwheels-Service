import { View, Text } from 'react-native'

export default function AdminScreen() {
  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold mb-6">Admin</Text>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">👥 User Management</Text>
        <Text className="text-gray-600">Manage users and roles</Text>
      </View>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">🔐 Permissions</Text>
        <Text className="text-gray-600">Configure module access</Text>
      </View>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">📋 Audit Log</Text>
        <Text className="text-gray-600">View system activity</Text>
      </View>

      <View className="bg-white rounded-lg p-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">⚙️ System Settings</Text>
        <Text className="text-gray-600">Configure app settings</Text>
      </View>
    </View>
  )
}
