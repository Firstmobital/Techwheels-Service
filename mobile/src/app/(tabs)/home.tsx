import { useMemo } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'

type ModuleTile = {
  key: string
  label: string
  icon: string
  badge: 'LIVE' | 'SOON' | 'NEW'
  route?: '/(tabs)/autodoc' | '/(tabs)/reports' | '/(tabs)/import' | '/(tabs)/admin' | '/(tabs)/settings' | '/(tabs)/floor-incharge'
}

const MODULES: ModuleTile[] = [
  { key: 'autodoc', label: 'Body & Paint', icon: '🎨', badge: 'LIVE', route: '/(tabs)/autodoc' },
  { key: 'reports', label: 'Reports', icon: '📊', badge: 'LIVE', route: '/(tabs)/reports' },
  { key: 'import', label: 'Import Data', icon: '📥', badge: 'LIVE', route: '/(tabs)/import' },
  { key: 'admin', label: 'Admin', icon: '👨‍💼', badge: 'LIVE', route: '/(tabs)/admin' },
  { key: 'settings', label: 'Settings', icon: '⚙️', badge: 'LIVE', route: '/(tabs)/settings' },
  { key: 'floor_incharge', label: 'Floor Incharge', icon: '🔩', badge: 'LIVE', route: '/(tabs)/floor-incharge' },
]

const ACTIVITY_FEED = [
  {
    id: '1',
    icon: '🎨',
    title: 'Body & Paint workflow is active',
    meta: 'Module ready for live usage',
    time: 'now',
  },
  {
    id: '2',
    icon: '📊',
    title: 'Reports dashboard available',
    meta: 'Revenue and KPI insights are synced',
    time: 'recent',
  },
  {
    id: '3',
    icon: '📥',
    title: 'Bulk imports enabled',
    meta: 'Upload CSV/XLSX datasets across branches',
    time: 'recent',
  },
  {
    id: '4',
    icon: '👨‍💼',
    title: 'Admin controls available by role',
    meta: 'Access is protected via role checks',
    time: 'recent',
  },
]

export default function PlatformHomeScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const insets = useSafeAreaInsets()

  const displayName = useMemo(() => {
    const fromMetadata = String(user?.user_metadata?.full_name ?? '').trim()
    if (fromMetadata) return fromMetadata

    const email = String(user?.email ?? '').trim()
    if (!email) return 'Team'

    const username = email.split('@')[0] || 'Team'
    return username.replace(/[._-]+/g, ' ')
  }, [user?.email, user?.user_metadata])

  const openModule = (tile: ModuleTile) => {
    if (!tile.route) {
      return
    }
    router.push(tile.route)
  }

  return (
    <ScrollView className="flex-1 bg-slate-100" contentContainerStyle={{ paddingBottom: 28 }}>
      <View className="px-4 pb-5 bg-slate-900" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <View className="h-10 w-10 rounded-xl bg-blue-600 items-center justify-center mr-3">
              <Text className="text-lg">🔧</Text>
            </View>
            <View>
              <Text className="text-white text-base font-bold">Techwheels</Text>
              <Text className="text-blue-300 text-xs tracking-wider">SERVICE PLATFORM</Text>
            </View>
          </View>
          <View className="flex-row">
            <TouchableOpacity
              className="h-9 w-9 rounded-full bg-white/10 items-center justify-center mr-2"
              onPress={() => router.push('/(tabs)/alerts')}
            >
              <Text>🔔</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="h-9 w-9 rounded-full bg-white/10 items-center justify-center"
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Text>👤</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text className="text-blue-200 text-sm">Good morning,</Text>
        <Text className="text-white text-2xl font-bold mt-1">{displayName} 👋</Text>

        <TouchableOpacity
          className="mt-4 bg-white/10 border border-white/15 rounded-2xl px-4 py-3 flex-row items-center"
          onPress={() => router.push('/(tabs)/search')}
        >
          <Text className="text-blue-200 mr-2">🔍</Text>
          <Text className="text-slate-300 flex-1">Search module, job card, report...</Text>
          <Text className="text-blue-300">⊡</Text>
        </TouchableOpacity>
      </View>

      <View className="px-4 -mt-4">
        <View className="bg-white rounded-2xl border border-slate-200 flex-row overflow-hidden">
          <View className="flex-1 items-center py-3 border-r border-slate-100">
              <Text className="text-blue-600 text-xl font-bold">6</Text>
            <Text className="text-slate-500 text-xs mt-1">Live Modules</Text>
          </View>
          <View className="flex-1 items-center py-3 border-r border-slate-100">
              <Text className="text-orange-600 text-xl font-bold">0</Text>
            <Text className="text-slate-500 text-xs mt-1">Planned Modules</Text>
          </View>
          <View className="flex-1 items-center py-3">
            <Text className="text-emerald-600 text-xl font-bold">1</Text>
            <Text className="text-slate-500 text-xs mt-1">Platform Home</Text>
          </View>
        </View>
      </View>

      <View className="px-4 pt-5">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-900 text-base font-bold">Service Modules</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/search')}>
            <Text className="text-blue-600 font-semibold">Manage →</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap -mx-1">
          {MODULES.map((tile) => {
            const isLive = tile.badge === 'LIVE'
            const badgeStyle = isLive ? 'bg-emerald-100 text-emerald-700' : tile.badge === 'NEW' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
            return (
              <View key={tile.key} className="w-1/3 px-1 mb-2">
                <TouchableOpacity
                  className={`bg-white rounded-2xl border border-slate-200 p-3 min-h-[124px] ${!tile.route ? 'opacity-70' : ''}`}
                  activeOpacity={0.75}
                  onPress={() => openModule(tile)}
                  disabled={!tile.route}
                >
                  <View className={`self-end rounded-md px-2 py-0.5 ${badgeStyle}`}>
                    <Text className="text-[10px] font-bold">{tile.badge}</Text>
                  </View>
                  <View className="h-11 w-11 rounded-xl bg-slate-100 items-center justify-center mt-1">
                    <Text className="text-xl">{tile.icon}</Text>
                  </View>
                  <Text className="text-slate-800 text-xs font-semibold mt-2 leading-4">{tile.label}</Text>
                </TouchableOpacity>
              </View>
            )
          })}
        </View>
      </View>

      <View className="px-4 pt-2">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-900 text-base font-bold">Recent Platform Activity</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/alerts')}>
            <Text className="text-blue-600 font-semibold">See all →</Text>
          </TouchableOpacity>
        </View>

        {ACTIVITY_FEED.map((item) => (
          <View key={item.id} className="bg-white border border-slate-200 rounded-2xl px-3 py-3 mb-2 flex-row items-center">
            <View className="h-10 w-10 rounded-xl bg-slate-100 items-center justify-center mr-3">
              <Text>{item.icon}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-slate-900 text-sm font-semibold">{item.title}</Text>
              <Text className="text-slate-500 text-xs mt-0.5">{item.meta}</Text>
            </View>
            <Text className="text-slate-400 text-xs">{item.time}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}