import { useState } from 'react'
import { ActivityIndicator, Text, TextInput, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { SimpleServiceLoginShell } from '../../components/auth/SimpleServiceLoginShell'
import { CustomerTheme } from '../../lib/customer/customerTheme'

export default function CustomerLoginScreen() {
  const router = useRouter()
  const { signIn } = useCustomerSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Please enter mobile number and password')
      return
    }

    try {
      setLoading(true)
      setError('')
      const result = await signIn(username.trim(), password.trim())
      if (result.error) {
        setError(result.error)
      } else {
        router.replace('/(customer)')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const fieldStyle = {
    borderWidth: 1,
    borderColor: CustomerTheme.border,
    borderRadius: CustomerTheme.radiusButton,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: CustomerTheme.ink,
    backgroundColor: '#FFFFFF',
  } as const

  return (
    <SimpleServiceLoginShell
      showBackToAudience
      title="Customer sign in"
      subtitle="Use your 10-digit mobile number as username and password."
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginBottom: 6 }}>Mobile number</Text>
      <TextInput
        style={{ ...fieldStyle, marginBottom: 16 }}
        placeholder="10-digit mobile"
        value={username}
        onChangeText={setUsername}
        keyboardType="number-pad"
        maxLength={10}
        editable={!loading}
        placeholderTextColor={CustomerTheme.inkSoft}
      />

      <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginBottom: 6 }}>Password</Text>
      <TextInput
        style={{ ...fieldStyle, marginBottom: error ? 12 : 20 }}
        placeholder="Same as mobile number"
        value={password}
        onChangeText={setPassword}
        keyboardType="number-pad"
        maxLength={10}
        secureTextEntry={!showPassword}
        editable={!loading}
        placeholderTextColor={CustomerTheme.inkSoft}
      />

      <TouchableOpacity onPress={() => setShowPassword((p) => !p)} style={{ alignSelf: 'flex-end', marginBottom: 12 }}>
        <Text style={{ color: CustomerTheme.primary, fontSize: 13, fontWeight: '700' }}>
          {showPassword ? 'Hide password' : 'Show password'}
        </Text>
      </TouchableOpacity>

      {error ? (
        <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600', marginBottom: 12 }}>{error}</Text>
      ) : null}

      <TouchableOpacity
        onPress={() => void handleLogin()}
        disabled={loading || !username.trim() || !password.trim()}
        style={{
          backgroundColor: loading ? '#93C5FD' : CustomerTheme.primary,
          borderRadius: CustomerTheme.radiusButton,
          paddingVertical: 14,
          alignItems: 'center',
        }}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Sign in</Text>
        )}
      </TouchableOpacity>
    </SimpleServiceLoginShell>
  )
}
