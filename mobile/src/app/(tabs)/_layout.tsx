import { Redirect, Tabs } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { ActivityIndicator, TouchableOpacity, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon, type IconName } from '../../components/ui/Icon'

const TAB_CONFIG: Record<string, { icon: IconName; label: string }> = {
  home: { icon: 'home', label: 'Home' },
  search: { icon: 'search', label: 'Search' },
  new: { icon: 'plus', label: 'New' },
  alerts: { icon: 'bell', label: 'Alerts' },
  profile: { icon: 'user', label: 'Profile' },
}

const VISIBLE_TABS = ['home', 'search', 'new', 'alerts', 'profile']

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets()
  const tabBarHeight = 64 + Math.max(10, insets.bottom)
  const visibleRoutes = state.routes.filter((route: any) => VISIBLE_TABS.includes(route.name))

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        elevation: 12,
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
      }}
    >
      {visibleRoutes.map((route: any) => {
        const index = state.routes.findIndex((candidate: any) => candidate.key === route.key)
        const focused = state.index === index
        const options = descriptors[route.key]?.options ?? {}
        const config = TAB_CONFIG[route.name] || { icon: 'home', label: route.name }
        const label = options.tabBarLabel ?? options.title ?? config.label
        const isCenter = route.name === 'new'

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          })

          if (!focused && !event.defaultPrevented) {
            navigation.navigate({ name: route.name, merge: true })
          }
        }

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 48,
            }}
          >
            {isCenter ? (
              <>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    marginTop: -20,
                    backgroundColor: '#2563eb',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#2563eb',
                    shadowOpacity: 0.35,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 6,
                  }}
                >
                  <Icon name="plus" size={22} color="#ffffff" strokeWidth={2.6} />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: focused ? '800' : '600',
                    color: focused ? '#2563eb' : '#64748b',
                    marginTop: 2,
                  }}
                >
                  {String(label)}
                </Text>
              </>
            ) : (
              <>
                <View
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: focused ? '#eff6ff' : 'transparent',
                  }}
                >
                  <Icon
                    name={config.icon}
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
              </>
            )}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export default function TabsLayout() {
  const { loading, session } = useAuth()
  const { token } = useCustomerSession()

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (token && !session) {
    return <Redirect href="/(customer)" />
  }

  if (!session) {
    return <Redirect href="/(audience)" />
  }

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        sceneStyle: {
          backgroundColor: '#ffffff',
          paddingBottom: 92,
        },
        headerTintColor: '#2563eb',
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarLabel: 'Search',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="new"
        options={{
          title: 'New',
          tabBarLabel: 'New',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarLabel: 'Alerts',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="import"
        options={{
          title: 'Import Data',
          headerShown: true,
          href: null,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          headerShown: true,
          href: null,
        }}
      />
      <Tabs.Screen
        name="autodoc"
        options={{
          title: 'Body & Paint',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerShown: true,
          href: null,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          headerShown: true,
          href: null,
        }}
      />
      <Tabs.Screen
        name="floor-incharge"
        options={{
          title: 'Floor Incharge',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="bodyshop-repair"
        options={{
          title: 'Bodyshop Repair',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="bodyshop-floor"
        options={{
          title: 'Bodyshop Floor',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="reception"
        options={{
          title: 'Reception',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="telecalling"
        options={{
          title: 'Telecalling',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="driver-tasks"
        options={{
          title: 'Driver Tasks',
          headerShown: false,
          href: null,
        }}
      />
    </Tabs>
  )
}
