import { useCallback, useMemo, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import {
  claimDocumentProgressFromSnapshot,
  loadClaimDocumentProgress,
  type ClaimDocumentProgress,
} from '../../lib/customer/claimDocumentProgress'
import { useCustomerVisit } from '../../context/CustomerVisitContext'
import { isEffectiveMechanicalCustomerVisit } from '../../lib/customer/mechanicalServiceType'
import { Icon } from '../ui/Icon'
import { useCustomerScreenRefresh } from './customerScreenRefresh'

export function RemainingDocumentsCard({ regNumber }: { regNumber?: string | null }) {
  const router = useRouter()
  const { token, vehicles, selectedReg } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === (regNumber || selectedReg)) || vehicles[0]
  const { repairCard, isBodyshop, ready: visitReady, kind } = useCustomerVisit()
  const isEffectiveMechanical = isEffectiveMechanicalCustomerVisit({
    visitReady,
    kind,
    isBodyshop,
    repairCard,
  })

  const initialProgress = useMemo(() => {
    if (isEffectiveMechanical || (!isBodyshop && !repairCard)) return null
    const snapshot = claimDocumentProgressFromSnapshot(repairCard, null)
    return snapshot.remainingCount > 0 && snapshot.claimMode !== 'cash' ? snapshot : null
  }, [isEffectiveMechanical, isBodyshop, repairCard])

  const [progress, setProgress] = useState<ClaimDocumentProgress | null>(initialProgress)

  const refresh = useCallback(async () => {
    if (isEffectiveMechanical) {
      setProgress(null)
      return
    }
    const targetReg = regNumber || selectedReg || selected?.reg_number
    if (!targetReg) return

    if (repairCard) {
      const snapshotProgress = claimDocumentProgressFromSnapshot(repairCard, null)
      if (snapshotProgress.remainingCount > 0 && snapshotProgress.claimMode !== 'cash') {
        setProgress(snapshotProgress)
      }
    }

    const p = await loadClaimDocumentProgress(targetReg, token)
    if (p) {
      if (p.claimMode === 'cash' || p.remainingCount === 0) {
        setProgress(null)
      } else {
        setProgress(p)
      }
    }
  }, [regNumber, selectedReg, selected, token, isEffectiveMechanical, repairCard])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh])
  )

  useCustomerScreenRefresh(refresh)

  const activeProgress = progress ?? initialProgress

  if (isEffectiveMechanical || !activeProgress || activeProgress.claimMode === 'cash' || activeProgress.remainingCount === 0) {
    return null
  }

  const pct = activeProgress.progressPercent

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
        Upload {activeProgress.remainingCount} more document{activeProgress.remainingCount === 1 ? '' : 's'}
      </Text>

      {activeProgress.missingSummary ? (
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 14 }}>
          {activeProgress.missingSummary}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11.5, fontWeight: '600' }}>
          {activeProgress.uploadedCount} of {activeProgress.totalRequired} documents submitted
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
