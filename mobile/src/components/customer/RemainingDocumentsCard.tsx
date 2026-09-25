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
    const p = await loadClaimDocumentProgress(token, regNumber)
    setProgress(p)
  }, [token, regNumber])

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
        backgroundColor: CustomerTheme.navyDeep,
        borderRadius: 22,
        padding: 18,
        marginBottom: 14,
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

      <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginBottom: 6 }}>
        Upload {progress.remainingCount} more document{progress.remainingCount === 1 ? '' : 's'}
      </Text>

      {progress.missingSummary ? (
        <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12.5, lineHeight: 18, marginBottom: 14 }}>
          {progress.missingSummary}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, fontWeight: '600' }}>
          {progress.uploadedCount} of {progress.totalRequired} documents submitted
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' }}>{pct}%</Text>
      </View>

      <View
        style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.15)',
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <View style={{ width: `${Math.max(4, pct)}%`, height: '100%', backgroundColor: '#FFFFFF', borderRadius: 999 }} />
      </View>

      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 999,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Icon name="cloud-upload" size={18} color={CustomerTheme.navyDeep} strokeWidth={2.2} />
        <Text style={{ color: CustomerTheme.navyDeep, fontSize: 14, fontWeight: '900' }}>Upload now</Text>
      </View>
    </TouchableOpacity>
  )
}
