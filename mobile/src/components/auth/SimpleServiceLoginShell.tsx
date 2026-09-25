import { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CustomerTheme } from '../../lib/customer/customerTheme'

export function SimpleServiceLoginShell({
  title,
  subtitle,
  children,
  showBackToAudience,
}: {
  title: string
  subtitle: string
  children: ReactNode
  showBackToAudience?: boolean
}) {
  const router = useRouter()

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: CustomerTheme.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {showBackToAudience ? (
            <TouchableOpacity onPress={() => router.replace('/(audience)')} className="pt-2 pb-4">
              <Text style={{ color: CustomerTheme.primary, fontSize: 15, fontWeight: '700' }}>← Back</Text>
            </TouchableOpacity>
          ) : null}

          <View className="pt-4 pb-6">
            <Text style={{ color: CustomerTheme.ink, fontSize: 28, fontWeight: '900' }}>{title}</Text>
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 15, marginTop: 6, lineHeight: 22 }}>{subtitle}</Text>
          </View>

          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: CustomerTheme.radiusCard,
              borderWidth: 1,
              borderColor: CustomerTheme.border,
              padding: 20,
            }}
          >
            {children}
          </View>

          <Text
            style={{
              textAlign: 'center',
              color: CustomerTheme.inkMuted,
              fontSize: 13,
              fontWeight: '700',
              marginTop: 'auto',
              paddingTop: 28,
            }}
          >
            Techwheels Service
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
