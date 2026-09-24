import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { CustomerTheme } from '../../lib/customer/customerTheme'

import { Icon, IconName } from '../../components/ui/Icon'

const TAB_CONFIG: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Home' },
  tracker: { icon: 'map', label: 'Journey' },
  documents: { icon: 'file-text', label: 'Documents' },
  invoices: { icon: 'file', label: 'Payments' },
  helpdesk: { icon: 'info', label: 'Help' },
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
        borderTopColor: CustomerTheme.border,
        borderTopWidth: 1,
        backgroundColor: '#FFFFFF',
        paddingTop: 8,
        paddingBottom: Math.max(10, insets.bottom),
        minHeight: tabBarHeight,
        shadowColor: '#131F3D',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 8,
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
                  paddingHorizontal: 14,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: focused ? CustomerTheme.tabActiveBg : 'transparent',
                }}
              >
                <Icon
                  name={iconName}
                  size={20}
                  color={focused ? CustomerTheme.teal : CustomerTheme.inkSoft}
                  strokeWidth={focused ? 2.4 : 1.8}
                />
              </View>
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: focused ? '800' : '600',
                  color: focused ? CustomerTheme.teal : CustomerTheme.inkSoft,
                  marginTop: 2,
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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CustomerTheme.bg }}>
        <ActivityIndicator size="large" color={CustomerTheme.teal} />
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
        sceneStyle: { backgroundColor: CustomerTheme.bg, paddingBottom: 94 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="tracker" options={{ title: 'Journey', tabBarLabel: 'Journey' }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents', tabBarLabel: 'Documents' }} />
      <Tabs.Screen name="invoices" options={{ title: 'Payments', tabBarLabel: 'Payments' }} />
      <Tabs.Screen name="helpdesk" options={{ title: 'Help', tabBarLabel: 'Help' }} />
      <Tabs.Screen name="estimate" options={{ href: null, title: 'Estimate' }} />
      <Tabs.Screen name="gatepass" options={{ href: null, title: 'Gate Pass' }} />
      <Tabs.Screen name="feedback" options={{ href: null, title: 'Review' }} />
      <Tabs.Screen name="complaint" options={{ href: null, title: 'Report Problem' }} />
      <Tabs.Screen name="booking" options={{ href: null, title: 'Book Service' }} />
      <Tabs.Screen name="my-bookings" options={{ href: null, title: 'My Bookings' }} />
    </Tabs>
  )
}
