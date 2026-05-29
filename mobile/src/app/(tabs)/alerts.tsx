import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'

const ALERTS = [
  {
    id: 'a1',
    icon: '🎨',
    title: 'Body & Paint workflow active',
    detail: 'Continue job card intake and pre-repair documentation.',
    time: '2m ago',
    route: '/(tabs)/autodoc' as const,
  },
  {
    id: 'a2',
    icon: '📊',
    title: 'Reports dashboard refreshed',
    detail: 'Latest KPI summary is now available.',
    time: '14m ago',
    route: '/(tabs)/reports' as const,
  },
  {
    id: 'a3',
    icon: '📥',
    title: 'Data import module ready',
    detail: 'Upload branch files for this cycle.',
    time: '1h ago',
    route: '/(tabs)/import' as const,
  },
  {
    id: 'a4',
    icon: '👨‍💼',
    title: 'Admin access available',
    detail: 'Role-based controls are enabled for authorized users.',
    time: '2h ago',
    route: '/(tabs)/admin' as const,
  },
]

export default function AlertsScreen() {
  const router = useRouter()

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ paddingBottom: 24 }}>
      <View className="px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-slate-900">Alerts</Text>
        <Text className="text-slate-600 text-sm mt-1">Cross-module activity feed for the full platform.</Text>
      </View>

      <View className="px-4">
        {ALERTS.map((alert) => (
          <TouchableOpacity
            key={alert.id}
            className="bg-white border border-slate-200 rounded-2xl px-3 py-3 mb-2"
            onPress={() => router.push(alert.route)}
            activeOpacity={0.75}
          >
            <View className="flex-row items-center">
              <View className="h-10 w-10 rounded-xl bg-slate-100 items-center justify-center mr-3">
                <Text>{alert.icon}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-900 font-semibold">{alert.title}</Text>
                <Text className="text-slate-500 text-xs mt-0.5">{alert.detail}</Text>
              </View>
              <Text className="text-slate-400 text-xs">{alert.time}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}