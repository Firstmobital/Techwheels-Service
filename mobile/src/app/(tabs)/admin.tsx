import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native'
import { useAuth } from '../../context/AuthContext'

interface AdminMenuItem {
  title: string
  icon: string
  description: string
  color: string
  badge?: string
  onPress: () => void
}

export default function AdminScreen() {
  const { user } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const role =
    (user?.app_metadata?.role as string | undefined) ??
    (user?.user_metadata?.role as string | undefined)
  const adminMode = typeof role === 'string' && ['admin', 'super_admin'].includes(role.toLowerCase())

  const onRefresh = () => {
    setRefreshing(true)
    setTimeout(() => {
      setRefreshing(false)
    }, 300)
  }

  const menuItems: AdminMenuItem[] = [
    {
      title: 'User Management',
      icon: '👥',
      description: 'Manage users and access',
      color: 'blue',
      badge: '3',
      onPress: () => Alert.alert('User Management', 'Feature coming soon'),
    },
    {
      title: 'Permissions',
      icon: '🔐',
      description: 'Configure module access',
      color: 'green',
      onPress: () => Alert.alert('Permissions', 'Feature coming soon'),
    },
    {
      title: 'Audit Log',
      icon: '📋',
      description: 'View system activity',
      color: 'purple',
      badge: 'New',
      onPress: () => Alert.alert('Audit Log', 'Feature coming soon'),
    },
    {
      title: 'System Settings',
      icon: '⚙️',
      description: 'Configure app settings',
      color: 'orange',
      onPress: () => Alert.alert('System Settings', 'Feature coming soon'),
    },
    {
      title: 'Database Backup',
      icon: '💾',
      description: 'Backup and restore data',
      color: 'red',
      onPress: () => Alert.alert('Database Backup', 'Feature coming soon'),
    },
    {
      title: 'Reports & Analytics',
      icon: '📊',
      description: 'View system analytics',
      color: 'indigo',
      onPress: () => Alert.alert('Reports & Analytics', 'Feature coming soon'),
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

  if (!adminMode) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center px-4">
        <Text className="text-5xl mb-4">🔒</Text>
        <Text className="text-xl font-bold text-gray-800 text-center">Access Denied</Text>
        <Text className="text-gray-600 text-center mt-2">
          Admin features are only available to administrators.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 pt-4 pb-4">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-2xl font-bold text-gray-800">Admin Panel</Text>
          <View className="bg-red-100 rounded px-3 py-1">
            <Text className="text-xs font-semibold text-red-700">ADMIN</Text>
          </View>
        </View>
        <Text className="text-sm text-gray-600">System administration and management</Text>
      </View>

      {/* Alert Banner */}
      <View className="px-4 pt-4 pb-2">
        <View className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex-row">
          <Text className="text-lg mr-2">⚠️</Text>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-yellow-800">System Access</Text>
            <Text className="text-xs text-yellow-700 mt-1">
              You have administrator privileges. Use with care.
            </Text>
          </View>
        </View>
      </View>

      {/* Menu Grid */}
      <View className="p-4">
        {menuItems.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            className={`${getColorClasses(item.color)} rounded-lg mb-3 p-4 border active:opacity-75 flex-row items-start justify-between`}
            onPress={item.onPress}
          >
            <View className="flex-1">
              <View className="flex-row items-center mb-2">
                <Text className="text-2xl mr-3">{item.icon}</Text>
                <Text className={`text-lg font-semibold ${getTextColorClasses(item.color)}`}>
                  {item.title}
                </Text>
              </View>
              <Text className="text-sm text-gray-600">{item.description}</Text>
            </View>
            <View className="flex-row items-center">
              {item.badge && (
                <View className="bg-red-500 rounded-full px-2 py-1 mr-2">
                  <Text className="text-xs font-bold text-white">{item.badge}</Text>
                </View>
              )}
              <Text className="text-lg text-gray-400">→</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick Stats */}
      <View className="px-4 pb-6">
        <Text className="text-sm font-semibold text-gray-700 mb-3">System Status</Text>
        
        <View className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <View className="p-4 border-b border-gray-200 flex-row items-center justify-between">
            <Text className="text-gray-700">Active Users</Text>
            <Text className="text-lg font-bold text-gray-800">12</Text>
          </View>
          
          <View className="p-4 border-b border-gray-200 flex-row items-center justify-between">
            <Text className="text-gray-700">Total Job Cards</Text>
            <Text className="text-lg font-bold text-gray-800">156</Text>
          </View>

          <View className="p-4 border-b border-gray-200 flex-row items-center justify-between">
            <Text className="text-gray-700">Database Size</Text>
            <Text className="text-lg font-bold text-gray-800">125 MB</Text>
          </View>

          <View className="p-4 flex-row items-center justify-between">
            <Text className="text-gray-700">Last Backup</Text>
            <Text className="text-lg font-bold text-gray-800">2 hrs ago</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}
