import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCustomerVisitKind } from '../../hooks/useCustomerVisitKind'
import {
  Alert,
  BackHandler,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { manualCheckForOTAUpdate } from '../../hooks/useMandatoryOTAUpdate'
import { Icon, IconName } from '../ui/Icon'
import { VehiclePicker } from './VehiclePicker'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { ClaimFormWidget } from '../ClaimFormWidget'
import { matchInsuranceProviderId } from '../../config/insuranceProviders'
import { customerGetRepairCard } from '../../lib/api/customerPortal'
import { downloadTpAffidavitForm } from '../../lib/customer/downloadInsuranceClaimForm'
import {
  CustomerScreenRefreshContext,
  type CustomerScreenRefreshFn,
} from './customerScreenRefresh'

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
  const refreshHandlersRef = useRef(new Set<CustomerScreenRefreshFn>())
  const [pullRefreshing, setPullRefreshing] = useState(false)

  const addRefreshHandler = useCallback((fn: CustomerScreenRefreshFn) => {
    refreshHandlersRef.current.add(fn)
    return () => {
      refreshHandlersRef.current.delete(fn)
    }
  }, [])

  const handlePullRefresh = useCallback(async () => {
    const handlers = [...refreshHandlersRef.current]
    if (handlers.length === 0) return
    setPullRefreshing(true)
    try {
      await Promise.all(handlers.map((fn) => Promise.resolve(fn())))
    } finally {
      setPullRefreshing(false)
    }
  }, [])
  const router = useRouter()
  const pathname = usePathname()
  const { vehicles, selectedReg, setSelectedReg, signOut, token } = useCustomerSession()
  const [showMenu, setShowMenu] = useState(false)
  const [showClaimFormModal, setShowClaimFormModal] = useState(false)
  const [insuranceCompanyOnCard, setInsuranceCompanyOnCard] = useState<string | null>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null)

  const handleCheckAppUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateStatusMsg('Checking…')
    try {
      const res = await manualCheckForOTAUpdate((msg) => setUpdateStatusMsg(msg))
      if (res.isAvailable) {
        Alert.alert('🚀 Update Installed', 'App is restarting with the latest version!')
      } else {
        Alert.alert('App Update Status', res.message || 'You have the latest version of the app.')
      }
    } catch (e: any) {
      Alert.alert('Update Error', e?.message || 'Could not verify update. Check your connection.')
    } finally {
      setCheckingUpdate(false)
      setUpdateStatusMsg(null)
    }
  }

  const selectedVehicle = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const { isMechanical } = useCustomerVisitKind(token, selectedReg)

  // Determine if this screen is the root customer home screen
  const isHomeScreen =
    pathname === '/(customer)' ||
    pathname === '/(customer)/' ||
    pathname === '/(customer)/index' ||
    pathname === '/' ||
    pathname === '/index'
  const shouldShowBack = showBackButton !== undefined ? showBackButton : !isHomeScreen

  // Hardware Back Button handler on Android
  useEffect(() => {
    const onBackPress = () => {
      if (showClaimFormModal) {
        setShowClaimFormModal(false)
        return true
      }
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
  }, [isHomeScreen, showMenu, showNotifications, showClaimFormModal, router])

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

  const openClaimFormDownload = useCallback(async () => {
    setShowMenu(false)
    setShowClaimFormModal(true)
    if (!token) {
      setInsuranceCompanyOnCard(null)
      return
    }
    try {
      const card = await customerGetRepairCard(token, selectedReg)
      const name = String(card?.insurance_company ?? '').trim()
      setInsuranceCompanyOnCard(name || null)
    } catch {
      setInsuranceCompanyOnCard(null)
    }
  }, [token, selectedReg])

  const handleMenuAction = (action: 'claim-form' | 'tp-affidavit') => {
    if (action === 'claim-form') {
      void openClaimFormDownload()
      return
    }
    setShowMenu(false)
    void downloadTpAffidavitForm()
  }

  const isAccident = String(selectedVehicle?.service_type || '').toLowerCase().includes('accident')

  type CustomerMenuItem = {
    label: string
    icon: IconName
    desc: string
    route?: string
    menuAction?: 'claim-form' | 'tp-affidavit'
  }

  const menuItems: CustomerMenuItem[] = useMemo(() => {
    const all: CustomerMenuItem[] = [
      {
        label: isAccident ? 'Bodyshop Repair Journey' : 'Service Journey',
        icon: 'map',
        route: '/(customer)/tracker',
        desc: isAccident
          ? '18-stage accident repair, surveyor inspection & DO tracking'
          : 'Real-time job card stage & technician bay',
      },
      {
        label: 'Upload Claim Documents',
        icon: 'cloud-upload',
        route: '/(customer)/documents',
        desc: 'Upload DL, RC, policy, signed claim form & T/P affidavit',
      },
      {
        label: 'Workshop Estimate Approval',
        icon: 'check',
        route: '/(customer)/estimate',
        desc: 'Review your Service Advisor quotation and approve or reject',
      },
      {
        label: 'Download Insurance Claim Form',
        icon: 'download',
        menuAction: 'claim-form',
        desc: 'Official motor claim PDF for your insurance company',
      },
      {
        label: 'Download T/P Affidavit',
        icon: 'download',
        menuAction: 'tp-affidavit',
        desc: 'Third-party affidavit template for notarization',
      },
      { label: 'Bills, Quotations & Receipts', icon: 'file-text', route: '/(customer)/invoices', desc: 'Invoices, estimates & payments' },
      { label: 'Official Vehicle Gate Pass', icon: 'shield-check', route: '/(customer)/gatepass', desc: 'Accounts approved gate clearance' },
      { label: '24x7 Helpdesk Escalation', icon: 'phone', route: '/(customer)/helpdesk', desc: 'CRM, Service Manager & Tata team' },
      { label: 'Book Service Appointment', icon: 'calendar', route: '/(customer)/booking', desc: 'Schedule maintenance or pickup' },
      { label: 'Report Issue', icon: 'alert-circle', route: '/(customer)/complaint', desc: 'Log service issues or concerns' },
      { label: 'Dealership Feedback', icon: 'star', route: '/(customer)/feedback', desc: 'Rate your service experience' },
    ]
    if (!isMechanical) return all
    return all.filter(
      (item) =>
        item.label !== 'Upload Claim Documents' &&
        item.label !== 'Workshop Estimate Approval' &&
        item.label !== 'Download Insurance Claim Form' &&
        item.label !== 'Download T/P Affidavit'
    )
  }, [isAccident, isMechanical])

  const [hasSeenNotifications, setHasSeenNotifications] = useState(false)

  const isDelivered = Boolean(selectedVehicle?.invoice_done_at)

  // Helper to check if event happened within last 24 hours (1 day)
  const isDeliveredToday = useMemo(() => {
    if (!selectedVehicle?.invoice_done_at) return false
    try {
      const eventTime = new Date(selectedVehicle.invoice_done_at).getTime()
      if (Number.isNaN(eventTime)) return false
      const diffHours = (Date.now() - eventTime) / (1000 * 60 * 60)
      return diffHours >= 0 && diffHours <= 24
    } catch {
      return false
    }
  }, [selectedVehicle?.invoice_done_at])

  const showNotificationDot = !hasSeenNotifications && isDeliveredToday

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: CustomerTheme.bg }} edges={['top']}>
      {/* Top App Header */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: CustomerTheme.border,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center flex-1 pr-2">
            <Image
              source={require('../../../assets/icon.png')}
              style={{ width: 40, height: 40, borderRadius: 10 }}
              resizeMode="contain"
              className="mr-3"
            />
            <View className="flex-1">
              <Text style={{ color: CustomerTheme.navy, fontSize: 16, fontWeight: '900' }}>TechWheels Service</Text>
              <Text style={{ color: CustomerTheme.inkMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4 }}>
                TATA.CARS · Authorised Service
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            {isHomeScreen ? (
              <TouchableOpacity
                onPress={() => router.push('/(customer)/chat')}
                accessibilityRole="button"
                accessibilityLabel="Chat with service advisor"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: CustomerTheme.bgMuted,
                  borderWidth: 1,
                  borderColor: CustomerTheme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="message-square" size={18} color={CustomerTheme.primary} strokeWidth={2.2} />
              </TouchableOpacity>
            ) : null}

            {/* Notification Bell Icon */}
            <TouchableOpacity
              onPress={() => {
                setHasSeenNotifications(true)
                setShowNotifications(true)
              }}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: CustomerTheme.bgMuted,
                borderWidth: 1,
                borderColor: CustomerTheme.border,
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <Icon name="bell" size={18} color={CustomerTheme.primary} />
              {showNotificationDot && (
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: CustomerTheme.teal,
                    borderWidth: 1.5,
                    borderColor: CustomerTheme.navyDeep,
                  }}
                />
              )}
            </TouchableOpacity>

            {/* High-Contrast Menu Button */}
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              accessibilityRole="button"
              accessibilityLabel="Open Navigation Menu"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: CustomerTheme.bgMuted,
                borderWidth: 1,
                borderColor: CustomerTheme.border,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#002B49',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.35,
                shadowRadius: 3,
                elevation: 4,
              }}
            >
              <Icon name="menu" size={18} color={CustomerTheme.navy} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Page Title Row with Back Navigation */}
        {(shouldShowBack || Boolean(title)) && (
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
                className="flex-row items-center border px-3 py-1.5 rounded-xl mr-3"
                style={{ backgroundColor: CustomerTheme.bgMuted, borderColor: CustomerTheme.border }}
              >
                <Text style={{ color: CustomerTheme.teal, fontWeight: '900', fontSize: 14, marginRight: 6 }}>←</Text>
                <Text style={{ color: CustomerTheme.ink, fontWeight: '700', fontSize: 12 }}>Home</Text>
              </TouchableOpacity>
            )}
            {title ? (
              <View className="flex-1">
                <Text style={{ color: CustomerTheme.ink, fontSize: 18, fontWeight: '900' }}>{title}</Text>
                {subtitle ? (
                  <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Main Content Body */}
      <CustomerScreenRefreshContext.Provider value={{ addHandler: addRefreshHandler }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 36 }}
          refreshControl={
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={() => void handlePullRefresh()}
              tintColor={CustomerTheme.primary}
              colors={[CustomerTheme.primary]}
            />
          }
        >
          <VehiclePicker vehicles={vehicles} selectedReg={selectedReg} onSelect={setSelectedReg} />
          {children}
        </ScrollView>
      </CustomerScreenRefreshContext.Provider>

      {/* ── TOP-SLIDING MENU DRAWER (IN-TREE OVERLAY TO PREVENT FREEZE) ── */}
      {showMenu && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            elevation: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'flex-start',
          }}
        >
          <Pressable
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            onPress={() => setShowMenu(false)}
          />
          <SafeAreaView
            edges={['top']}
            style={{
              backgroundColor: '#ffffff',
              borderBottomLeftRadius: 28,
              borderBottomRightRadius: 28,
              paddingTop: 10,
              paddingBottom: 20,
              paddingHorizontal: 20,
              maxHeight: '90%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 25,
              borderBottomWidth: 3,
              borderBottomColor: '#0f172a',
            }}
          >
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <View className="flex-row items-center gap-2.5">
                <Image
                  source={require('../../../assets/icon.png')}
                  style={{ width: 38, height: 38, borderRadius: 10 }}
                  resizeMode="contain"
                />
                <View>
                  <Text className="text-slate-900 text-[16px] font-black">Customer Services Menu</Text>
                  <Text className="text-slate-500 text-[11px] font-medium">Active: {selectedReg || 'No Vehicle'}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowMenu(false)}
                className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 items-center justify-center"
              >
                <Icon name="x" size={16} color="#334155" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <ScrollView className="space-y-1.5 mb-3" showsVerticalScrollIndicator={false}>
              {/* Home Shortcut */}
              <TouchableOpacity
                onPress={() => navigateTo('/(customer)')}
                className={`flex-row items-center p-3 rounded-2xl mb-1.5 ${isHomeScreen ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 active:bg-slate-100'}`}
              >
                <View className="w-10 h-10 rounded-xl bg-white border border-slate-200 items-center justify-center mr-3 shadow-xs">
                  <Icon name="home" size={18} color="#1e60ff" strokeWidth={2} />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 font-bold text-[14px]">Customer Home / Dashboard</Text>
                  <Text className="text-slate-500 text-[11px]">Overview, quick actions & service status</Text>
                </View>
                <Icon name="chevron-right" size={16} color="#94a3b8" />
              </TouchableOpacity>

              {menuItems.map((item) => (
                <TouchableOpacity
                  key={item.route || item.menuAction || item.label}
                  onPress={() => {
                    if (item.menuAction) {
                      handleMenuAction(item.menuAction)
                    } else if (item.route) {
                      navigateTo(item.route)
                    }
                  }}
                  className="flex-row items-center p-3 rounded-2xl bg-slate-50 active:bg-slate-100 mb-1.5"
                >
                  <View className="w-10 h-10 rounded-xl bg-white border border-slate-200 items-center justify-center mr-3 shadow-xs">
                    <Icon name={item.icon} size={18} color="#3b82f6" strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 font-bold text-[14px]">{item.label}</Text>
                    <Text className="text-slate-500 text-[11px]">{item.desc}</Text>
                  </View>
                  <Icon name="chevron-right" size={16} color="#94a3b8" />
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* In-App OTA Update Button */}
            <TouchableOpacity
              onPress={handleCheckAppUpdate}
              disabled={checkingUpdate}
              className="flex-row items-center justify-center bg-blue-50 border border-blue-200 rounded-2xl py-3 mb-2"
            >
              <Icon name="rotate-cw" size={16} color="#1d4ed8" strokeWidth={2.2} />
              <Text className="text-blue-700 font-extrabold text-sm ml-2">
                {checkingUpdate ? (updateStatusMsg || 'Checking for updates…') : 'Check for App Updates'}
              </Text>
            </TouchableOpacity>

            {/* Logout Action */}
            <TouchableOpacity
              onPress={handleLogout}
              className="flex-row items-center justify-center bg-red-50 border border-red-200 rounded-2xl py-3"
            >
              <Icon name="log-out" size={17} color="#dc2626" strokeWidth={2} />
              <Text className="text-red-600 font-extrabold text-sm ml-2">Log Out of Customer Portal</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      )}

      <Modal
        visible={showClaimFormModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowClaimFormModal(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'flex-end',
          }}
          onPress={() => setShowClaimFormModal(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#ffffff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 28,
              maxHeight: '88%',
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-slate-900 text-[17px] font-black">Insurance claim form</Text>
              <TouchableOpacity
                onPress={() => setShowClaimFormModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
              >
                <Icon name="x" size={16} color="#334155" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ClaimFormWidget
                userInsurerId={matchInsuranceProviderId(insuranceCompanyOnCard)}
                insurerNameOnFile={insuranceCompanyOnCard}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── NOTIFICATIONS POPUP (IN-TREE OVERLAY TO PREVENT FREEZE) ── */}
      {showNotifications && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            elevation: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'flex-start',
          }}
        >
          <Pressable
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            onPress={() => setShowNotifications(false)}
          />
          <SafeAreaView
            edges={['top']}
            style={{
              backgroundColor: '#ffffff',
              borderBottomLeftRadius: 28,
              borderBottomRightRadius: 28,
              paddingTop: 10,
              paddingBottom: 20,
              paddingHorizontal: 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 25,
              borderBottomWidth: 3,
              borderBottomColor: '#2563eb',
            }}
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
          </SafeAreaView>
        </View>
      )}
    </SafeAreaView>
  )
}
