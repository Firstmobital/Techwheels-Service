import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCustomerSession } from '../../context/CustomerSessionContext'

export default function CustomerLoginScreen() {
  const router = useRouter()
  const { signIn } = useCustomerSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setError(null)
    if (!username.trim() || !password.trim()) {
      setError('Enter your 10-digit mobile number in both fields.')
      return
    }
    setLoading(true)
    try {
      const result = await signIn(username.trim(), password.trim())
      if (result.error) {
        setError(result.error)
        return
      }
      router.replace('/(customer)')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="bg-sky-600 px-6 pt-6 pb-8">
            <TouchableOpacity onPress={() => router.replace('/(audience)')} className="mb-4">
              <Text className="text-white text-[17px]">← Back</Text>
            </TouchableOpacity>
            <Text className="text-white text-4xl font-bold">Customer</Text>
            <Text className="text-sky-100 text-sm tracking-wider mt-1">TRACK YOUR VEHICLE</Text>
          </View>

          <View className="px-6 pt-8 pb-12">
            <Text className="text-slate-900 text-[28px] font-bold mb-2">Sign in</Text>
            <Text className="text-slate-600 text-[17px] mb-8">
              Username and password are both your registered 10-digit mobile number.
            </Text>

            <Text className="text-slate-900 font-semibold text-[15px] mb-2">Mobile number</Text>
            <TextInput
              className="border border-slate-300 rounded-2xl px-5 py-4 mb-6 bg-white text-[17px]"
              placeholder="9950042708"
              value={username}
              onChangeText={setUsername}
              keyboardType="number-pad"
              maxLength={10}
              editable={!loading}
              placeholderTextColor="#999"
            />

            <Text className="text-slate-900 font-semibold text-[15px] mb-2">Password (same mobile)</Text>
            <TextInput
              className="border border-slate-300 rounded-2xl px-5 py-4 mb-6 bg-white text-[17px]"
              placeholder="9950042708"
              value={password}
              onChangeText={setPassword}
              keyboardType="number-pad"
              maxLength={10}
              secureTextEntry
              editable={!loading}
              placeholderTextColor="#999"
            />

            {error ? (
              <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
                <Text className="text-red-700 text-[15px]">{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              className={`rounded-2xl py-4 items-center ${loading ? 'bg-sky-400' : 'bg-sky-600'}`}
              onPress={() => void handleLogin()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-[17px]">Log in as Customer</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
