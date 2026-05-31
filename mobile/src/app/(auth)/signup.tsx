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

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { signUp } = useAuth()

  const handleSignUp = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
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
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
        >
          <View className="bg-blue-600 px-6 pt-6 pb-8">
            <TouchableOpacity onPress={() => router.push('/(auth)/login')} className="mb-4">
              <Text className="text-white text-[17px]">← Back to sign in</Text>
            </TouchableOpacity>
            <Text className="text-white text-4xl font-bold">Techwheels</Text>
            <Text className="text-blue-200 text-sm tracking-wider mt-1">SERVICE PLATFORM</Text>
          </View>

          <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingTop: 24, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
            <Text className="text-slate-900 text-[28px] font-bold mb-2">Create account</Text>
            <Text className="text-slate-600 text-[17px] mb-8">Join your dealership's service team.</Text>

            <Text className="text-slate-900 font-semibold text-[15px] mb-2">Full name</Text>
            <TextInput
              className="border border-slate-300 rounded-2xl px-5 py-4 mb-6 bg-white text-[17px]"
              placeholder="Your name"
              value={fullName}
              onChangeText={setFullName}
              editable={!loading}
              placeholderTextColor="#999"
            />

            <Text className="text-slate-900 font-semibold text-[15px] mb-2">Work email</Text>
            <TextInput
              className="border border-slate-300 rounded-2xl px-5 py-4 mb-6 bg-white text-[17px]"
              placeholder="you@dealer.in"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              editable={!loading}
              placeholderTextColor="#999"
              autoCapitalize="none"
            />

            <Text className="text-slate-900 font-semibold text-[15px] mb-2">Password</Text>
            <TextInput
              className="border border-slate-300 rounded-2xl px-5 py-4 mb-6 bg-white text-[17px]"
              placeholder="Min. 8 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              placeholderTextColor="#999"
            />

            <TextInput
              className="border border-slate-300 rounded-2xl px-5 py-4 mb-8 bg-white text-[17px]"
              placeholder="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
              placeholderTextColor="#999"
            />

            <TouchableOpacity
              className={`rounded-2xl py-4 flex-row items-center justify-center ${
                loading ? 'bg-blue-400' : 'bg-blue-600'
              }`}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading && <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />}
              <Text className="text-white font-semibold text-[17px]">
                {loading ? 'Creating account...' : 'Create account'}
              </Text>
              {!loading && <Text className="text-white ml-2">→</Text>}
            </TouchableOpacity>

            <Text className="text-center text-slate-500 text-xs mt-8">
              By continuing you agree to the Techwheels{' '}
              <Text className="text-slate-700 font-semibold">Terms of Service</Text> & <Text className="text-slate-700 font-semibold">Privacy Policy</Text>.
            </Text>

            <View className="mt-8 flex-row justify-center">
              <Text className="text-slate-900 text-[17px]">Already have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
                <Text className="text-blue-600 font-semibold text-[17px]">Sign In</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
