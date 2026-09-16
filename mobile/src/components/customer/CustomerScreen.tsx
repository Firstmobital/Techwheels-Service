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
  const [showNotifications, setShowNotifications] = useState(false)

  const selectedVehicle = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]

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
      if (showNotifications) {
        setShowNotifications(false)
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
  }, [isHomeScreen, showMenu, showNotifications, router])

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

  const isDelivered = Boolean(selectedVehicle?.invoice_done_at || selectedVehicle?.payment_status === 'Paid')

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
            {/* Notification Bell Icon */}
            <TouchableOpacity
              onPress={() => setShowNotifications(true)}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100 border border-slate-300 relative shadow-xs"
            >
              <Icon name="bell" size={19} color="#0f172a" strokeWidth={2.2} />
              {isDelivered && (
                <View className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white" />
              )}
            </TouchableOpacity>

            {/* High-Contrast 3-Column / Hamburger Menu Button (Black Box with Crisp White Icon) */}
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              accessibilityRole="button"
              accessibilityLabel="Open Navigation Menu"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="h-10 w-10 items-center justify-center rounded-xl bg-slate-900 border border-slate-950 shadow-md"
            >
              <Icon name="menu" size={20} color="#ffffff" strokeWidth={2.6} />
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

      {/* ── TOP-SLIDING MENU DRAWER (OPENS FROM TOP) ── */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable
          className="flex-1 bg-black/60 justify-start"
          onPress={() => setShowMenu(false)}
        >
          <Pressable
            className="bg-white rounded-b-3xl pt-12 pb-6 px-5 max-h-[85%] shadow-2xl border-b-2 border-slate-900"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <View className="flex-row items-center gap-2.5">
                <View className="w-9 h-9 rounded-xl bg-blue-600 items-center justify-center shadow-xs">
                  <Text className="text-lg">🚗</Text>
                </View>
                <View>
                  <Text className="text-slate-900 text-[16px] font-black">Customer Services Menu</Text>
                  <Text className="text-slate-500 text-[11px]">Active: {selectedReg || 'No Vehicle'}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowMenu(false)}
                className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 items-center justify-center"
              >
                <Text className="text-slate-800 font-extrabold text-sm">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="space-y-1.5 mb-3" showsVerticalScrollIndicator={false}>
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
              className="flex-row items-center justify-center bg-red-50 border border-red-200 rounded-2xl py-3"
            >
              <Icon name="log-out" size={17} color="#dc2626" strokeWidth={2} />
              <Text className="text-red-600 font-extrabold text-sm ml-2">Log Out of Customer Portal</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── NOTIFICATIONS POPUP MODAL ── */}
      <Modal
        visible={showNotifications}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifications(false)}
      >
        <Pressable
          className="flex-1 bg-black/60 justify-start"
          onPress={() => setShowNotifications(false)}
        >
          <Pressable
            className="bg-white rounded-b-3xl pt-12 pb-6 px-5 shadow-2xl border-b-2 border-blue-600"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-xl">🔔</Text>
                <Text className="text-slate-900 text-base font-black">Live Workshop Notifications</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowNotifications(false)}
                className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
              >
                <Text className="text-slate-700 font-bold">✕</Text>
              </TouchableOpacity>
            </View>

            <View className="space-y-3">
              {isDelivered ? (
                <View className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base">✅</Text>
                    <Text className="text-emerald-900 font-black text-sm">Vehicle Ready for Delivery & Billing!</Text>
                  </View>
                  <Text className="text-emerald-800 text-xs mt-1 leading-5">
                    Your vehicle <Text className="font-bold">{selectedReg}</Text> repairs and quality inspection are complete. You can make payment and collect your vehicle from the workshop.
                  </Text>
                </View>
              ) : selectedVehicle?.jc_number ? (
                <View className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base">🛠️</Text>
                    <Text className="text-blue-900 font-black text-sm">Service in Progress</Text>
                  </View>
                  <Text className="text-blue-800 text-xs mt-1 leading-5">
                    Job Card <Text className="font-bold">#{selectedVehicle.jc_number}</Text> is currently active on the workshop floor under advisor{' '}
                    <Text className="font-bold">{selectedVehicle.sa_display_name || selectedVehicle.sa_name || 'Service Team'}</Text>.
                  </Text>
                </View>
              ) : (
                <View className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                  <Text className="text-slate-600 text-xs">No pending alerts for this vehicle.</Text>
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
