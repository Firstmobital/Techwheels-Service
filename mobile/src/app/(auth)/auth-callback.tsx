import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { parseAuthCallbackUrl } from '../../lib/parseAuthCallbackUrl'
import { supabase } from '../../lib/supabase'
import { CustomerTheme } from '../../lib/customer/customerTheme'

async function completeAuthFromUrl(url: string): Promise<{ error?: string; type?: string | null }> {
  const { code, accessToken, refreshToken, type } = parseAuthCallbackUrl(url)

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return { error: error.message }
    return { type }
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) return { error: error.message }
    return { type }
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) return { error: error.message }
  if (!data.session) return { error: 'Could not verify your email. The link may have expired.' }
  return { type }
}

export default function AuthCallbackScreen() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let mounted = true

    const run = async (url: string | null) => {
      if (!url) {
        if (mounted) {
          setError('Invalid confirmation link.')
          setBusy(false)
        }
        return
      }
      const result = await completeAuthFromUrl(url)
      if (!mounted) return
      if (result.error) {
        setError(result.error)
        setBusy(false)
        return
      }
      if (result.type === 'recovery') {
        router.replace('/(auth)/password-update')
        return
      }
      router.replace('/(tabs)/home')
    }

    void Linking.getInitialURL().then((initial) => {
      void run(initial)
    })

    const sub = Linking.addEventListener('url', (event) => {
      setBusy(true)
      setError(null)
      void run(event.url)
    })

    return () => {
      mounted = false
      sub.remove()
    }
  }, [router])

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: CustomerTheme.bg }} edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8">
        {busy && !error ? (
          <>
            <ActivityIndicator size="large" color={CustomerTheme.primary} />
            <Text style={{ color: CustomerTheme.inkMuted, marginTop: 16, fontSize: 15 }}>Verifying your email…</Text>
          </>
        ) : null}
        {error ? (
          <>
            <Text style={{ color: CustomerTheme.ink, fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>
              Confirmation failed
            </Text>
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>{error}</Text>
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              style={{
                marginTop: 24,
                backgroundColor: CustomerTheme.primary,
                paddingHorizontal: 24,
                paddingVertical: 14,
                borderRadius: CustomerTheme.radiusButton,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
