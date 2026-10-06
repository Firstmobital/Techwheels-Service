import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { STAFF_PASSWORD_RULES } from '../../lib/staffSignUp'
import { supabase } from '../../lib/supabase'

function isStrongPassword(value: string): boolean {
  return STAFF_PASSWORD_RULES.every((rule) => rule.test(value))
}

export default function PasswordUpdateScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '')
    })
  }, [])

  const handleSubmit = async () => {
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match.')
      return
    }
    if (!isStrongPassword(password)) {
      Alert.alert(
        'Error',
        'Password must be at least 12 characters with uppercase, lowercase, a number, and a symbol (!@#$%^&*).',
      )
      return
    }

    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const existingMeta = (userData.user?.user_metadata ?? {}) as Record<string, unknown>
      const { error } = await supabase.auth.updateUser({
        password,
        data: {
          ...existingMeta,
          force_password_change: false,
          temp_password_issued_at: null,
        },
      })
      if (error) {
        Alert.alert('Error', error.message)
        return
      }
      Alert.alert('Success', 'Password updated. You can sign in with your new password.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/home') },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1 px-6 pt-8" keyboardShouldPersistTaps="handled">
          <Text className="text-slate-900 text-[28px] font-bold mb-2">Set new password</Text>
          <Text className="text-slate-600 text-[15px] mb-6">
            {email ? `Signed in as ${email}.` : 'Choose a strong password to finish reset.'}
          </Text>

          <Text className="text-slate-900 font-semibold text-[15px] mb-2">New password</Text>
          <TextInput
            className="border border-slate-300 rounded-2xl px-5 py-4 mb-4 bg-white text-[17px]"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            autoCapitalize="none"
          />

          <Text className="text-slate-900 font-semibold text-[15px] mb-2">Confirm password</Text>
          <TextInput
            className="border border-slate-300 rounded-2xl px-5 py-4 mb-6 bg-white text-[17px]"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            editable={!loading}
            autoCapitalize="none"
          />

          <TouchableOpacity
            className={`rounded-2xl py-4 items-center ${loading ? 'bg-blue-400' : 'bg-blue-600'}`}
            onPress={() => void handleSubmit()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-[17px]">Update password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-6 py-3 items-center"
            onPress={() => {
              void supabase.auth.signOut().then(() => router.replace('/(auth)/login'))
            }}
          >
            <Text className="text-blue-600 font-semibold">Cancel and sign out</Text>
          </TouchableOpacity>

          <View className="mt-8 mb-10">
            {STAFF_PASSWORD_RULES.map((rule) => {
              const ok = rule.test(password)
              return (
                <Text key={rule.id} className={`text-[13px] mb-1 ${ok ? 'text-green-700' : 'text-slate-500'}`}>
                  {ok ? '✓' : '○'} {rule.label}
                </Text>
              )
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
