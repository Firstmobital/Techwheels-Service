import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, asText, dash, formatInr } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetActiveJob, customerGetRepairCard } from '../../lib/api/customerPortal'

const STAGE_LABELS: Record<number, string> = {
  1: 'Vehicle Receiving',
  2: 'Receiving Photos',
  3: 'Job Card',
  4: 'Customer Group',
  5: 'Documentation',
  6: 'Estimation',
  7: 'Estimation Approval',
  8: 'Claim Intimation',
  9: 'Survey',
  10: 'Parts Status',
  11: 'Floor Assignment',
  12: 'Additional Approval',
  13: 'Quality Check',
  14: 'Re-Inspection',
  15: 'Billing',
  16: 'DO Status',
  17: 'Delivery',
  18: 'Payment',
}

export default function CustomerTrackerScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [card, setCard] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [jobResult, repair] = await Promise.all([
        customerGetActiveJob(token, selectedReg),
        customerGetRepairCard(token, selectedReg).catch(() => null),
      ])
      setJob(jobResult.job)
      setCard(repair)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tracker.')
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const invoiced = Boolean(job?.invoice_done_at || selected?.invoice_done_at)
  const jc = asText(job?.jc_number) || asText(selected?.jc_number)
  const estimateIssued = Boolean(job?.estimate_drive_url || job?.estimate_storage_path || jc)
  const advisor = asText(job?.sa_display_name) || asText(job?.sa_name) || asText(selected?.sa_display_name) || asText(selected?.sa_name)
  const currentStage = Number(card?.current_stage || 0)
  const qcDone = String(card?.qc_status || '').toLowerCase() === 'pass' || invoiced

  const stages = [
    { title: 'Reception & Job Card Opened', desc: 'Vehicle checked in at workshop', completed: true },
    {
      title: 'Advisor Inspection & Estimate',
      desc: 'Job card created and estimate generated',
      completed: estimateIssued,
    },
    {
      title: 'Workshop & Bodyshop Repairs',
      desc: 'Technicians working on repairs & parts replacement',
      completed: invoiced || currentStage >= 11,
      current: !invoiced && Boolean(jc),
    },
    {
      title: 'Quality Check & Washing',
      desc: 'Final inspection & vehicle readiness',
      completed: qcDone,
    },
    {
      title: 'Invoiced & Gatepass Ready',
      desc: 'Ready for customer pickup and delivery',
      completed: invoiced,
    },
  ]

  return (
    <CustomerScreen
      title="Live Repair Tracker"
      subtitle={`Real-time repair and service stages for ${selected?.reg_number || 'your vehicle'}`}
    >
      {error ? <CustomerToast ok={false} message={error} /> : null}
      {loading ? (
        <ActivityIndicator color="#2563eb" />
      ) : (
        <>
          {card ? (
            <CustomerCard style={{ borderLeftWidth: 4, borderLeftColor: '#2563eb' }}>
              <View className="flex-row justify-between mb-3">
                <View>
                  <Text className="text-[16px] font-bold">Bodyshop Insurance Claim</Text>
                  <Text className="text-slate-500 text-xs">
                    Claim #{dash(card.claim_intimation_no)}
                  </Text>
                </View>
                <View className="bg-purple-100 px-2 py-1 rounded-full">
                  <Text className="text-purple-800 text-[11px] font-bold">{dash(card.overall_status)}</Text>
                </View>
              </View>
              <View className="flex-row flex-wrap">
                <View className="w-1/2 mb-2">
                  <Text className="text-slate-500 text-xs">Insurance</Text>
                  <Text className="font-bold">{dash(card.insurance_company)}</Text>
                </View>
                <View className="w-1/2 mb-2">
                  <Text className="text-slate-500 text-xs">Surveyor</Text>
                  <Text className="font-bold">{dash(card.surveyor_name)}</Text>
                </View>
                {card.estimated_amount != null ? (
                  <View className="w-1/2">
                    <Text className="text-slate-500 text-xs">Estimate</Text>
                    <Text className="font-bold">{formatInr(card.estimated_amount)}</Text>
                  </View>
                ) : null}
                {currentStage > 0 ? (
                  <View className="w-1/2">
                    <Text className="text-slate-500 text-xs">Current stage</Text>
                    <Text className="font-bold">
                      {asText(card.current_stage_name) || STAGE_LABELS[currentStage] || `Stage ${currentStage}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </CustomerCard>
          ) : null}

          <CustomerCard>
            <Text className="text-[16px] font-bold mb-3">Service Stages</Text>
            {stages.map((stage, index) => (
              <View key={stage.title} className="flex-row mb-4">
                <View
                  className={`h-8 w-8 rounded-full items-center justify-center mr-3 ${
                    stage.completed ? 'bg-green-600' : stage.current ? 'bg-amber-500' : 'bg-slate-200'
                  }`}
                >
                  <Text className={`font-bold ${stage.completed || stage.current ? 'text-white' : 'text-slate-600'}`}>
                    {stage.completed ? '✓' : stage.current ? '⏳' : String(index + 1)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-slate-900">{stage.title}</Text>
                  <Text className="text-[12.5px] text-slate-500">{stage.desc}</Text>
                </View>
              </View>
            ))}
          </CustomerCard>

          <CustomerCard style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">📞</Text>
              <View>
                <Text className="text-[13.5px] font-bold text-green-800">Need an urgent update?</Text>
                <Text className="text-[12px] text-green-700">
                  Contact your Service Advisor: <Text className="font-bold">{dash(advisor)}</Text>
                </Text>
              </View>
            </View>
          </CustomerCard>
        </>
      )}
    </CustomerScreen>
  )
}
