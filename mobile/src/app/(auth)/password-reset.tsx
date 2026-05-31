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
import { supabase } from '../../lib/supabase'

export default function PasswordResetScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)

      if (error) {
        Alert.alert('Error', error.message)
      } else {
        Alert.alert('Success', 'Check your email for password reset instructions')
        router.replace('/(auth)/login')
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
          {/* Blue Header */}
          <View className="bg-blue-600 px-6 pt-6 pb-8">
            <TouchableOpacity onPress={() => router.back()} className="mb-4 self-start">
              <Text className="text-white text-[17px]">‹ Back to sign in</Text>
            </TouchableOpacity>
            <Text className="text-white text-4xl font-bold">Techwheels</Text>
            <Text className="text-blue-200 text-sm tracking-wider mt-1">SERVICE PLATFORM</Text>
          </View>

          {/* Form Content */}
          <View className="px-6 pt-8 pb-12">
            <Text className="text-slate-900 text-[28px] font-bold mb-2">Reset password</Text>
            <Text className="text-slate-600 text-[17px] mb-8">Enter your email and we'll send a reset link.</Text>

            {/* Email */}
            <Text className="text-slate-900 font-semibold text-[15px] mb-2">Email</Text>
            <TextInput
              className="border border-slate-300 rounded-2xl px-5 py-4 mb-8 bg-white text-[17px]"
              placeholder="you@dealer.in"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              editable={!loading}
              placeholderTextColor="#999"
              autoCapitalize="none"
            />

            {/* Send Reset Link Button */}
            <TouchableOpacity
              className={`rounded-2xl py-4 flex-row items-center justify-center ${
                loading ? 'bg-blue-400' : 'bg-blue-600'
              }`}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading && <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />}
              <Text className="text-white font-semibold text-[17px]">
                {loading ? 'Sending email...' : 'Send reset link'}
              </Text>
              {!loading && <Text className="text-white ml-2">→</Text>}
            </TouchableOpacity>

            {/* Back to Login */}
            <View className="mt-8 flex-row justify-center">
              <TouchableOpacity onPress={() => router.back()}>
                <Text className="text-blue-600 font-semibold text-[17px]">Back to Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
