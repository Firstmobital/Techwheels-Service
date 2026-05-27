import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native'

interface MenuOption {
  title: string
  icon: string
  description: string
  color: string
  onPress: () => void
}

export default function AutoDocScreen() {
  const [syncEnabled, setSyncEnabled] = useState(true)

  const menuOptions: MenuOption[] = [
    {
      title: 'Active Jobs',
      icon: '📋',
      description: '0 job cards in progress',
      color: 'blue',
      onPress: () => Alert.alert('Active Jobs', 'Feature coming soon'),
    },
    {
      title: 'Create Job Card',
      icon: '✏️',
      description: 'Start a new job card',
      color: 'green',
      onPress: () => Alert.alert('Create Job Card', 'Feature coming soon'),
    },
    {
      title: 'Photo Capture',
      icon: '📷',
      description: 'Attach photos to jobs',
      color: 'purple',
      onPress: () => Alert.alert('Photo Capture', 'Feature coming soon'),
    },
    {
      title: 'Estimates',
      icon: '💵',
      description: 'Create and manage estimates',
      color: 'orange',
      onPress: () => Alert.alert('Estimates', 'Feature coming soon'),
    },
    {
      title: 'Vehicle Lookup',
      icon: '🚗',
      description: 'Search registration details',
      color: 'red',
      onPress: () => Alert.alert('Vehicle Lookup', 'Feature coming soon'),
    },
    {
      title: 'AutoDoc Rate Lookup',
      icon: '📊',
      description: 'Get repair rates and time',
      color: 'indigo',
      onPress: () => Alert.alert('Rate Lookup', 'Feature coming soon'),
    },
  ]

  const getColorClasses = (color: string) => {
    const colors: { [key: string]: string } = {
      blue: 'bg-blue-50 border-blue-200',
      green: 'bg-green-50 border-green-200',
      purple: 'bg-purple-50 border-purple-200',
      orange: 'bg-orange-50 border-orange-200',
      red: 'bg-red-50 border-red-200',
      indigo: 'bg-indigo-50 border-indigo-200',
    }
    return colors[color] || colors.blue
  }

  const getTextColorClasses = (color: string) => {
    const colors: { [key: string]: string } = {
      blue: 'text-blue-700',
      green: 'text-green-700',
      purple: 'text-purple-700',
      orange: 'text-orange-700',
      red: 'text-red-700',
      indigo: 'text-indigo-700',
    }
    return colors[color] || colors.blue
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-gray-800 mb-1">Job Cards</Text>
        <Text className="text-sm text-gray-600">Manage job cards and estimates</Text>
      </View>

      {/* Sync Status */}
      <View className="bg-white border-b border-gray-200 px-4 py-4 flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-semibold text-gray-800">Auto Sync</Text>
          <Text className="text-xs text-gray-500 mt-1">Sync changes to cloud</Text>
        </View>
        <Switch
          value={syncEnabled}
          onValueChange={setSyncEnabled}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={syncEnabled ? '#2563eb' : '#f3f4f6'}
        />
      </View>

      {/* Menu Grid */}
      <View className="p-4">
        {menuOptions.map((option, idx) => (
          <TouchableOpacity
            key={idx}
            className={`${getColorClasses(option.color)} rounded-lg mb-3 p-4 border active:opacity-75`}
            onPress={option.onPress}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <View className="flex-row items-center mb-2">
                  <Text className="text-2xl mr-3">{option.icon}</Text>
                  <Text className={`text-lg font-semibold ${getTextColorClasses(option.color)}`}>
                    {option.title}
                  </Text>
                </View>
                <Text className="text-sm text-gray-600">{option.description}</Text>
              </View>
              <Text className="text-lg text-gray-400">→</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Information Box */}
      <View className="px-4 pb-6">
        <View className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <Text className="font-semibold text-blue-700 mb-2">💡 Pro Tip</Text>
          <Text className="text-sm text-blue-600">
            Enable Auto Sync to automatically upload job card changes when you're online. Offline changes will sync automatically when connection is restored.
          </Text>
        </View>
      </View>
    </ScrollView>
  )
}
