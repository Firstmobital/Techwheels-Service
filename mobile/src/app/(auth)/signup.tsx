import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SimpleServiceLoginShell } from '../../components/auth/SimpleServiceLoginShell'
import { useAuth } from '../../context/AuthContext'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import {
  STAFF_PASSWORD_RULES,
  staffPasswordScore,
  staffSignUpRoleLabel,
} from '../../lib/staffSignUp'
import { STAFF_SIGNUP_ROLE_OPTIONS, type StaffSignupRoleId } from '../../lib/staffSignUpRoles'

export default function SignUpScreen() {
  const router = useRouter()
  const { signUp } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedRole, setSelectedRole] = useState<StaffSignupRoleId | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const pwScore = useMemo(() => staffPasswordScore(password), [password])

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

  const handleSignUp = async () => {
    setError('')
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }
    if (!selectedRole) {
      setError('Please select a role.')
      return
    }
    if (pwScore < 4) {
      setError('Password does not meet all requirements.')
      return
    }
    if (phone.trim() && phone.replace(/\D/g, '').length !== 10) {
      setError('Phone number must be exactly 10 digits.')
      return
    }

    setLoading(true)
    const { error: signUpError } = await signUp({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      requestedRole: selectedRole,
      phone: phone.trim() || null,
    })
    setLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <SimpleServiceLoginShell
        title="Request submitted"
        subtitle="Confirm your email, then an administrator will assign your module permissions."
      >
        <Text style={{ fontSize: 15, color: CustomerTheme.inkMuted, lineHeight: 22, marginBottom: 16 }}>
          We sent a verification link to <Text style={{ fontWeight: '700', color: CustomerTheme.ink }}>{email.trim()}</Text>.
          Open it on this phone so the app can finish verification.
        </Text>
        <View
          style={{
            backgroundColor: '#F0F7FF',
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: '#CADCF8',
            marginBottom: 16,
          }}
        >
          <Text style={{ fontWeight: '800', color: CustomerTheme.ink, marginBottom: 6 }}>Next: admin grants access</Text>
          <Text style={{ fontSize: 13, color: CustomerTheme.inkMuted, lineHeight: 20 }}>
            Until then you may see a no-modules notice. We flagged{' '}
            <Text style={{ fontWeight: '700' }}>{staffSignUpRoleLabel(selectedRole)}</Text> as your requested role.
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          style={{
            backgroundColor: CustomerTheme.primary,
            borderRadius: CustomerTheme.radiusButton,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Back to sign in</Text>
        </TouchableOpacity>
      </SimpleServiceLoginShell>
    )
  }

  return (
    <SimpleServiceLoginShell
      title="Request access"
      subtitle="Same as web — create your account; admin assigns modules after email verification."
      showBackToAudience
    >
      <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={{ marginBottom: 12 }}>
        <Text style={{ color: CustomerTheme.primary, fontWeight: '700', fontSize: 14 }}>← Back to sign in</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginBottom: 6 }}>Full name *</Text>
      <TextInput
        style={{ ...fieldStyle, marginBottom: 14 }}
        placeholder="John Doe"
        value={fullName}
        onChangeText={setFullName}
        editable={!loading}
        placeholderTextColor={CustomerTheme.inkSoft}
      />

      <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginBottom: 6 }}>Work email *</Text>
      <TextInput
        style={{ ...fieldStyle, marginBottom: 14 }}
        placeholder="you@firstmobital.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
        placeholderTextColor={CustomerTheme.inkSoft}
      />

      <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginBottom: 6 }}>Phone (optional)</Text>
      <TextInput
        style={{ ...fieldStyle, marginBottom: 14 }}
        placeholder="9876543210"
        value={phone}
        onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
        keyboardType="phone-pad"
        editable={!loading}
        placeholderTextColor={CustomerTheme.inkSoft}
      />

      <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginBottom: 8 }}>Which role do you need? *</Text>
      <View style={{ gap: 8, marginBottom: 14 }}>
        {STAFF_SIGNUP_ROLE_OPTIONS.map((role) => {
          const selected = selectedRole === role.id
          return (
            <TouchableOpacity
              key={role.id}
              onPress={() => setSelectedRole(role.id as StaffSignupRoleId)}
              disabled={loading}
              style={{
                borderWidth: 1,
                borderColor: selected ? CustomerTheme.primary : CustomerTheme.border,
                backgroundColor: selected ? '#EFF6FF' : '#fff',
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Text style={{ fontWeight: '800', color: CustomerTheme.ink }}>{role.label}</Text>
              <Text style={{ fontSize: 12, color: CustomerTheme.inkMuted, marginTop: 2 }}>{role.desc}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginBottom: 6 }}>Password *</Text>
      <View style={{ position: 'relative', marginBottom: 8 }}>
        <TextInput
          style={{ ...fieldStyle, paddingRight: 72 }}
          placeholder="••••••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          editable={!loading}
          placeholderTextColor={CustomerTheme.inkSoft}
        />
        <TouchableOpacity
          onPress={() => setShowPassword((v) => !v)}
          style={{ position: 'absolute', right: 12, top: 12, padding: 4 }}
        >
          <Text style={{ color: CustomerTheme.primary, fontWeight: '700', fontSize: 13 }}>{showPassword ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {[0, 1, 2, 3].map((i) => {
          const color = pwScore <= 1 ? '#DC2626' : pwScore === 2 ? '#F59E0B' : pwScore === 3 ? '#3B82F6' : '#16A34A'
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i < pwScore ? color : '#E2E8F0',
              }}
            />
          )
        })}
      </View>
      {STAFF_PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        return (
          <Text key={rule.id} style={{ fontSize: 12, color: ok ? '#16A34A' : CustomerTheme.inkMuted, marginBottom: 2 }}>
            {ok ? '✓' : '○'} {rule.label}
          </Text>
        )
      })}

      {error ? (
        <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600', marginTop: 12 }}>{error}</Text>
      ) : null}

      <TouchableOpacity
        onPress={() => void handleSignUp()}
        disabled={loading || pwScore < 4 || !selectedRole}
        style={{
          marginTop: 16,
          backgroundColor: loading || pwScore < 4 || !selectedRole ? '#93C5FD' : CustomerTheme.primary,
          borderRadius: CustomerTheme.radiusButton,
          paddingVertical: 14,
          alignItems: 'center',
        }}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Request access</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={{ marginTop: 16, alignItems: 'center' }}>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 14 }}>
          Already have an account? <Text style={{ color: CustomerTheme.primary, fontWeight: '700' }}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </SimpleServiceLoginShell>
  )
}
