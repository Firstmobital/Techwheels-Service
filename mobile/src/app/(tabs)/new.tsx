import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'

const QUICK_ACTIONS = [
  {
    id: 'new-job-card',
    title: 'Create Job Card',
    subtitle: 'Start a new vehicle documentation flow',
    icon: '🧾',
    route: '/job-cards/create' as const,
  },
  {
    id: 'open-autodoc',
    title: 'Open Body & Paint',
    subtitle: 'Go to AutoDoc dashboard',
    icon: '🎨',
    route: '/(tabs)/autodoc' as const,
  },
  {
    id: 'open-import',
    title: 'Import Data',
    subtitle: 'Upload branch data files',
    icon: '📥',
    route: '/(tabs)/import' as const,
  },
  {
    id: 'open-reports',
    title: 'View Reports',
    subtitle: 'Open KPI and analytics dashboards',
    icon: '📊',
    route: '/(tabs)/reports' as const,
  },
]

export default function NewActionScreen() {
  const router = useRouter()

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ paddingBottom: 24 }}>
      <View className="px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-slate-900">Create New</Text>
        <Text className="text-slate-600 text-sm mt-1">
          Central action hub for new workflows and fast module entry.
        </Text>
      </View>

      <View className="px-4">
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.id}
            className="bg-white border border-slate-200 rounded-2xl p-4 mb-2"
            activeOpacity={0.75}
            onPress={() => router.push(action.route)}
          >
            <View className="flex-row items-center">
              <View className="h-12 w-12 rounded-xl bg-blue-50 items-center justify-center mr-3">
                <Text className="text-lg">{action.icon}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-900 font-semibold">{action.title}</Text>
                <Text className="text-slate-500 text-xs mt-0.5">{action.subtitle}</Text>
              </View>
              <Text className="text-slate-400">→</Text>
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          className="bg-slate-900 rounded-2xl p-4 mt-3"
          activeOpacity={0.8}
          onPress={() =>
            Alert.alert('Roadmap Modules', 'Body Shop, Mechanical, Service Bay, Parts and Warranty can be added here as they go live.')
          }
        >
          <Text className="text-white font-semibold">Plan Upcoming Module Entry Points</Text>
          <Text className="text-slate-300 text-xs mt-1">Keep platform navigation ready before modules launch.</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}