import { useMemo, useState } from 'react'
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { StaffScreenShell } from '../../components/staff/StaffScreenShell'

type SearchItem = {
  id: string
  title: string
  subtitle: string
  route: '/(tabs)/home' | '/(tabs)/autodoc' | '/(tabs)/import' | '/(tabs)/reports' | '/(tabs)/admin' | '/(tabs)/settings' | '/(tabs)/driver-tasks' | '/(tabs)/alerts'
  icon: string
}

const SEARCH_ITEMS: SearchItem[] = [
  {
    id: 'home',
    title: 'Platform Home',
    subtitle: 'Launcher overview with module cards',
    route: '/(tabs)/home',
    icon: '🏠',
  },
  {
    id: 'alerts',
    title: 'Alerts',
    subtitle: 'Cross-module activity feed',
    route: '/(tabs)/alerts',
    icon: '🔔',
  },
  {
    id: 'driver-tasks',
    title: 'Driver Tasks',
    subtitle: 'Pickup & drop navigation, customer calls and status sync',
    route: '/(tabs)/driver-tasks',
    icon: '🚗',
  },
  {
    id: 'autodoc',
    title: 'Body & Paint (AutoDoc)',
    subtitle: 'Job cards, workflow stages, documentation',
    route: '/(tabs)/autodoc',
    icon: '🎨',
  },
  {
    id: 'import',
    title: 'Import Data',
    subtitle: 'Upload CSV/XLSX datasets by branch',
    route: '/(tabs)/import',
    icon: '📥',
  },
  {
    id: 'reports',
    title: 'Reports',
    subtitle: 'Revenue and service analytics',
    route: '/(tabs)/reports',
    icon: '📊',
  },
  {
    id: 'admin',
    title: 'Admin',
    subtitle: 'Role-based administration controls',
    route: '/(tabs)/admin',
    icon: '👨‍💼',
  },
  {
    id: 'settings',
    title: 'Settings',
    subtitle: 'Profile, notifications and app preferences',
    route: '/(tabs)/settings',
    icon: '⚙️',
  },
]

export default function SearchScreen() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SEARCH_ITEMS
    return SEARCH_ITEMS.filter(
      (item) => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <StaffScreenShell
      title="Search"
      subtitle="Find any module quickly. Everything stays reachable from Home or this list."
    >
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="px-4 pt-4">
          <View className="bg-white rounded-2xl border border-slate-200 px-3 py-2 flex-row items-center">
            <Text className="mr-2" accessibilityElementsHidden importantForAccessibility="no">
              🔍
            </Text>
            <TextInput
              className="flex-1 text-slate-900"
              placeholder="Search module, action, workflow..."
              placeholderTextColor="#94a3b8"
              value={query}
              onChangeText={setQuery}
              accessibilityLabel="Search modules and workflows"
            />
          </View>
        </View>

        <View className="px-4 pt-4">
          {filtered.map((item) => (
            <TouchableOpacity
              key={item.id}
              className="bg-white border border-slate-200 rounded-xl px-3 py-3 mb-2 flex-row items-center"
              activeOpacity={0.75}
              onPress={() => router.push(item.route)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
            >
              <View className="h-10 w-10 rounded-xl bg-slate-100 items-center justify-center mr-3">
                <Text>{item.icon}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-900 font-semibold">{item.title}</Text>
                <Text className="text-slate-500 text-xs mt-0.5">{item.subtitle}</Text>
              </View>
              <Text className="text-slate-400">→</Text>
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && (
            <View className="bg-white border border-slate-200 rounded-xl px-3 py-4">
              <Text className="text-slate-800 font-semibold">No matches</Text>
              <Text className="text-slate-500 text-sm mt-1">Try searching by module name like Reports or AutoDoc.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </StaffScreenShell>
  )
}
