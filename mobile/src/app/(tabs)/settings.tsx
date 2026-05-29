import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, RefreshControl } from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { useRouter } from 'expo-router'

interface SettingItem {
  label: string
  value: string | boolean
  type: 'text' | 'toggle' | 'action'
  onPress?: () => void
}

export default function SettingsScreen() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const [notifications, setNotifications] = useState(true)
  const [autoSync, setAutoSync] = useState(true)
  const [offlineMode, setOfflineMode] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = () => {
    setRefreshing(true)
    setTimeout(() => {
      setRefreshing(false)
    }, 300)
  }

  const handleLogout = async () => {
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

  const handleChangePassword = () => {
    Alert.alert('Change Password', 'Feature coming soon')
  }

  const handleEditProfile = () => {
    Alert.alert('Edit Profile', 'Feature coming soon')
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 pt-4 pb-4">
        <Text className="text-2xl font-bold text-gray-800 mb-1">Settings</Text>
        <Text className="text-sm text-gray-600">Manage your account and preferences</Text>
      </View>

      {/* Profile Section */}
      <View className="px-4 pt-4">
        <Text className="text-sm font-semibold text-gray-700 mb-2">👤 Profile</Text>
        
        <View className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <TouchableOpacity
            className="p-4 border-b border-gray-200 flex-row items-center justify-between active:bg-gray-50"
            onPress={handleEditProfile}
          >
            <View className="flex-1">
              <Text className="text-gray-600 text-sm">Email</Text>
              <Text className="text-gray-800 font-semibold mt-1">{user?.email || 'Not loaded'}</Text>
            </View>
            <Text className="text-gray-400">→</Text>
          </TouchableOpacity>

          <View className="p-4 border-b border-gray-200">
            <Text className="text-gray-600 text-sm">Role</Text>
            <Text className="text-gray-800 font-semibold mt-1">Technician</Text>
          </View>

          <TouchableOpacity
            className="p-4 flex-row items-center justify-between active:bg-gray-50"
            onPress={handleChangePassword}
          >
            <Text className="text-blue-600 font-semibold">Change Password</Text>
            <Text className="text-gray-400">→</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dealer Info Section */}
      <View className="px-4 pt-4">
        <Text className="text-sm font-semibold text-gray-700 mb-2">🏢 Dealer Information</Text>
        
        <View className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <View className="p-4 border-b border-gray-200">
            <Text className="text-gray-600 text-sm">Dealer Name</Text>
            <Text className="text-gray-800 font-semibold mt-1">FIRST MOBITEL PVT. LTD.</Text>
          </View>

          <View className="p-4 border-b border-gray-200">
            <Text className="text-gray-600 text-sm">Dealer Code</Text>
            <Text className="text-gray-800 font-semibold mt-1">3000840</Text>
          </View>

          <View className="p-4">
            <Text className="text-gray-600 text-sm">Location</Text>
            <Text className="text-gray-800 font-semibold mt-1">Service Center</Text>
          </View>
        </View>
      </View>

      {/* App Settings Section */}
      <View className="px-4 pt-4">
        <Text className="text-sm font-semibold text-gray-700 mb-2">⚙️ App Settings</Text>
        
        <View className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <View className="p-4 border-b border-gray-200 flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-gray-800 font-semibold">Push Notifications</Text>
              <Text className="text-xs text-gray-500 mt-1">Receive job and system alerts</Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={notifications ? '#2563eb' : '#f3f4f6'}
            />
          </View>

          <View className="p-4 border-b border-gray-200 flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-gray-800 font-semibold">Auto Sync</Text>
              <Text className="text-xs text-gray-500 mt-1">Sync data when online</Text>
            </View>
            <Switch
              value={autoSync}
              onValueChange={setAutoSync}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={autoSync ? '#2563eb' : '#f3f4f6'}
            />
          </View>

          <View className="p-4 border-b border-gray-200 flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-gray-800 font-semibold">Offline Mode</Text>
              <Text className="text-xs text-gray-500 mt-1">Work without internet</Text>
            </View>
            <Switch
              value={offlineMode}
              onValueChange={setOfflineMode}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={offlineMode ? '#2563eb' : '#f3f4f6'}
            />
          </View>

          <View className="p-4">
            <Text className="text-gray-600 text-sm">Version</Text>
            <Text className="text-gray-800 font-semibold mt-1">1.0.0 (Build 1)</Text>
          </View>
        </View>
      </View>

      {/* Danger Zone */}
      <View className="px-4 pt-4 pb-6">
        <TouchableOpacity
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex-row items-center justify-between active:bg-red-100"
          onPress={handleLogout}
        >
          <View>
            <Text className="text-red-700 font-semibold">Logout</Text>
            <Text className="text-xs text-red-600 mt-1">End your session</Text>
          </View>
          <Text className="text-red-600 text-lg">→</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}
