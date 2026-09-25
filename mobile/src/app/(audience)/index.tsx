import { Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LegalLinks } from '../../components/LegalLinks'
import { Icon, IconName } from '../../components/ui/Icon'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { CustomerTheme } from '../../lib/customer/customerTheme'

export default function AudienceChooserScreen() {
  const router = useRouter()
  const { lastAudience, rememberAudience } = useCustomerSession()

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: CustomerTheme.bg }} edges={['top', 'bottom']}>
      <View className="flex-1 px-5">
        <LinearGradient
          colors={[CustomerTheme.primary, CustomerTheme.navy]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: CustomerTheme.radiusCard,
            paddingHorizontal: 20,
            paddingTop: 28,
            paddingBottom: 24,
            marginTop: 8,
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            TATA.CARS · Authorised Service
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 8, letterSpacing: -0.5 }}>
            Techwheels Service
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 17, fontWeight: '700', marginTop: 16, lineHeight: 24 }}>
            How would you like to sign in?
          </Text>
        </LinearGradient>

        <Text
          style={{
            color: CustomerTheme.inkMuted,
            fontSize: 14,
            fontWeight: '600',
            marginTop: 22,
            marginBottom: 12,
            paddingHorizontal: 4,
          }}
        >
          Choose your account type
        </Text>

        <AudienceOption
          icon="user"
          title="Customer"
          description="Sign in with your 10-digit mobile number. View every vehicle linked to that number."
          selected={lastAudience === 'customer'}
          onPress={async () => {
            await rememberAudience('customer')
            router.push('/(customer-auth)/login')
          }}
        />

        <AudienceOption
          icon="settings"
          title="Workshop staff"
          description="Use your workshop email and password for reception, floor, bodyshop, and reports."
          selected={lastAudience === 'staff'}
          onPress={async () => {
            await rememberAudience('staff')
            router.push('/(auth)/login')
          }}
        />

        <View style={{ marginTop: 'auto', paddingTop: 28, paddingBottom: 8 }}>
          <Text
            style={{
              textAlign: 'center',
              color: CustomerTheme.inkMuted,
              fontSize: 13,
              fontWeight: '700',
              marginBottom: 14,
            }}
          >
            Techwheels Service
          </Text>
          <LegalLinks compact />
          <Text
            style={{
              textAlign: 'center',
              color: CustomerTheme.inkSoft,
              fontSize: 11,
              fontWeight: '600',
              marginTop: 12,
            }}
          >
            © 2026 Techwheels. All rights reserved.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

function AudienceOption({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: IconName
  title: string
  description: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: CustomerTheme.radiusCard,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? CustomerTheme.primary : CustomerTheme.border,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: CustomerTheme.navy,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: selected ? 0.08 : 0.04,
        shadowRadius: 10,
        elevation: selected ? 3 : 1,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: selected ? CustomerTheme.primaryLight : CustomerTheme.bgMuted,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
        }}
      >
        <Icon name={icon} size={22} color={CustomerTheme.primary} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ color: CustomerTheme.ink, fontSize: 17, fontWeight: '900' }}>{title}</Text>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 13.5, marginTop: 4, lineHeight: 19, fontWeight: '500' }}>
          {description}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={CustomerTheme.inkSoft} strokeWidth={2.2} />
    </TouchableOpacity>
  )
}
