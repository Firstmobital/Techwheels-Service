import { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
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
        router.replace('/(tabs)/import')
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
      <Text className="text-gray-600 text-center mb-8">Service Management</Text>

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
        className="border border-gray-300 rounded-lg px-4 py-3 mb-6 bg-gray-50"
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
        placeholderTextColor="#999"
      />

      <TouchableOpacity
        className={`rounded-lg py-4 flex-row items-center justify-center ${
          loading ? 'bg-blue-400' : 'bg-blue-600'
        }`}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading && <ActivityIndicator color="white" size="small" />}
        <Text className={`text-white text-center font-semibold ml-2 ${loading ? 'opacity-0' : ''}`}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Text>
      </TouchableOpacity>

      <View className="mt-6 flex-row justify-center">
        <Text className="text-gray-600">Don't have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
          <Text className="text-blue-600 font-semibold">Sign Up</Text>
        </TouchableOpacity>
      </View>

      <View className="mt-4">
        <TouchableOpacity onPress={() => router.push('/(auth)/password-reset')}>
          <Text className="text-center text-blue-600 font-semibold">Forgot Password?</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
