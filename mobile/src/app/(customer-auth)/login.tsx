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
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCustomerSession } from '../../context/CustomerSessionContext'

export default function CustomerLoginScreen() {
  const router = useRouter()
  const { signIn } = useCustomerSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setError(null)
    if (!username.trim() || !password.trim()) {
      setError('Enter your 10-digit registered mobile number in both fields.')
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
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
          <TouchableOpacity onPress={() => router.replace('/(audience)')} className="mb-6">
            <Text className="text-blue-700 text-[16px] font-semibold">← Back</Text>
          </TouchableOpacity>

          <View className="items-center mb-6">
            <LinearGradient
              colors={['#1e40af', '#3b82f6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 68,
                height: 68,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Text className="text-[34px]">🚘</Text>
            </LinearGradient>
            <Text className="text-[23px] font-black text-slate-900">Techwheels Customer Portal</Text>
            <Text className="text-[13px] text-slate-500 text-center mt-1">
              Access your live service job card, estimates, complaints & gate pass
            </Text>
          </View>

          <View className="bg-white border border-slate-200 rounded-2xl p-6">
            <View className="border-b border-slate-200 pb-3 mb-4">
              <Text className="text-[16px] font-extrabold">Customer Sign In</Text>
              <Text className="text-[12px] text-slate-500 mt-1">Use the mobile number registered during reception intake</Text>
            </View>

            <Text className="text-[13px] font-bold mb-1">Username</Text>
            <Text className="text-[11px] text-slate-400 mb-2">(10-digit registered mobile)</Text>
            <TextInput
              className="border border-slate-300 rounded-xl px-4 py-3 text-[16px] font-bold mb-4"
              placeholder="e.g. 9950042708"
              value={username}
              onChangeText={setUsername}
              keyboardType="number-pad"
              maxLength={10}
              editable={!loading}
              placeholderTextColor="#94a3b8"
            />

            <Text className="text-[13px] font-bold mb-1">Password</Text>
            <Text className="text-[11px] text-slate-400 mb-2">(same 10-digit registered mobile)</Text>
            <View className="relative mb-4">
              <TextInput
                className="border border-slate-300 rounded-xl px-4 py-3 pr-12 text-[16px] font-bold"
                placeholder="e.g. 9950042708"
                value={password}
                onChangeText={setPassword}
                keyboardType="number-pad"
                maxLength={10}
                secureTextEntry={!showPassword}
                editable={!loading}
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-3"
              >
                <Text>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-3 mb-4">
                <Text className="text-red-700 text-[12.5px]">⚠️ {error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              className={`rounded-xl py-3.5 items-center ${loading ? 'bg-blue-400' : 'bg-blue-600'}`}
              onPress={() => void handleLogin()}
              disabled={loading || !username.trim() || !password.trim()}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-extrabold text-[14px]">Sign In to Portal →</Text>
              )}
            </TouchableOpacity>

            <View className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <Text className="text-[11.5px] text-slate-600 leading-5">
                💡 <Text className="font-bold">Login Rule:</Text> Username and password are both your registered 10-digit
                mobile number. After sign-in you see every vehicle on that number.
              </Text>
            </View>
          </View>

          <Text className="text-center text-[12px] text-slate-400 mt-6">
            Techwheels Dealership After-Purchase Service Portal · SRD v1.0
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
