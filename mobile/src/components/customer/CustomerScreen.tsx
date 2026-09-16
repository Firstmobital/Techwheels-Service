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
      <View className="bg-sky-600 px-5 pt-4 pb-5">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-white text-2xl font-bold">{title}</Text>
            {subtitle ? <Text className="text-sky-100 text-sm mt-1">{subtitle}</Text> : null}
          </View>
          <TouchableOpacity
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="h-10 w-10 items-center justify-center rounded-full bg-sky-500"
          >
            <Icon name="log-out" size={20} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <VehiclePicker vehicles={vehicles} selectedReg={selectedReg} onSelect={setSelectedReg} />
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}
