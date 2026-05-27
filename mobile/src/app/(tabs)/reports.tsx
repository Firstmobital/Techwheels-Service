import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'

interface ReportCard {
  title: string
  icon: string
  description: string
  color: string
  action: () => void
}

export default function ReportsScreen() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const generateReport = async (reportType: string) => {
    setLoading(true)
    // Simulate report generation
    setTimeout(() => {
      setLoading(false)
    }, 1500)
  }

  const reports: ReportCard[] = [
    {
      title: 'Labour Report',
      icon: '👷',
      description: 'View labour hours and productivity metrics',
      color: 'from-blue-500 to-blue-600',
      action: () => generateReport('labour'),
    },
    {
      title: 'Revenue Report',
      icon: '💰',
      description: 'Track revenue by department and period',
      color: 'from-green-500 to-green-600',
      action: () => generateReport('revenue'),
    },
    {
      title: 'Performance Report',
      icon: '📈',
      description: 'Analyze key performance indicators',
      color: 'from-purple-500 to-purple-600',
      action: () => generateReport('performance'),
    },
    {
      title: 'Parts Report',
      icon: '🔧',
      description: 'Parts inventory and consumption analysis',
      color: 'from-orange-500 to-orange-600',
      action: () => generateReport('parts'),
    },
  ]

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 pt-4 pb-4">
        <Text className="text-2xl font-bold text-gray-800 mb-1">Reports</Text>
        <Text className="text-sm text-gray-600">Analytics and performance metrics</Text>
      </View>

      {/* Date Filter */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row gap-2">
          <TouchableOpacity className="flex-1 bg-white border border-gray-200 rounded-lg py-2 px-3 items-center">
            <Text className="text-sm font-semibold text-gray-700">📅 This Month</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-1 bg-white border border-gray-200 rounded-lg py-2 px-3 items-center">
            <Text className="text-sm font-semibold text-gray-600">This Year</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Report Cards */}
      <View className="px-4 py-4">
        {reports.map((report, idx) => (
          <TouchableOpacity
            key={idx}
            className="bg-white rounded-lg mb-3 border border-gray-200 overflow-hidden active:bg-gray-50"
            onPress={report.action}
          >
            <View className="p-4">
              <View className="flex-row items-start justify-between mb-2">
                <View className="flex-row items-center flex-1">
                  <Text className="text-3xl mr-3">{report.icon}</Text>
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-gray-800">{report.title}</Text>
                    <Text className="text-sm text-gray-600 mt-1">{report.description}</Text>
                  </View>
                </View>
                <Text className="text-xl text-gray-400">→</Text>
              </View>
              
              {selectedReport === report.title && loading && (
                <View className="mt-3 flex-row items-center">
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text className="text-sm text-blue-600 ml-2">Generating...</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick Stats */}
      <View className="px-4 pb-6">
        <Text className="text-sm font-semibold text-gray-700 mb-3">Quick Stats</Text>
        
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <Text className="text-2xl font-bold text-blue-700">0</Text>
            <Text className="text-xs text-blue-600 mt-1">Active Jobs</Text>
          </View>
          
          <View className="flex-1 bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
            <Text className="text-2xl font-bold text-green-700">₹0</Text>
            <Text className="text-xs text-green-600 mt-1">Revenue</Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
            <Text className="text-2xl font-bold text-purple-700">0 hrs</Text>
            <Text className="text-xs text-purple-600 mt-1">Labour Hours</Text>
          </View>
          
          <View className="flex-1 bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
            <Text className="text-2xl font-bold text-orange-700">0</Text>
            <Text className="text-xs text-orange-600 mt-1">Parts Used</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}
