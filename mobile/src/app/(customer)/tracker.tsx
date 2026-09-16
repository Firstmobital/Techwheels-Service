import { useCallback, useState } from 'react'
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, asText, dash, formatInr } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetActiveJob, customerGetRepairCard } from '../../lib/api/customerPortal'
import { supabase } from '../../lib/supabase'

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

interface AllocatedTechnicianInfo {
  name: string
  code?: string | null
  bay_no?: string | null
  assigned_at?: string | null
  work_status?: string | null
  remark?: string | null
}

export default function CustomerTrackerScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [card, setCard] = useState<Record<string, unknown> | null>(null)
  const [techInfo, setTechInfo] = useState<AllocatedTechnicianInfo | null>(null)
  const [selectedStageIndex, setSelectedStageIndex] = useState<number | null>(null)
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
      const activeJob = jobResult.job
      setJob(activeJob)
      setCard(repair)

      // Fetch live technician & bay details from Floor Incharge
      const activeJc = (activeJob?.jc_number as string) || (selected?.jc_number as string) || ''
      if (activeJc) {
        try {
          const { data: assignData } = await supabase
            .from('technician_assignments')
            .select('*')
            .eq('job_card_number', activeJc.trim().toUpperCase())
            .order('id', { ascending: false })
            .limit(1)

          if (assignData && assignData.length > 0) {
            const row = assignData[0]
            if (row.technician_name && row.technician_name.toLowerCase() !== 'not required') {
              setTechInfo({
                name: row.technician_name,
                code: row.technician_code,
                bay_no: row.bay_no,
                assigned_at: row.assigned_at,
                work_status: row.work_status,
                remark: row.remark,
              })
            }
          }
        } catch {
          // ignore fallback
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tracker.')
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg, selected?.jc_number])

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
    {
      title: 'Reception & Job Card Opened',
      desc: 'Vehicle checked in at workshop · Initial inspection completed',
      completed: true,
      icon: '📥',
    },
    {
      title: 'Advisor Inspection & Estimate',
      desc: 'Job card created and itemized estimate generated',
      completed: estimateIssued,
      icon: '📋',
    },
    {
      title: 'Workshop & Repairs',
      desc: techInfo
        ? `Technician ${techInfo.name} working${techInfo.bay_no ? ` in Bay ${techInfo.bay_no}` : ''}`
        : 'Technicians working on repairs & parts replacement',
      completed: invoiced || currentStage >= 11,
      current: !invoiced && Boolean(jc),
      icon: '🔧',
    },
    {
      title: 'Quality Check & Washing',
      desc: 'Final inspection, road test & vehicle cleanliness check',
      completed: qcDone,
      icon: '🔍',
    },
    {
      title: 'Invoiced & Gatepass Ready',
      desc: 'Bill settled & Gatepass released for customer delivery',
      completed: invoiced,
      icon: '✅',
    },
  ]

  const activeStage = selectedStageIndex !== null ? stages[selectedStageIndex] : null

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
          {/* Top Job Card & Live Status Card */}
          <CustomerCard style={{ borderLeftWidth: 4, borderLeftColor: '#2563eb' }}>
            <View className="flex-row justify-between items-center mb-2">
              <View>
                <Text className="text-slate-500 text-xs uppercase font-bold tracking-wider">Live Job Card</Text>
                <Text className="text-[17px] font-black font-mono text-slate-900 mt-0.5">
                  {jc ? `JC #${jc}` : 'Opening in progress'}
                </Text>
              </View>
              <View className="bg-emerald-100 px-3 py-1 rounded-full flex-row items-center gap-1">
                <View className="w-2 h-2 rounded-full bg-emerald-500" />
                <Text className="text-emerald-800 text-xs font-bold">In Workshop</Text>
              </View>
            </View>

            <View className="flex-row justify-between pt-2 border-t border-slate-100 mt-1">
              <View>
                <Text className="text-slate-400 text-[11px]">Service Advisor</Text>
                <Text className="font-bold text-slate-800 text-xs">{dash(advisor)}</Text>
              </View>
              {techInfo?.bay_no ? (
                <View className="items-end">
                  <Text className="text-slate-400 text-[11px]">Workshop Bay</Text>
                  <Text className="font-bold font-mono text-blue-700 text-xs">Bay {techInfo.bay_no}</Text>
                </View>
              ) : null}
            </View>
          </CustomerCard>

          {card ? (
            <CustomerCard style={{ borderLeftWidth: 4, borderLeftColor: '#7c3aed' }}>
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

          {/* Interactive Service Stages */}
          <CustomerCard>
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-[16px] font-bold">Service Stages</Text>
              <Text className="text-xs text-blue-600 font-semibold">Tap stage for details ➔</Text>
            </View>

            {stages.map((stage, index) => (
              <TouchableOpacity
                key={stage.title}
                onPress={() => setSelectedStageIndex(index)}
                activeOpacity={0.7}
                className="flex-row mb-4 p-2 rounded-xl active:bg-slate-50 border border-transparent active:border-slate-200"
              >
                <View
                  className={`h-9 w-9 rounded-full items-center justify-center mr-3 ${
                    stage.completed ? 'bg-green-600' : stage.current ? 'bg-amber-500' : 'bg-slate-200'
                  }`}
                >
                  <Text className={`font-bold text-xs ${stage.completed || stage.current ? 'text-white' : 'text-slate-600'}`}>
                    {stage.completed ? '✓' : stage.current ? '⏳' : String(index + 1)}
                  </Text>
                </View>
                <View className="flex-1 justify-center">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-bold text-slate-900 text-[14px]">{stage.title}</Text>
                    <Text className="text-[11px] font-bold text-slate-400">ℹ️</Text>
                  </View>
                  <Text className="text-[12px] text-slate-500 mt-0.5 leading-tight">{stage.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </CustomerCard>

          {/* Advisor Quick Contact Card */}
          <CustomerCard style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">📞</Text>
              <View className="flex-1">
                <Text className="text-[13.5px] font-bold text-green-800">Need an urgent update?</Text>
                <Text className="text-[12px] text-green-700">
                  Contact your Service Advisor: <Text className="font-bold">{dash(advisor)}</Text>
                </Text>
              </View>
            </View>
          </CustomerCard>

          {/* Stage Details Modal */}
          {activeStage && selectedStageIndex !== null && (
            <Modal
              visible={selectedStageIndex !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setSelectedStageIndex(null)}
            >
              <View className="flex-1 bg-black/70 justify-center items-center p-4">
                <View className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl">
                  {/* Header */}
                  <View className="flex-row justify-between items-center pb-3 border-b border-slate-100">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-2xl">{activeStage.icon}</Text>
                      <View>
                        <Text className="text-[10px] uppercase font-bold text-blue-600">
                          Stage {selectedStageIndex + 1} of {stages.length}
                        </Text>
                        <Text className="text-[15px] font-bold text-slate-900">{activeStage.title}</Text>
                      </View>
                    </View>
                    <View
                      className={`px-2.5 py-0.5 rounded-full ${
                        activeStage.completed
                          ? 'bg-green-100'
                          : activeStage.current
                          ? 'bg-amber-100'
                          : 'bg-slate-100'
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold uppercase ${
                          activeStage.completed
                            ? 'text-green-800'
                            : activeStage.current
                            ? 'text-amber-800'
                            : 'text-slate-600'
                        }`}
                      >
                        {activeStage.completed ? 'Completed' : activeStage.current ? 'Active Now' : 'Upcoming'}
                      </Text>
                    </View>
                  </View>

                  {/* Stage Description */}
                  <Text className="text-slate-600 text-xs leading-relaxed my-3 bg-slate-50 p-3 rounded-2xl">
                    {activeStage.desc}
                  </Text>

                  {/* Live Details Breakdown */}
                  <View className="bg-slate-50 rounded-2xl p-3.5 space-y-2 mb-4">
                    <View className="flex-row justify-between items-center py-1 border-b border-slate-200">
                      <Text className="text-slate-500 text-xs">📋 Job Card No</Text>
                      <Text className="font-bold font-mono text-slate-900 text-xs">{dash(jc)}</Text>
                    </View>

                    <View className="flex-row justify-between items-center py-1 border-b border-slate-200">
                      <Text className="text-slate-500 text-xs">👨‍💼 Service Advisor</Text>
                      <Text className="font-bold text-slate-900 text-xs">{dash(advisor)}</Text>
                    </View>

                    <View className="flex-row justify-between items-center py-1 border-b border-slate-200">
                      <Text className="text-slate-500 text-xs">🔧 Assigned Technician</Text>
                      <Text className="font-bold text-emerald-700 text-xs">
                        {techInfo?.name || (selectedStageIndex >= 2 ? 'In Floor Queue' : 'Assigned in repair stage')}
                      </Text>
                    </View>

                    <View className="flex-row justify-between items-center py-1 border-b border-slate-200">
                      <Text className="text-slate-500 text-xs">🏢 Workshop Bay</Text>
                      <Text className="font-bold font-mono text-blue-700 text-xs">
                        {techInfo?.bay_no ? `Bay ${techInfo.bay_no}` : selectedStageIndex >= 2 ? 'Allocating Bay...' : '—'}
                      </Text>
                    </View>

                    <View className="flex-row justify-between items-center py-1">
                      <Text className="text-slate-500 text-xs">⚡ Work Status</Text>
                      <Text className="font-bold text-slate-800 text-xs capitalize">
                        {techInfo?.work_status ? techInfo.work_status.replace(/_/g, ' ') : activeStage.completed ? 'Completed' : 'In Process'}
                      </Text>
                    </View>

                    {techInfo?.remark ? (
                      <View className="pt-1 border-t border-slate-200">
                        <Text className="text-slate-400 text-[10px]">Floor Incharge Remark:</Text>
                        <Text className="text-slate-700 text-[11px] italic mt-0.5">"{techInfo.remark}"</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Close Modal Button */}
                  <TouchableOpacity
                    onPress={() => setSelectedStageIndex(null)}
                    activeOpacity={0.8}
                    className="w-full py-3 bg-blue-600 rounded-2xl items-center"
                  >
                    <Text className="text-white font-bold text-xs">Close Details</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
        </>
      )}
    </CustomerScreen>
  )
}

