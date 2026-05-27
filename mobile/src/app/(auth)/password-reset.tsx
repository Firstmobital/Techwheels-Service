import { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
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
    <View className="flex-1 justify-center px-6 bg-white">
      <Text className="text-4xl font-bold mb-2 text-center text-blue-600">
        Techwheels
      </Text>
      <Text className="text-gray-600 text-center mb-8">Reset Password</Text>

      <Text className="text-gray-700 mb-4">
        Enter your email address and we'll send you a link to reset your password.
      </Text>

      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 mb-6 bg-gray-50"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        editable={!loading}
        placeholderTextColor="#999"
      />

      <TouchableOpacity
        className={`rounded-lg py-4 flex-row items-center justify-center ${
          loading ? 'bg-blue-400' : 'bg-blue-600'
        }`}
        onPress={handleResetPassword}
        disabled={loading}
      >
        {loading && <ActivityIndicator color="white" size="small" />}
        <Text className={`text-white text-center font-semibold ml-2 ${loading ? 'opacity-0' : ''}`}>
          {loading ? 'Sending email...' : 'Send Reset Link'}
        </Text>
      </TouchableOpacity>

      <View className="mt-6 flex-row justify-center">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-blue-600 font-semibold">Back to Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
