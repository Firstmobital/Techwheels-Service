import { View, Text } from 'react-native'

export default function AutoDocScreen() {
  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold mb-6">Job Cards</Text>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">📋 Active Jobs</Text>
        <Text className="text-gray-600">0 job cards in progress</Text>
      </View>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">📷 Photo Capture</Text>
        <Text className="text-gray-600">Attach photos to job cards</Text>
      </View>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">📄 Estimates</Text>
        <Text className="text-gray-600">Create and manage estimates</Text>
      </View>

      <View className="bg-white rounded-lg p-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">🚗 Vehicle Lookup</Text>
        <Text className="text-gray-600">Search vehicle registration details</Text>
      </View>
    </View>
  )
}
