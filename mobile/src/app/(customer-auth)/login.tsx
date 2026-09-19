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

import { Icon } from '../../components/ui/Icon'

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
    <SafeAreaView className="flex-1 bg-slate-900" edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
        >
          {/* Back Action */}
          <TouchableOpacity
            onPress={() => router.replace('/(audience)')}
            activeOpacity={0.7}
            className="flex-row items-center gap-2 mb-6 self-start bg-white/10 px-3.5 py-2 rounded-xl"
          >
            <Icon name="arrow-left" size={16} color="#93c5fd" />
            <Text className="text-blue-200 text-[14px] font-semibold">Back</Text>
          </TouchableOpacity>

          {/* Hero Branding */}
          <View className="items-center mb-8">
            <LinearGradient
              colors={['#1e60ff', '#0b132b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 72,
                height: 72,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.15)',
                shadowColor: '#1e60ff',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 16,
                elevation: 8,
              }}
            >
              <Icon name="truck" size={34} color="#ffffff" strokeWidth={2.2} />
            </LinearGradient>
            <Text className="text-[24px] font-black text-white tracking-tight text-center">
              Techwheels Customer Services
            </Text>
            <Text className="text-[13px] text-slate-400 text-center mt-1.5 font-medium">
              Dealership Vehicle After-Purchase Portal
            </Text>
          </View>

          {/* Login Card */}
          <View className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100">
            <View className="border-b border-slate-100 pb-4 mb-5">
              <View className="flex-row items-center gap-2">
                <Text className="text-[17px] font-black text-slate-900">Customer Sign In</Text>
                <View className="bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  <Text className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Fast Access</Text>
                </View>
              </View>
              <Text className="text-[12px] text-slate-500 mt-1 font-medium">
                Enter your registered mobile number for instant vehicle tracking
              </Text>
            </View>

            {/* Username Field */}
            <Text className="text-[13px] font-bold text-slate-700 mb-1.5">Registered Mobile Number</Text>
            <View className="flex-row items-center border border-slate-200 rounded-xl px-3.5 py-2.5 mb-4 bg-slate-50/50 focus:border-blue-500">
              <Icon name="smartphone" size={18} color="#64748b" />
              <TextInput
                className="flex-1 ml-2.5 text-[15px] font-bold text-slate-900"
                placeholder="e.g. 9950042708"
                value={username}
                onChangeText={setUsername}
                keyboardType="number-pad"
                maxLength={10}
                editable={!loading}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Password Field */}
            <Text className="text-[13px] font-bold text-slate-700 mb-1.5">Password (Same Mobile No.)</Text>
            <View className="flex-row items-center border border-slate-200 rounded-xl px-3.5 py-2.5 mb-5 bg-slate-50/50">
              <Icon name="lock" size={18} color="#64748b" />
              <TextInput
                className="flex-1 ml-2.5 text-[15px] font-bold text-slate-900"
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
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="p-1"
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Error Message */}
            {error ? (
              <View className="flex-row items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 mb-4">
                <Icon name="alert-circle" size={18} color="#dc2626" />
                <Text className="text-red-700 text-[12.5px] font-semibold flex-1">{error}</Text>
              </View>
            ) : null}

            {/* Primary Submit Button */}
            <TouchableOpacity
              className={`rounded-2xl py-4 items-center justify-center shadow-md ${
                loading || !username.trim() || !password.trim() ? 'bg-blue-400' : 'bg-blue-600 active:bg-blue-700'
              }`}
              onPress={() => void handleLogin()}
              disabled={loading || !username.trim() || !password.trim()}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <Text className="text-white font-black text-[15px]">Sign In to Portal</Text>
                  <Icon name="arrow-right" size={16} color="#ffffff" strokeWidth={2.5} />
                </View>
              )}
            </TouchableOpacity>

            {/* Info Hint */}
            <View className="mt-4 bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex-row items-start gap-2.5">
              <Icon name="info" size={16} color="#3b82f6" />
              <Text className="text-[11.5px] text-slate-600 leading-4 flex-1">
                <Text className="font-bold text-slate-800">Login Rule:</Text> Username and password are your registered 10-digit mobile number given during service intake.
              </Text>
            </View>
          </View>

          <Text className="text-center text-[12px] text-slate-500 mt-6 font-medium">
            Techwheels Dealership After-Purchase Service Portal · 2026 Edition
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
