import { ReactNode } from 'react'
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { Icon } from '../ui/Icon'
import { VehiclePicker } from './VehiclePicker'

export function CustomerScreen({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const router = useRouter()
  const { vehicles, selectedReg, setSelectedReg, signOut } = useCustomerSession()

  const handleLogout = () => {
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

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      <View className="bg-white border-b border-slate-200 px-4 pt-3 pb-3">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center flex-1 pr-2">
            <View className="h-10 w-10 rounded-xl bg-blue-600 items-center justify-center mr-3">
              <Text className="text-xl">🚗</Text>
            </View>
            <View className="flex-1">
              <Text className="text-slate-900 text-[15px] font-extrabold">Techwheels Customer Services</Text>
              <Text className="text-slate-500 text-[11px] font-semibold">Dealership Vehicle After-Purchase Portal</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            {selectedReg ? (
              <View className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5">
                <Text className="text-[9px] font-bold uppercase text-slate-500">Active Vehicle</Text>
                <Text className="text-[12px] font-extrabold text-blue-700">{selectedReg}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Log out"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
            >
              <Icon name="log-out" size={18} color="#0f172a" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
        <Text className="text-slate-900 text-xl font-extrabold mt-3">{title}</Text>
        {subtitle ? <Text className="text-slate-500 text-[12.5px] mt-0.5">{subtitle}</Text> : null}
      </View>
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
    </SafeAreaView>
  )
}
