import { useCallback, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { loadClaimDocumentProgress, type ClaimDocumentProgress } from '../../lib/customer/claimDocumentProgress'
import { Icon } from '../ui/Icon'

export function RemainingDocumentsCard({ regNumber }: { regNumber?: string | null }) {
  const router = useRouter()
  const { token } = useCustomerSession()
  const [progress, setProgress] = useState<ClaimDocumentProgress | null>(null)

  const refresh = useCallback(async () => {
    const p = await loadClaimDocumentProgress(regNumber, token)
    setProgress(p)
  }, [regNumber, token])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh])
  )

  if (!progress || progress.claimMode === 'cash' || progress.remainingCount === 0) {
    return null
  }

  const pct = progress.progressPercent

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => router.push('/(customer)/documents')}
      style={{
        backgroundColor: CustomerTheme.card,
        borderRadius: CustomerTheme.radiusCard,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: CustomerTheme.border,
        borderLeftWidth: 4,
        borderLeftColor: CustomerTheme.primary,
      }}
    >
      <View
        style={{
          alignSelf: 'flex-start',
          backgroundColor: CustomerTheme.cream,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: CustomerTheme.creamInk, fontSize: 11, fontWeight: '800' }}>Needs you</Text>
      </View>

      <Text style={{ color: CustomerTheme.ink, fontSize: 18, fontWeight: '900', marginBottom: 6 }}>
        Upload {progress.remainingCount} more document{progress.remainingCount === 1 ? '' : 's'}
      </Text>

      {progress.missingSummary ? (
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 14 }}>
          {progress.missingSummary}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11.5, fontWeight: '600' }}>
          {progress.uploadedCount} of {progress.totalRequired} documents submitted
        </Text>
        <Text style={{ color: CustomerTheme.primary, fontSize: 11.5, fontWeight: '800' }}>{pct}%</Text>
      </View>

      <View
        style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: CustomerTheme.primaryLight,
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <View style={{ width: `${Math.max(4, pct)}%`, height: '100%', backgroundColor: CustomerTheme.primary, borderRadius: 999 }} />
      </View>

      <View
        style={{
          backgroundColor: CustomerTheme.primary,
          borderRadius: CustomerTheme.radiusButton,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Icon name="cloud-upload" size={18} color="#FFFFFF" strokeWidth={2.2} />
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>Upload now</Text>
      </View>
    </TouchableOpacity>
  )
}
