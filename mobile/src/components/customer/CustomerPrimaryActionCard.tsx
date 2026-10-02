import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetRepairCard } from '../../lib/api/customerPortal'
import { computeSettlement } from '../../lib/customer/math'
import { claimDocumentProgressFromSnapshot, loadClaimDocumentProgress } from '../../lib/customer/claimDocumentProgress'
import {
  readAdditionalApprovalPending,
  readEstimateApprovalPending,
  resolveCustomerPrimaryAction,
  resolveMechanicalPrimaryAction,
} from '../../lib/customer/customerPrimaryAction'
import { useCustomerVisit } from '../../context/CustomerVisitContext'
import { isEffectiveMechanicalCustomerVisit } from '../../lib/customer/mechanicalServiceType'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { Icon } from '../ui/Icon'
import { useCustomerScreenRefresh } from './customerScreenRefresh'

/** PRD §8 — single prioritized customer action (gate pass handled separately). */
export function CustomerPrimaryActionCard({ includeDocumentAction = true }: { includeDocumentAction?: boolean }) {
  const router = useRouter()
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const { ready: visitReady, mechCase, repairCard, isBodyshop, kind } = useCustomerVisit()
  const isEffectiveMechanical = isEffectiveMechanicalCustomerVisit({
    visitReady,
    kind,
    isBodyshop,
    repairCard,
  })

  const initialAction = useMemo(() => {
    if (isEffectiveMechanical) return resolveMechanicalPrimaryAction(mechCase)
    if (!repairCard) return null
    const progress = claimDocumentProgressFromSnapshot(repairCard, null)
    const stage = Number(repairCard.current_stage || 0)
    const pay = computeSettlement({
      billed: (repairCard.total_billed ?? repairCard.billed_amount) as number | null | undefined,
      received: (repairCard.amount_received ?? repairCard.customer_amount_received) as number | null | undefined,
    })
    return resolveCustomerPrimaryAction({
      claimMode: progress.claimMode,
      missingMandatoryDocs: progress.remainingCount,
      currentStage: stage,
      estimateApprovalPending: readEstimateApprovalPending(repairCard),
      additionalApprovalPending: readAdditionalApprovalPending(repairCard),
      customerSettlementDue: pay.status === 'due' || pay.status === 'partial',
      includeDocumentAction,
      isMechanical: false,
    })
  }, [isEffectiveMechanical, mechCase, repairCard, includeDocumentAction])

  const [action, setAction] = useState<ReturnType<typeof resolveCustomerPrimaryAction>>(initialAction)

  const refresh = useCallback(async () => {
    if (!token || !visitReady) {
      setAction(null)
      return
    }
    if (isEffectiveMechanical) {
      setAction(resolveMechanicalPrimaryAction(mechCase))
      return
    }

    const [progress, card] = await Promise.all([
      loadClaimDocumentProgress(selectedReg, token),
      Promise.resolve(repairCard ?? customerGetRepairCard(token, selectedReg).catch(() => null)),
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
        isMechanical: isEffectiveMechanical,
      })
    )
  }, [token, selectedReg, includeDocumentAction, visitReady, isEffectiveMechanical, mechCase, repairCard])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh])
  )

  useCustomerScreenRefresh(refresh)

  const activeAction = action ?? initialAction

  if (!activeAction) return null

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
          <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900' }}>{activeAction.message}</Text>
          {activeAction.detail ? (
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>{activeAction.detail}</Text>
          ) : null}
          <TouchableOpacity
            onPress={() => router.push(activeAction.route)}
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
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>{activeAction.ctaLabel}</Text>
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
