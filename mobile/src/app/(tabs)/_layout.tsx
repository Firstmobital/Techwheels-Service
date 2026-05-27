import { Tabs, useRouter } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { ActivityIndicator, View } from 'react-native'

export default function TabsLayout() {
  const { loading, session } = useAuth()
  const router = useRouter()

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (!session) {
    router.replace('/(auth)/login')
    return null
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTintColor: '#2563eb',
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          borderTopColor: '#e5e7eb',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="import"
        options={{
          title: 'Import',
          headerTitle: 'Import Data',
          tabBarLabel: 'Import',
          tabBarIcon: ({ color, size }) => (
            <View className="w-6 h-6" style={{ opacity: color === '#2563eb' ? 1 : 0.5 }}>
              <Text style={{ color, fontSize: size, fontWeight: 'bold' }}>📥</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          headerTitle: 'Reports',
          tabBarLabel: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <View className="w-6 h-6" style={{ opacity: color === '#2563eb' ? 1 : 0.5 }}>
              <Text style={{ color, fontSize: size, fontWeight: 'bold' }}>📊</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="autodoc"
        options={{
          title: 'AutoDoc',
          headerTitle: 'Job Cards',
          tabBarLabel: 'AutoDoc',
          tabBarIcon: ({ color, size }) => (
            <View className="w-6 h-6" style={{ opacity: color === '#2563eb' ? 1 : 0.5 }}>
              <Text style={{ color, fontSize: size, fontWeight: 'bold' }}>📋</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <View className="w-6 h-6" style={{ opacity: color === '#2563eb' ? 1 : 0.5 }}>
              <Text style={{ color, fontSize: size, fontWeight: 'bold' }}>⚙️</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          headerTitle: 'Admin',
          tabBarLabel: 'Admin',
          tabBarIcon: ({ color, size }) => (
            <View className="w-6 h-6" style={{ opacity: color === '#2563eb' ? 1 : 0.5 }}>
              <Text style={{ color, fontSize: size, fontWeight: 'bold' }}>👨‍💼</Text>
            </View>
          ),
        }}
      />
    </Tabs>
  )
}

import { Text } from 'react-native'
