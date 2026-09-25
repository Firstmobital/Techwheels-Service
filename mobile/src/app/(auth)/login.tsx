import { useState } from 'react'
import { ActivityIndicator, Text, TextInput, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { SimpleServiceLoginShell } from '../../components/auth/SimpleServiceLoginShell'
import { CustomerTheme } from '../../lib/customer/customerTheme'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { signIn } = useAuth()
  const { rememberAudience } = useCustomerSession()

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter email and password')
      return
    }

    setLoading(true)
    setError('')
    try {
      const { error: signInError } = await signIn(email.trim(), password)

      if (signInError) {
        setError(signInError.message)
      } else {
        await rememberAudience('staff')
        router.replace('/(tabs)/home')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
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
      title="Staff sign in"
      subtitle="Workshop email and password for reception, floor, and reports."
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginBottom: 6 }}>Email</Text>
      <TextInput
        style={{ ...fieldStyle, marginBottom: 16 }}
        placeholder="you@techwheels.in"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
        placeholderTextColor={CustomerTheme.inkSoft}
      />

      <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginBottom: 6 }}>Password</Text>
      <TextInput
        style={{ ...fieldStyle, marginBottom: 8 }}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
        placeholderTextColor={CustomerTheme.inkSoft}
      />

      <TouchableOpacity onPress={() => router.push('/(auth)/password-reset')} style={{ alignSelf: 'flex-end', marginBottom: 16 }}>
        <Text style={{ color: CustomerTheme.primary, fontSize: 13, fontWeight: '700' }}>Forgot password?</Text>
      </TouchableOpacity>

      {error ? (
        <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600', marginBottom: 12 }}>{error}</Text>
      ) : null}

      <TouchableOpacity
        onPress={() => void handleLogin()}
        disabled={loading}
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

      <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
        Staff accounts are invite-only. Ask your workshop admin.
      </Text>
    </SimpleServiceLoginShell>
  )
}
