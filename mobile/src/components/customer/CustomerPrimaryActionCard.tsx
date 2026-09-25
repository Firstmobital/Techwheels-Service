import { useCallback, useState, type ReactNode } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetRepairCard } from '../../lib/api/customerPortal'
import { computeSettlement } from '../../lib/customer/math'
import { loadClaimDocumentProgress } from '../../lib/customer/claimDocumentProgress'
import {
  readAdditionalApprovalPending,
  readEstimateApprovalPending,
  resolveCustomerPrimaryAction,
} from '../../lib/customer/customerPrimaryAction'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { Icon } from '../ui/Icon'
import { useCustomerScreenRefresh } from './customerScreenRefresh'

/** PRD §8 — single prioritized customer action (gate pass handled separately). */
export function CustomerPrimaryActionCard({ includeDocumentAction = true }: { includeDocumentAction?: boolean }) {
  const router = useRouter()
  const { token, selectedReg } = useCustomerSession()
  const [action, setAction] = useState<ReturnType<typeof resolveCustomerPrimaryAction>>(null)

  const refresh = useCallback(async () => {
    if (!token) {
      setAction(null)
      return
    }
    const [progress, card] = await Promise.all([
      loadClaimDocumentProgress(selectedReg, token),
      customerGetRepairCard(token, selectedReg).catch(() => null),
    ])
    const stage = Number(card?.current_stage || 0)
    const pay = computeSettlement({
      billed: card?.total_billed ?? card?.billed_amount,
      received: card?.amount_received ?? card?.customer_amount_received,
    })

    setAction(
      resolveCustomerPrimaryAction({
        claimMode: progress.claimMode,
        missingMandatoryDocs: progress.remainingCount,
        currentStage: stage,
        estimateApprovalPending: readEstimateApprovalPending(card),
        additionalApprovalPending: readAdditionalApprovalPending(card),
        customerSettlementDue: pay.status === 'due' || pay.status === 'partial',
        includeDocumentAction,
      })
    )
  }, [token, selectedReg, includeDocumentAction])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh])
  )

  useCustomerScreenRefresh(refresh)

  if (!action) return null

  return (
    <CustomerCardShell>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: CustomerTheme.tabActiveBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="alert-circle" size={20} color={CustomerTheme.primary} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900' }}>{action.message}</Text>
          {action.detail ? (
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>{action.detail}</Text>
          ) : null}
          <TouchableOpacity
            onPress={() => router.push(action.route)}
            activeOpacity={0.88}
            style={{
              marginTop: 12,
              alignSelf: 'flex-start',
              backgroundColor: CustomerTheme.primary,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: CustomerTheme.radiusButton,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>{action.ctaLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </CustomerCardShell>
  )
}

function CustomerCardShell({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: CustomerTheme.border,
        padding: 16,
        marginBottom: 14,
      }}
    >
      {children}
    </View>
  )
}
