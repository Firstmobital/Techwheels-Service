import { Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LegalLinks } from '../../components/LegalLinks'
import { useCustomerSession } from '../../context/CustomerSessionContext'

export default function AudienceChooserScreen() {
  const router = useRouter()
  const { lastAudience, rememberAudience } = useCustomerSession()

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="bg-blue-600 px-6 pt-8 pb-10">
        <Text className="text-white text-4xl font-bold">Techwheels</Text>
        <Text className="text-blue-200 text-sm tracking-wider mt-1">SERVICE</Text>
        <Text className="text-white text-xl font-semibold mt-6">How do you want to sign in?</Text>
      </View>

      <View className="px-6 pt-8">
        <TouchableOpacity
          className={`rounded-2xl px-5 py-5 mb-4 border ${
            lastAudience === 'customer' ? 'bg-sky-50 border-sky-300' : 'bg-white border-slate-200'
          }`}
          onPress={async () => {
            await rememberAudience('customer')
            router.push('/(customer-auth)/login')
          }}
        >
          <Text className="text-slate-900 text-xl font-bold">Login as Customer</Text>
          <Text className="text-slate-600 text-[15px] mt-1">
            Use your 10-digit mobile number as username and password. See every vehicle on that number.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className={`rounded-2xl px-5 py-5 border ${
            lastAudience === 'staff' ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200'
          }`}
          onPress={async () => {
            await rememberAudience('staff')
            router.push('/(auth)/login')
          }}
        >
          <Text className="text-slate-900 text-xl font-bold">Login as Staff</Text>
          <Text className="text-slate-600 text-[15px] mt-1">
            Workshop email and password for reception, floor, and reports.
          </Text>
        </TouchableOpacity>
      </View>

      <View className="px-6 mt-auto pb-6 pt-8">
        <LegalLinks compact />
      </View>
    </SafeAreaView>
  )
}
