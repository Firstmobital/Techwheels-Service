import { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'

export default function SignUpScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { signUp } = useAuth()

  const handleSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const { error } = await signUp(email, password)

      if (error) {
        Alert.alert('Sign Up Failed', error.message)
      } else {
        Alert.alert('Success', 'Check your email to confirm your account')
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
      <Text className="text-gray-600 text-center mb-8">Create Account</Text>

      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 mb-4 bg-gray-50"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        editable={!loading}
        placeholderTextColor="#999"
      />

      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 mb-4 bg-gray-50"
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
        placeholderTextColor="#999"
      />

      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 mb-6 bg-gray-50"
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!loading}
        placeholderTextColor="#999"
      />

      <TouchableOpacity
        className={`rounded-lg py-4 flex-row items-center justify-center ${
          loading ? 'bg-blue-400' : 'bg-blue-600'
        }`}
        onPress={handleSignUp}
        disabled={loading}
      >
        {loading && <ActivityIndicator color="white" size="small" />}
        <Text className={`text-white text-center font-semibold ml-2 ${loading ? 'opacity-0' : ''}`}>
          {loading ? 'Creating account...' : 'Sign Up'}
        </Text>
      </TouchableOpacity>

      <View className="mt-6 flex-row justify-center">
        <Text className="text-gray-600">Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
          <Text className="text-blue-600 font-semibold">Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
