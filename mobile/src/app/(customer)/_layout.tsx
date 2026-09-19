import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import { useCustomerSession } from '../../context/CustomerSessionContext'

import { Icon, IconName } from '../../components/ui/Icon'

const TAB_CONFIG: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Home' },
  tracker: { icon: 'clock', label: 'Tracker' },
  invoices: { icon: 'file-text', label: 'Bills' },
  gatepass: { icon: 'shield-check', label: 'Gate Pass' },
  feedback: { icon: 'star', label: 'Review' },
}

function CustomerTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets()
  const tabBarHeight = 64 + Math.max(10, insets.bottom)

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        borderTopColor: '#e2e8f0',
        borderTopWidth: 1,
        backgroundColor: '#ffffff',
        paddingTop: 8,
        paddingBottom: Math.max(10, insets.bottom),
        minHeight: tabBarHeight,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 10,
      }}
    >
      {state.routes
        .filter((route: any) => Boolean(TAB_CONFIG[route.name]))
        .map((route: any) => {
          const index = state.routes.findIndex((candidate: any) => candidate.key === route.key)
          const focused = state.index === index
          const options = descriptors[route.key]?.options ?? {}
          const config = TAB_CONFIG[route.name]
          const label = options.tabBarLabel ?? options.title ?? config?.label ?? route.name
          const iconName = config?.icon ?? 'home'

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => navigation.navigate({ name: route.name, merge: true })}
              activeOpacity={0.7}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48 }}
            >
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 5,
                  borderRadius: 14,
                  backgroundColor: focused ? '#eff6ff' : 'transparent',
                }}
              >
                <Icon
                  name={iconName}
                  size={20}
                  color={focused ? '#2563eb' : '#64748b'}
                  strokeWidth={focused ? 2.4 : 1.8}
                />
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: focused ? '800' : '600',
                  color: focused ? '#2563eb' : '#64748b',
                  marginTop: 2,
                  letterSpacing: 0.1,
                }}
              >
                {String(label)}
              </Text>
            </TouchableOpacity>
          )
        })}
    </View>
  )
}

export default function CustomerTabsLayout() {
  const { loading: staffLoading, session } = useAuth()
  const { loading: customerLoading, token } = useCustomerSession()

  if (staffLoading || customerLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (session && !token) {
    return <Redirect href="/(tabs)/home" />
  }

  if (!token) {
    return <Redirect href="/(audience)" />
  }

  return (
    <Tabs
      tabBar={(props) => <CustomerTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: '#f8fafc', paddingBottom: 94 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="tracker" options={{ title: 'Tracker', tabBarLabel: 'Tracker' }} />
      <Tabs.Screen name="invoices" options={{ title: 'Bills', tabBarLabel: 'Bills' }} />
      <Tabs.Screen name="gatepass" options={{ title: 'Gate Pass', tabBarLabel: 'Gate Pass' }} />
      <Tabs.Screen name="feedback" options={{ title: 'Review', tabBarLabel: 'Review' }} />
      <Tabs.Screen name="helpdesk" options={{ href: null, title: 'Support' }} />
      <Tabs.Screen name="complaint" options={{ href: null, title: 'Report Problem' }} />
      <Tabs.Screen name="estimate" options={{ href: null, title: 'Digital Estimate' }} />
      <Tabs.Screen name="booking" options={{ href: null, title: 'Book Service' }} />
      <Tabs.Screen name="my-bookings" options={{ href: null, title: 'My Bookings' }} />
    </Tabs>
  )
}
