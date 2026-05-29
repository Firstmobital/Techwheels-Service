import { Redirect, Tabs } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { ActivityIndicator, TouchableOpacity, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TAB_ICON: Record<string, string> = {
  home: '🏠',
  search: '🔍',
  new: '➕',
  alerts: '🔔',
  profile: '👤',
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
        elevation: 24,
        flexDirection: 'row',
        borderTopColor: '#e5e7eb',
        borderTopWidth: 1,
        backgroundColor: '#ffffff',
        paddingTop: 8,
        paddingBottom: Math.max(8, insets.bottom),
        minHeight: tabBarHeight,
      }}
    >
      {visibleRoutes.map((route: any) => {
        const index = state.routes.findIndex((candidate: any) => candidate.key === route.key)
        const focused = state.index === index
        const options = descriptors[route.key]?.options ?? {}
        const label = options.tabBarLabel ?? options.title ?? route.name
        const icon = TAB_ICON[route.name] ?? '•'
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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 48,
              paddingTop: isCenter ? 0 : 4,
            }}
          >
            {isCenter ? (
              <>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    marginTop: -26,
                    backgroundColor: '#2563eb',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#2563eb',
                    shadowOpacity: 0.3,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 8,
                  }}
                >
                  <Text style={{ fontSize: 22, color: '#fff' }}>{icon}</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: focused ? '#2563eb' : '#999', marginTop: 2 }}>
                  {String(label)}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>{icon}</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: focused ? '#2563eb' : '#999' }}>
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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
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
          headerShown: true,
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
    </Tabs>
  )
}
