import { ReactNode, useEffect, useState } from 'react'
import {
  Alert,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { Icon } from '../ui/Icon'
import { VehiclePicker } from './VehiclePicker'

export function CustomerScreen({
  title,
  subtitle,
  showBackButton,
  children,
}: {
  title: string
  subtitle?: string
  showBackButton?: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { vehicles, selectedReg, setSelectedReg, signOut } = useCustomerSession()
  const [showMenu, setShowMenu] = useState(false)

  // Determine if this screen is the root customer home screen
  const isHomeScreen = pathname === '/(customer)' || pathname === '/(customer)/' || pathname === '/' || pathname === '/index'
  const shouldShowBack = showBackButton !== undefined ? showBackButton : !isHomeScreen

  // Hardware Back Button handler on Android
  useEffect(() => {
    const onBackPress = () => {
      if (showMenu) {
        setShowMenu(false)
        return true
      }
      if (!isHomeScreen) {
        if (router.canGoBack()) {
          router.back()
        } else {
          router.replace('/(customer)')
        }
        return true
      }
      return false
    }

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
    return () => backSubscription.remove()
  }, [isHomeScreen, showMenu, router])

  const handleLogout = () => {
    setShowMenu(false)
    Alert.alert('Log out', 'Sign out of the customer portal?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/(audience)')
        },
      },
    ])
  }

  const navigateTo = (route: string) => {
    setShowMenu(false)
    router.push(route as any)
  }

  const menuItems = [
    { label: 'Live Service Tracker', icon: '📊', route: '/(customer)/tracker', desc: 'Real-time job card stage & technician bay' },
    { label: 'Bills, Quotations & Receipts', icon: '🧾', route: '/(customer)/invoices', desc: 'Invoices, estimates & payments' },
    { label: 'Official Vehicle Gate Pass', icon: '🎟️', route: '/(customer)/gatepass', desc: 'Accounts approved gate clearance' },
    { label: '24x7 Helpdesk Escalation', icon: '📞', route: '/(customer)/helpdesk', desc: 'CRM, Service Manager & Tata team' },
    { label: 'Book Service Appointment', icon: '📅', route: '/(customer)/booking', desc: 'Schedule maintenance or pickup' },
    { label: 'Report Problem / Complaint', icon: '🚨', route: '/(customer)/complaint', desc: 'Log service issues or concerns' },
    { label: 'Dealership Feedback', icon: '⭐', route: '/(customer)/feedback', desc: 'Rate your service experience' },
  ]

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      {/* Top App Header */}
      <View className="bg-white border-b border-slate-200 px-4 pt-3 pb-3">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center flex-1 pr-2">
            <View className="h-10 w-10 rounded-xl bg-blue-600 items-center justify-center mr-3 shadow-sm">
              <Text className="text-xl">🚗</Text>
            </View>
            <View className="flex-1">
              <Text className="text-slate-900 text-[15px] font-black">Techwheels Customer Services</Text>
              <Text className="text-slate-500 text-[11px] font-semibold">Dealership Vehicle After-Purchase Portal</Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            {selectedReg ? (
              <View className="bg-blue-50 border border-blue-200 rounded-xl px-2.5 py-1">
                <Text className="text-[8px] font-black uppercase text-blue-500">Active Vehicle</Text>
                <Text className="text-[11.5px] font-extrabold text-blue-800">{selectedReg}</Text>
              </View>
            ) : null}

            {/* 3-Column / Hamburger Menu Button */}
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              accessibilityRole="button"
              accessibilityLabel="Open Menu"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="h-10 w-10 items-center justify-center rounded-xl bg-slate-900 shadow-sm"
            >
              <View className="items-center justify-center gap-[3.5px]">
                <View className="w-5 h-[2.5px] bg-white rounded-full" />
                <View className="w-5 h-[2.5px] bg-white rounded-full" />
                <View className="w-5 h-[2.5px] bg-white rounded-full" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Page Title Row with Back Navigation */}
        <View className="flex-row items-center mt-3 pt-1">
          {shouldShowBack && (
            <TouchableOpacity
              onPress={() => {
                if (router.canGoBack()) {
                  router.back()
                } else {
                  router.replace('/(customer)')
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back to Home"
              className="flex-row items-center bg-slate-100 active:bg-slate-200 border border-slate-200 px-3 py-1.5 rounded-xl mr-3"
            >
              <Text className="text-slate-900 font-black text-sm mr-1.5">←</Text>
              <Text className="text-slate-800 font-bold text-xs">Home</Text>
            </TouchableOpacity>
          )}
          <View className="flex-1">
            <Text className="text-slate-900 text-lg font-black leading-6">{title}</Text>
            {subtitle ? <Text className="text-slate-500 text-[12px] mt-0.5">{subtitle}</Text> : null}
          </View>
        </View>
      </View>

      {/* Main Content Body */}
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <VehiclePicker vehicles={vehicles} selectedReg={selectedReg} onSelect={setSelectedReg} />
        {children}
        <View className="mt-4 items-center">
          <Text className="text-slate-500 text-[12px] font-semibold text-center">
            Techwheels Dealership Vehicle Services · Powered by Firstmobital
          </Text>
          <Text className="text-slate-400 text-[11px] mt-1 text-center">
            After-Purchase Service & Bodyshop Management System · SRD v1.0
          </Text>
        </View>
      </ScrollView>

      {/* 3-Column Menu Modal Drawer */}
      <Modal
        visible={showMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable
          className="flex-1 bg-black/60 justify-end"
          onPress={() => setShowMenu(false)}
        >
          <Pressable
            className="bg-white rounded-t-3xl pt-5 pb-8 px-5 max-h-[85%]"
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Drag Handle */}
            <View className="items-center mb-4">
              <View className="w-12 h-1.5 bg-slate-300 rounded-full" />
            </View>

            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <View className="flex-row items-center gap-2.5">
                <View className="w-8 h-8 rounded-lg bg-blue-600 items-center justify-center">
                  <Text className="text-base">🚗</Text>
                </View>
                <View>
                  <Text className="text-slate-900 text-[16px] font-black">Customer Services Menu</Text>
                  <Text className="text-slate-500 text-[11px]">Active: {selectedReg || 'No Vehicle'}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowMenu(false)}
                className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
              >
                <Text className="text-slate-600 font-bold text-sm">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="space-y-2 mb-4" showsVerticalScrollIndicator={false}>
              {/* Home Shortcut */}
              <TouchableOpacity
                onPress={() => navigateTo('/(customer)')}
                className={`flex-row items-center p-3 rounded-2xl mb-1.5 ${isHomeScreen ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 active:bg-slate-100'}`}
              >
                <View className="w-10 h-10 rounded-xl bg-white border border-slate-200 items-center justify-center mr-3 shadow-xs">
                  <Text className="text-xl">🏠</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 font-bold text-[14px]">Customer Home / Dashboard</Text>
                  <Text className="text-slate-500 text-[11px]">Overview, quick actions & service status</Text>
                </View>
                <Text className="text-slate-400 font-bold">›</Text>
              </TouchableOpacity>

              {menuItems.map((item) => (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => navigateTo(item.route)}
                  className="flex-row items-center p-3 rounded-2xl bg-slate-50 active:bg-slate-100 mb-1.5"
                >
                  <View className="w-10 h-10 rounded-xl bg-white border border-slate-200 items-center justify-center mr-3 shadow-xs">
                    <Text className="text-xl">{item.icon}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 font-bold text-[14px]">{item.label}</Text>
                    <Text className="text-slate-500 text-[11px]">{item.desc}</Text>
                  </View>
                  <Text className="text-slate-400 font-bold">›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Logout Action */}
            <TouchableOpacity
              onPress={handleLogout}
              className="flex-row items-center justify-center bg-red-50 border border-red-200 rounded-2xl py-3.5"
            >
              <Icon name="log-out" size={18} color="#dc2626" strokeWidth={2} />
              <Text className="text-red-600 font-extrabold text-sm ml-2">Log Out of Customer Portal</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
