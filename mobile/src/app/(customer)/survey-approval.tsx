import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, ModernErrorCard } from '../../components/customer/customerUi'
import { CustomerSurveyApprovalCard } from '../../components/customer/CustomerSurveyApprovalCard'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { useCustomerVisit } from '../../context/CustomerVisitContext'
import { isBodyshopReceptionServiceType } from '../../lib/customer/mechanicalServiceType'
import { customerGetRepairCard, parseBodyshopSurveyApprovalDocument } from '../../lib/api/customerPortal'
import { useCustomerScreenRefresh } from '../../components/customer/customerScreenRefresh'
import { CustomerTheme } from '../../lib/customer/customerTheme'

export default function CustomerSurveyApprovalScreen() {
  const { token, selectedReg } = useCustomerSession()
  const { repairCard: visitCard, job, isBodyshop, kind } = useCustomerVisit()
  const [card, setCard] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeCard = card ?? visitCard
  const hasDoc = Boolean(parseBodyshopSurveyApprovalDocument(activeCard))
  const accidentJob = isBodyshopReceptionServiceType(String(job?.service_type ?? ''))
  const showApproval =
    hasDoc ||
    isBodyshop ||
    kind === 'bodyshop' ||
    accidentJob ||
    Boolean(activeCard && Number(activeCard.id || 0) > 0)

  const load = useCallback(
    async (silent = false) => {
      if (!token || !selectedReg) return
      if (!silent && !visitCard) setLoading(true)
      setError(null)
      try {
        const fresh = await customerGetRepairCard(token, selectedReg, { bypassCache: !silent })
        if (fresh) setCard(fresh)
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Unable to load survey approval.')
        }
      } finally {
        setLoading(false)
      }
    },
    [token, selectedReg, visitCard],
  )

  useFocusEffect(
    useCallback(() => {
      void load(Boolean(visitCard))
      const timer = setInterval(() => void load(true), 8000)
      return () => clearInterval(timer)
    }, [load, visitCard]),
  )

  useCustomerScreenRefresh(useCallback(async () => {
    await load(true)
  }, [load]))

  return (
    <CustomerScreen
      title="Survey Approval"
      subtitle="Review the insurer / surveyor approval document from your advisor"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, fontWeight: '700' }}>
          {hasDoc ? 'Document ready for your decision' : 'Waiting for advisor upload'}
        </Text>
        <TouchableOpacity
          onPress={() => void load(true)}
          style={{
            borderWidth: 1,
            borderColor: CustomerTheme.border,
            backgroundColor: '#fff',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '800', color: CustomerTheme.ink }}>{loading ? 'Checking…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {error ? <ModernErrorCard message={error} onRetry={() => void load(false)} /> : null}

      {loading && !activeCard && !showApproval ? (
        <ActivityIndicator color={CustomerTheme.primary} style={{ marginTop: 24 }} />
      ) : showApproval && token && selectedReg ? (
        <CustomerSurveyApprovalCard
          token={token}
          regNumber={selectedReg}
          repairCard={activeCard}
          moduleScreen
          onDecided={() => void load(true)}
        />
      ) : (
        <CustomerCard>
          <Text style={{ fontSize: 15, fontWeight: '800', color: CustomerTheme.ink }}>Not applicable</Text>
          <Text style={{ fontSize: 12.5, color: CustomerTheme.inkMuted, marginTop: 6, lineHeight: 18 }}>
            Survey approval is for accident / bodyshop repair visits. Select a bodyshop vehicle or check back after your advisor
            starts a repair card.
          </Text>
        </CustomerCard>
      )}
    </CustomerScreen>
  )
}
