import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, ModernErrorCard } from '../../components/customer/customerUi'
import { CustomerSurveyApprovalCard } from '../../components/customer/CustomerSurveyApprovalCard'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { useCustomerVisit } from '../../context/CustomerVisitContext'
import { isEffectiveBodyshopCustomerVisit } from '../../lib/customer/mechanicalServiceType'
import { customerGetRepairCard, parseBodyshopSurveyApprovalDocument } from '../../lib/api/customerPortal'
import { useCustomerScreenRefresh } from '../../components/customer/customerScreenRefresh'
import { CustomerTheme } from '../../lib/customer/customerTheme'

export default function CustomerSurveyApprovalScreen() {
  const { token, selectedReg } = useCustomerSession()
  const { repairCard: visitCard, refresh: refreshVisit, visitReady, kind, isBodyshop } = useCustomerVisit()
  const [card, setCard] = useState<Record<string, unknown> | null>(visitCard ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isBodyshopVisit = isEffectiveBodyshopCustomerVisit({
    visitReady,
    kind,
    isBodyshop,
    repairCard: card ?? visitCard,
  })

  const load = useCallback(
    async (silent = false) => {
      if (!token || !selectedReg) return
      if (!silent) setLoading(true)
      setError(null)
      try {
        const fresh = await customerGetRepairCard(token, selectedReg)
        setCard(fresh)
        await refreshVisit({ bypassCache: true })
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Unable to load survey approval.')
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [token, selectedReg, refreshVisit],
  )

  useFocusEffect(
    useCallback(() => {
      void load(false)
      const timer = setInterval(() => void load(true), 5000)
      return () => clearInterval(timer)
    }, [load]),
  )

  useCustomerScreenRefresh(useCallback(async () => {
    await load(true)
  }, [load]))

  const activeCard = card ?? visitCard
  const hasDoc = Boolean(parseBodyshopSurveyApprovalDocument(activeCard))

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

      {loading && !activeCard ? (
        <ActivityIndicator color={CustomerTheme.primary} style={{ marginTop: 24 }} />
      ) : !isBodyshopVisit ? (
        <CustomerCard>
          <Text style={{ fontSize: 15, fontWeight: '800', color: CustomerTheme.ink }}>Not applicable</Text>
          <Text style={{ fontSize: 12.5, color: CustomerTheme.inkMuted, marginTop: 6, lineHeight: 18 }}>
            Survey approval is for accident / bodyshop repair visits. Select a bodyshop vehicle or check back after your advisor
            starts a repair card.
          </Text>
        </CustomerCard>
      ) : token && selectedReg ? (
        <CustomerSurveyApprovalCard
          token={token}
          regNumber={selectedReg}
          repairCard={activeCard}
          moduleScreen
          onDecided={() => void load(true)}
        />
      ) : null}
    </CustomerScreen>
  )
}
