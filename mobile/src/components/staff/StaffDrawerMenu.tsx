import { Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Icon } from '../ui/Icon'
import {
  STAFF_DRAWER_ALWAYS,
  STAFF_DRAWER_SUPPORT,
  filterStaffHomeModules,
  type StaffDrawerExtraRoute,
  type StaffModuleRoute,
} from '../../lib/staffHomeModules'

type Props = {
  visible: boolean
  onClose: () => void
  allowedModules: Set<string>
  userDisplayName?: string
}

export function StaffDrawerMenu({ visible, onClose, allowedModules, userDisplayName }: Props) {
  const router = useRouter()

  if (!visible) return null

  const modules = filterStaffHomeModules(allowedModules)

  const navigate = (route: StaffModuleRoute | StaffDrawerExtraRoute) => {
    onClose()
    router.push(route as never)
  }

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        elevation: 9999,
      }}
    >
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
        }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close navigation menu"
      />
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '88%',
          maxWidth: 360,
          bottom: 0,
          backgroundColor: '#ffffff',
          borderRightWidth: 1,
          borderRightColor: '#e2e8f0',
          shadowColor: '#0f172a',
          shadowOpacity: 0.15,
          shadowRadius: 16,
          elevation: 20,
        }}
      >
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100">
          <View className="flex-1 pr-2">
            <Text className="text-slate-900 text-lg font-black">Workshop menu</Text>
            {userDisplayName ? (
              <Text className="text-slate-500 text-xs font-semibold mt-0.5">{userDisplayName}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 items-center justify-center"
          >
            <Icon name="x" size={18} color="#334155" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-3 py-2" showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            onPress={() => navigate('/(tabs)/home')}
            className="flex-row items-center p-3 rounded-2xl bg-blue-50 border border-blue-100 mb-2"
            accessibilityRole="button"
            accessibilityLabel="Home dashboard"
          >
            <View className="w-10 h-10 rounded-xl bg-white border border-slate-200 items-center justify-center mr-3">
              <Icon name="home" size={18} color="#2563eb" strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text className="text-slate-900 font-bold text-sm">Home</Text>
              <Text className="text-slate-500 text-xs">Dashboard and quick stats</Text>
            </View>
            <Icon name="chevron-right" size={16} color="#94a3b8" />
          </TouchableOpacity>

          {STAFF_DRAWER_ALWAYS.map((item) => (
            <DrawerRow
              key={item.key}
              label={item.label}
              description={item.description}
              icon={item.icon}
              onPress={() => item.route && navigate(item.route)}
            />
          ))}

          {modules.length > 0 ? (
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider px-2 pt-3 pb-1">
              Your modules
            </Text>
          ) : null}

          {modules.map((item) => (
            <DrawerRow
              key={item.key}
              label={item.label}
              description={item.description}
              icon={item.icon}
              onPress={() => item.route && navigate(item.route)}
            />
          ))}

          <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider px-2 pt-4 pb-1">
            Support
          </Text>
          {STAFF_DRAWER_SUPPORT.map((item) => (
            <DrawerRow
              key={item.key}
              label={item.label}
              description={item.description}
              icon={item.icon}
              onPress={() => navigate(item.route)}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

function DrawerRow({
  label,
  description,
  icon,
  onPress,
}: {
  label: string
  description: string
  icon: Parameters<typeof Icon>[0]['name']
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center p-3 rounded-2xl bg-slate-50 active:bg-slate-100 mb-1.5"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View className="w-10 h-10 rounded-xl bg-white border border-slate-200 items-center justify-center mr-3">
        <Icon name={icon} size={18} color="#3b82f6" strokeWidth={2} />
      </View>
      <View className="flex-1">
        <Text className="text-slate-900 font-bold text-sm">{label}</Text>
        <Text className="text-slate-500 text-xs">{description}</Text>
      </View>
      <Icon name="chevron-right" size={16} color="#94a3b8" />
    </TouchableOpacity>
  )
}
