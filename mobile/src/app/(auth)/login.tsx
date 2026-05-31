import { useState } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { signIn } = useAuth()

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password')
      return
    }

    setLoading(true)
    try {
      const { error } = await signIn(email, password)

      if (error) {
        Alert.alert('Login Failed', error.message)
      } else {
        // Navigate to tabs
        router.replace('/(tabs)/home')
      }
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
        >
          {/* Blue Header - NO Back Button on Login */}
          <View className="bg-blue-600 px-6 pt-6 pb-8">
            <Text className="text-white text-4xl font-bold">Techwheels</Text>
            <Text className="text-blue-200 text-sm tracking-wider mt-1">SERVICE PLATFORM</Text>
          </View>

          {/* Form Content */}
          <View className="px-6 pt-8 pb-12">
            <Text className="text-slate-900 text-[28px] font-bold mb-2">Welcome back</Text>
            <Text className="text-slate-600 text-[17px] mb-8">Sign in to your service workspace.</Text>

            {/* Email */}
            <Text className="text-slate-900 font-semibold text-[15px] mb-2">Email</Text>
            <TextInput
              className="border border-slate-300 rounded-2xl px-5 py-4 mb-6 bg-white text-[17px]"
              placeholder="rajat.verma@techwheels.in"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              editable={!loading}
              placeholderTextColor="#999"
              autoCapitalize="none"
            />

            {/* Password */}
            <Text className="text-slate-900 font-semibold text-[15px] mb-2">Password</Text>
            <TextInput
              className="border border-slate-300 rounded-2xl px-5 py-4 mb-2 bg-white text-[17px]"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              placeholderTextColor="#999"
            />

            {/* Forgot Password Link */}
            <TouchableOpacity onPress={() => router.push('/(auth)/password-reset')} className="mb-8 self-end">
              <Text className="text-blue-600 font-semibold text-[15px]">Forgot password?</Text>
            </TouchableOpacity>

            {/* Sign In Button */}
            <TouchableOpacity
              className={`rounded-2xl py-4 flex-row items-center justify-center ${
                loading ? 'bg-blue-400' : 'bg-blue-600'
              }`}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading && <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />}
              <Text className="text-white font-semibold text-[17px]">
                {loading ? 'Signing in...' : 'Sign in'}
              </Text>
              {!loading && <Text className="text-white ml-2">🔒</Text>}
            </TouchableOpacity>

            {/* Divider */}
            <View className="flex-row items-center my-6">
              <View className="flex-1 h-px bg-slate-200" />
              <Text className="text-slate-400 text-sm mx-3">OR</Text>
              <View className="flex-1 h-px bg-slate-200" />
            </View>

            {/* Sign Up Link */}
            <View className="flex-row justify-center">
              <Text className="text-slate-900 text-[17px]">Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
                <Text className="text-blue-600 font-semibold text-[17px]">Sign up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
