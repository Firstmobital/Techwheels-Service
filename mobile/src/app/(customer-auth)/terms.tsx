import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import {
  CUSTOMER_TERMS_ACKNOWLEDGEMENT,
  CUSTOMER_TERMS_INTRO,
  CUSTOMER_TERMS_SECTIONS,
  CUSTOMER_TERMS_TITLE,
} from '../../lib/customer/customerTermsContent'

export default function CustomerTermsScreen() {
  const router = useRouter()
  const { acceptTerms, signOut, termsNeedsAcceptance, token } = useCustomerSession()
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      router.replace('/(customer-auth)/login')
      return
    }
    if (!termsNeedsAcceptance) {
      router.replace('/(customer)')
    }
  }, [token, termsNeedsAcceptance, router])

  if (!token || !termsNeedsAcceptance) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CustomerTheme.bg }}>
        <ActivityIndicator color={CustomerTheme.primary} />
      </View>
    )
  }

  const onAccept = async () => {
    if (!checked) {
      setError('Please confirm that you have read and accept the Terms & Conditions.')
      return
    }
    setLoading(true)
    setError('')
    const result = await acceptTerms()
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.replace('/(customer)')
  }

  return (
    <View style={{ flex: 1, backgroundColor: CustomerTheme.bg }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: CustomerTheme.border,
          backgroundColor: '#fff',
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: CustomerTheme.primary, textTransform: 'uppercase' }}>
          Required before you continue
        </Text>
        <Text style={{ fontSize: 17, fontWeight: '800', color: CustomerTheme.ink, marginTop: 6 }}>
          Terms & Conditions
        </Text>
        <Text style={{ fontSize: 12, color: CustomerTheme.inkSoft, marginTop: 4, lineHeight: 18 }}>
          Please read and accept to use TechWheels customer app (service, repair & vehicle handover).
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator
      >
        <Text style={{ fontSize: 14, fontWeight: '800', color: CustomerTheme.ink, lineHeight: 20 }}>
          {CUSTOMER_TERMS_TITLE}
        </Text>
        <Text style={{ fontSize: 13, color: CustomerTheme.ink, marginTop: 14, lineHeight: 20 }}>
          {CUSTOMER_TERMS_INTRO}
        </Text>
        {CUSTOMER_TERMS_SECTIONS.map((section) => (
          <View key={section.heading} style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: CustomerTheme.ink, marginBottom: 6 }}>
              {section.heading}
            </Text>
            <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>{section.body}</Text>
          </View>
        ))}
        <Text style={{ fontSize: 13, fontWeight: '700', color: CustomerTheme.ink, marginTop: 18, lineHeight: 20 }}>
          {CUSTOMER_TERMS_ACKNOWLEDGEMENT}
        </Text>
      </ScrollView>

      <View
        style={{
          padding: 16,
          paddingBottom: 24,
          borderTopWidth: 1,
          borderTopColor: CustomerTheme.border,
          backgroundColor: '#fff',
        }}
      >
        <TouchableOpacity
          onPress={() => {
            setChecked((v) => !v)
            if (error) setError('')
          }}
          style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}
          activeOpacity={0.8}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: checked ? CustomerTheme.primary : '#9CA3AF',
              backgroundColor: checked ? CustomerTheme.primary : '#fff',
              marginRight: 10,
              marginTop: 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {checked ? <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>✓</Text> : null}
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: CustomerTheme.ink, lineHeight: 20 }}>
            I have read (or had explained to me) these Terms & Conditions and accept them as part of my service /
            repair relationship with First Mobital Private Limited (TechWheels).
          </Text>
        </TouchableOpacity>

        {error ? (
          <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600', marginBottom: 10 }}>{error}</Text>
        ) : null}

        <TouchableOpacity
          onPress={() => void onAccept()}
          disabled={loading || !checked}
          style={{
            backgroundColor: loading || !checked ? '#93C5FD' : CustomerTheme.primary,
            borderRadius: CustomerTheme.radiusButton,
            paddingVertical: 14,
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>I Accept — Continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => void signOut().then(() => router.replace('/(audience)'))}
          disabled={loading}
          style={{ alignItems: 'center', paddingVertical: 8 }}
        >
          <Text style={{ color: CustomerTheme.inkSoft, fontSize: 14, fontWeight: '600' }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
