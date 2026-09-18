import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import { useCustomerSession } from '../../context/CustomerSessionContext'

const TAB_ICON: Record<string, string> = {
  index: '🏠',
  complaint: '🚨',
  estimate: '📋',
  invoices: '🧾',
  gatepass: '🎟️',
  feedback: '⭐',
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
        borderTopColor: '#e5e7eb',
        borderTopWidth: 1,
        backgroundColor: '#ffffff',
        paddingTop: 8,
        paddingBottom: Math.max(8, insets.bottom),
        minHeight: tabBarHeight,
      }}
    >
      {state.routes
        .filter((route: any) => Boolean(TAB_ICON[route.name]))
        .map((route: any) => {
        const index = state.routes.findIndex((candidate: any) => candidate.key === route.key)
        const focused = state.index === index
        const options = descriptors[route.key]?.options ?? {}
        const label = options.tabBarLabel ?? options.title ?? route.name
        const icon = TAB_ICON[route.name] ?? '•'
        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => navigation.navigate({ name: route.name, merge: true })}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48 }}
          >
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>{icon}</Text>
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: focused ? '#2563eb' : '#94a3b8' }}>
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
        <ActivityIndicator size="large" color="#0284c7" />
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
        sceneStyle: { backgroundColor: '#ffffff', paddingBottom: 92 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="complaint" options={{ title: 'Problem', tabBarLabel: 'Problem' }} />
      <Tabs.Screen name="estimate" options={{ title: 'Estimate', tabBarLabel: 'Estimate' }} />
      <Tabs.Screen name="invoices" options={{ title: 'Bills', tabBarLabel: 'Bills' }} />
      <Tabs.Screen name="gatepass" options={{ title: 'Gate Pass', tabBarLabel: 'Gate Pass' }} />
      <Tabs.Screen name="feedback" options={{ title: 'Feedback', tabBarLabel: 'Feedback' }} />
      <Tabs.Screen name="booking" options={{ href: null, title: 'Book Service' }} />
      <Tabs.Screen name="my-bookings" options={{ href: null, title: 'My Bookings' }} />
      <Tabs.Screen name="tracker" options={{ href: null, title: 'Repair Tracker' }} />
      <Tabs.Screen name="helpdesk" options={{ href: null, title: 'Helpdesk & Escalation' }} />
    </Tabs>
  )
}
