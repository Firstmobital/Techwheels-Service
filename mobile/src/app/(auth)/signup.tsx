import { Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SignUpScreen() {
  const router = useRouter()

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="bg-blue-600 px-6 pt-6 pb-8">
        <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="mb-4">
          <Text className="text-white text-[17px]">← Back to staff sign in</Text>
        </TouchableOpacity>
        <Text className="text-white text-4xl font-bold">Staff</Text>
        <Text className="text-blue-200 text-sm tracking-wider mt-1">INVITE ONLY</Text>
      </View>
      <View className="px-6 pt-8">
        <Text className="text-slate-900 text-[28px] font-bold mb-3">Signup is closed</Text>
        <Text className="text-slate-600 text-[17px] leading-6">
          Workshop staff accounts are created by an admin. Open signup is disabled so customers cannot create staff users.
        </Text>
      </View>
    </SafeAreaView>
  )
}
