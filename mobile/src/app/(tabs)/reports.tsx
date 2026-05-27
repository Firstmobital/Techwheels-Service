import { View, Text } from 'react-native'

export default function ReportsScreen() {
  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold mb-6">Reports</Text>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">📊 Labour Report</Text>
        <Text className="text-gray-600">View labour hours and productivity</Text>
      </View>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">💰 Revenue Report</Text>
        <Text className="text-gray-600">Track revenue by department</Text>
      </View>

      <View className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">📈 Performance</Text>
        <Text className="text-gray-600">Analyze key performance metrics</Text>
      </View>

      <View className="bg-white rounded-lg p-4 border border-gray-200">
        <Text className="text-lg font-semibold text-gray-800 mb-2">🔧 Parts Report</Text>
        <Text className="text-gray-600">Parts inventory and consumption</Text>
      </View>
    </View>
  )
}
