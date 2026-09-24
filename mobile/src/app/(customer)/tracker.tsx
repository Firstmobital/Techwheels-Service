import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, asText, dash, formatInr } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerGetActiveJob,
  customerGetRepairCard,
  customerOpenBodyshopEstimateDocument,
  parseBodyshopEstimateDocument,
} from '../../lib/api/customerPortal'
import { supabase } from '../../lib/supabase'
import { Icon } from '../../components/ui/Icon'
import { getBodyshopStageDetailRows } from '../../lib/customer/bodyshopStageDetails'

export const BODYSHOP_18_STAGES = [
  { stage: 1, name: '1. Vehicle Receiving', shortName: 'Vehicle Receiving', desc: 'Accident vehicle intake & initial workshop security check-in.', group: 'SA Intake' },
  { stage: 2, name: '2. Receiving Photos', shortName: 'Receiving Photos', desc: '360° accidental damage photos captured and archived for insurance claim.', group: 'SA Intake' },
  { stage: 3, name: '3. Job Card', shortName: 'Job Card', desc: 'Official bodyshop repair job card opened with initial complaint lines.', group: 'SA Intake' },
  { stage: 4, name: '4. Customer Group', shortName: 'Customer Group', desc: 'Dedicated WhatsApp progress update group created for vehicle repairs.', group: 'SA Intake' },
  { stage: 5, name: '5. Documentation', shortName: 'Documentation', desc: 'Claim form, DL, RC, Insurance Policy & KYC documents submitted.', group: 'SA Intake' },
  { stage: 6, name: '6. Estimation', shortName: 'Estimation', desc: 'Initial parts and labour repair cost estimation prepared.', group: 'SA Intake' },
  { stage: 7, name: '7. Estimation Approval', shortName: 'Estimation Approval', desc: 'Quotation verified by EDP & customer estimate approval confirmed.', group: 'EDP' },
  { stage: 8, name: '8. Claim Intimation', shortName: 'Claim Intimation', desc: 'Claim registered with insurance company & surveyor inspection assigned.', group: 'SA Intake' },
  { stage: 9, name: '9. Survey', shortName: 'Survey', desc: 'Physical inspection & initial loss assessment by insurance surveyor.', group: 'Survey' },
  { stage: 10, name: '10. Parts Status', shortName: 'Parts Status', desc: 'Required accidental body panels, lamps & replacement parts ordered/received.', group: 'Survey' },
  { stage: 11, name: '11. Floor Assignment', shortName: 'Floor Assignment', desc: 'Vehicle on bodyshop floor: Denting, pulling, panel beating & paint booth.', group: 'Floor Work' },
  { stage: 12, name: '12. Additional Approval', shortName: 'Additional Approval', desc: 'Supplementary estimate for hidden internal damages approved by surveyor.', group: 'Survey' },
  { stage: 13, name: '13. Quality Check', shortName: 'Quality Check', desc: 'Comprehensive panel gap, paint gloss & road-test quality audit.', group: 'QC' },
  { stage: 14, name: '14. Re-Inspection', shortName: 'Re-Inspection', desc: 'Surveyor final physical inspection & replaced parts salvage verification.', group: 'RI' },
  { stage: 15, name: '15. Billing', shortName: 'Billing', desc: 'Final repair tax invoice generated with insurance & customer breakup.', group: 'Billing' },
  { stage: 16, name: '16. DO Status', shortName: 'DO Status', desc: 'Official Delivery Order (DO) issued by insurance company.', group: 'Billing' },
  { stage: 17, name: '17. Delivery', shortName: 'Delivery', desc: 'Vehicle washed, polished & ready at delivery bay for customer handover.', group: 'Delivery' },
  { stage: 18, name: '18. Payment', shortName: 'Payment', desc: 'Insurance cashless settlement & customer deductible settled.', group: 'Delivery' },
]

export const STAGE_LABELS: Record<number, string> = {
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
  const router = useRouter()
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [card, setCard] = useState<Record<string, unknown> | null>(null)
  const [techInfo, setTechInfo] = useState<AllocatedTechnicianInfo | null>(null)
  const [selectedBodyshopStage, setSelectedBodyshopStage] = useState<(typeof BODYSHOP_18_STAGES)[0] | null>(null)
  const [selectedServiceStageIndex, setSelectedServiceStageIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingEstimateDoc, setOpeningEstimateDoc] = useState(false)

  const bodyshopEstimateDoc = parseBodyshopEstimateDocument(card)
  const showEstimateDocInStage =
    selectedBodyshopStage?.stage === 6 || selectedBodyshopStage?.stage === 7

  const openWorkshopEstimateDoc = async () => {
    if (!token) return
    setOpeningEstimateDoc(true)
    try {
      await customerOpenBodyshopEstimateDocument(token, selectedReg, bodyshopEstimateDoc)
    } catch (err) {
      Alert.alert(
        'Estimate document',
        err instanceof Error ? err.message : 'Unable to open workshop estimate.'
      )
    } finally {
      setOpeningEstimateDoc(false)
    }
  }

  const load = useCallback(async (isInitial = false) => {
    if (!token) return
    if (isInitial && !job && !card) {
      setLoading(true)
    }
    try {
      const [jobResult, repair] = await Promise.all([
        customerGetActiveJob(token, selectedReg).catch(() => ({ job: null })),
        customerGetRepairCard(token, selectedReg).catch(() => null),
      ])
      const activeJob = jobResult.job
      if (activeJob) {
        setJob(activeJob)
        setError(null)
      }
      if (repair) setCard(repair)

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
      if (!job && !card) {
        setError(err instanceof Error ? err.message : 'Unable to load tracker.')
      }
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg, selected?.jc_number, job, card])

  useFocusEffect(
    useCallback(() => {
      void load(false)
    }, [load])
  )

  const invoiced = Boolean(job?.invoice_done_at || selected?.invoice_done_at)
  const jc = asText(job?.jc_number) || asText(selected?.jc_number)
  const estimateIssued = Boolean(job?.estimate_drive_url || job?.estimate_storage_path || jc)
  const advisor = asText(job?.sa_display_name) || asText(job?.sa_name) || asText(selected?.sa_display_name) || asText(selected?.sa_name)
  const qcDone = String(card?.qc_status || '').toLowerCase() === 'pass' || invoiced

  const activeStageDetailRows = useMemo(() => {
    if (!selectedBodyshopStage) return []
    return getBodyshopStageDetailRows(selectedBodyshopStage.stage, card, {
      jc: asText(job?.jc_number) || asText(selected?.jc_number) || asText(card?.job_card_no) || undefined,
      advisor: advisor || undefined,
      techBay: techInfo?.bay_no ? `Bay ${techInfo.bay_no}` : null,
      techName: techInfo?.name ?? null,
    })
  }, [selectedBodyshopStage, card, job?.jc_number, selected?.jc_number, advisor, techInfo])

  // Determine if this is an accident / bodyshop vehicle
  const isAccident =
    Boolean(card) ||
    String(job?.service_type || '').toLowerCase().includes('accident') ||
    String(selected?.service_type || '').toLowerCase().includes('accident') ||
    String(card?.service_type || '').toLowerCase().includes('accident')

  // Calculate current stage for bodyshop (defaults to 9 - Survey if card stage is 0 but active, or 1 if new)
  const currentBodyshopStage = Number(card?.current_stage || (invoiced ? 18 : jc ? 9 : 1))
  const currentStageName = asText(card?.current_stage_name) || STAGE_LABELS[currentBodyshopStage] || `Stage ${currentBodyshopStage}`

  // 18 Bodyshop Stages State
  const completedBodyshopCount = BODYSHOP_18_STAGES.filter((s) => {
    if (invoiced || card?.overall_status === 'delivered') return true
    return s.stage < currentBodyshopStage
  }).length

  const bodyshopProgressPercent = Math.round((completedBodyshopCount / 18) * 100)

  // Standard 6 Service Stages (for non-accident maintenance vehicles)
  const standardStages = [
    {
      title: 'Vehicle Received & Group Created',
      desc: 'Vehicle safely checked into workshop and registered on floor',
      completed: Boolean(selected?.created_at || jc),
      icon: '🚗',
    },
    {
      title: 'Job Card & Documentation',
      desc: advisor ? `Assigned SA: ${advisor}` : 'Service Advisor assigned and initial inspection',
      completed: Boolean(jc),
      icon: '📋',
    },
    {
      title: 'Digital Estimate & Approval',
      desc: estimateIssued ? 'Digital quotation prepared' : 'Awaiting parts & labour estimation',
      completed: estimateIssued,
      icon: '💰',
    },
    {
      title: 'Workshop Bay Repair',
      desc: techInfo?.name ? `Technician: ${techInfo.name} · Bay: ${techInfo.bay_no || 'Assigned'}` : 'Repairs in progress by certified workshop technicians',
      completed: invoiced,
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

  const activeStandardStage = selectedServiceStageIndex !== null ? standardStages[selectedServiceStageIndex] : null

  return (
    <CustomerScreen
      title={isAccident ? 'Bodyshop Tracker' : 'Live Repair Tracker'}
      subtitle={
        isAccident
          ? `18-Stage Live Accident Repair & Insurance Tracking for ${selected?.reg_number || 'your vehicle'}`
          : `Real-time repair and service stages for ${selected?.reg_number || 'your vehicle'}`
      }
    >
      {error && !job && !card ? <CustomerToast ok={false} message={error} /> : null}
      {loading && !job && !card ? (
        <ActivityIndicator color="#2563eb" className="py-8" />
      ) : (
        <>
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* ── CASE 1: ACCIDENT / BODYSHOP VEHICLE (18 STAGES VIEW) ─────────── */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {isAccident ? (
            <>
              {/* Top Bodyshop Status Banner */}
              <CustomerCard style={{ borderColor: '#e2e8f0', padding: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <View>
                    <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Received
                    </Text>
                    <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '800', marginTop: 2 }}>
                      {card?.received_at
                        ? new Date(card.received_at as string).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Active in Workshop'}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Status
                    </Text>
                    <View
                      style={{
                        marginTop: 2,
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderRadius: 8,
                        backgroundColor: card?.overall_status === 'delivered' ? '#dcfce7' : '#eff6ff',
                        borderColor: card?.overall_status === 'delivered' ? '#86efac' : '#bfdbfe',
                        borderWidth: 1,
                      }}
                    >
                      <Text
                        style={{
                          color: card?.overall_status === 'delivered' ? '#166534' : '#1d4ed8',
                          fontSize: 11.5,
                          fontWeight: '900',
                          textTransform: 'uppercase',
                        }}
                      >
                        {String(card?.overall_status || 'active')}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Current Stage Highlight Box */}
                <View
                  style={{
                    backgroundColor: '#faf5ff',
                    borderColor: '#e9d5ff',
                    borderWidth: 1.5,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ color: '#7e22ce', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Current Stage
                  </Text>
                  <Text style={{ color: '#9333ea', fontSize: 19, fontWeight: '900', marginTop: 3 }}>
                    Stage {currentBodyshopStage} – {currentStageName}
                  </Text>
                  <Text style={{ color: '#6b21a8', fontSize: 11.5, marginTop: 4, fontWeight: '500' }}>
                    {BODYSHOP_18_STAGES[currentBodyshopStage - 1]?.desc || 'Repairs and inspection proceeding on workshop floor.'}
                  </Text>
                </View>

                {/* Progress Bar */}
                <View style={{ marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ color: '#334155', fontSize: 12, fontWeight: '800' }}>
                      Bodyshop Progress
                    </Text>
                    <Text style={{ color: '#7c3aed', fontSize: 12, fontWeight: '900' }}>
                      {completedBodyshopCount} / 18 Completed ({bodyshopProgressPercent}%)
                    </Text>
                  </View>
                  <View style={{ width: '100%', height: 7, backgroundColor: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${Math.max(5, bodyshopProgressPercent)}%`,
                        height: '100%',
                        backgroundColor: bodyshopProgressPercent === 100 ? '#10b981' : '#8b5cf6',
                        borderRadius: 999,
                      }}
                    />
                  </View>
                </View>
              </CustomerCard>

              {/* ── 18 STAGES 2-COLUMN WORKFLOW GRID (MATCHING SCREENSHOT) ── */}
              <CustomerCard style={{ borderColor: '#e2e8f0' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    18 Bodyshop Repair Stages
                  </Text>
                  <Text style={{ color: '#6366f1', fontSize: 11, fontWeight: '700' }}>
                    Tap stage for details ➔
                  </Text>
                </View>

                {/* 2-Column Responsive Flow */}
                <View style={{ gap: 8 }}>
                  {Array.from({ length: 9 }).map((_, pairIdx) => {
                    const leftStage = BODYSHOP_18_STAGES[pairIdx * 2]
                    const rightStage = BODYSHOP_18_STAGES[pairIdx * 2 + 1]

                    const isLeftDone = invoiced || card?.overall_status === 'delivered' || leftStage.stage < currentBodyshopStage
                    const isLeftCurrent = !isLeftDone && leftStage.stage === currentBodyshopStage

                    const isRightDone = invoiced || card?.overall_status === 'delivered' || rightStage.stage < currentBodyshopStage
                    const isRightCurrent = !isRightDone && rightStage.stage === currentBodyshopStage

                    return (
                      <View key={pairIdx} style={{ flexDirection: 'row', gap: 8 }}>
                        {/* Left Stage Pill */}
                        <TouchableOpacity
                          onPress={() => setSelectedBodyshopStage(leftStage)}
                          activeOpacity={0.75}
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 10,
                            paddingHorizontal: 10,
                            borderRadius: 12,
                            backgroundColor: isLeftCurrent
                              ? '#faf5ff'
                              : isLeftDone
                              ? '#f0fdf4'
                              : '#f8fafc',
                            borderColor: isLeftCurrent
                              ? '#c084fc'
                              : isLeftDone
                              ? '#bbf7d0'
                              : '#e2e8f0',
                            borderWidth: isLeftCurrent ? 2 : 1,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 4 }}>
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: isLeftCurrent
                                  ? '#9333ea'
                                  : isLeftDone
                                  ? '#16a34a'
                                  : '#cbd5e1',
                              }}
                            />
                            <Text
                              style={{
                                fontSize: 11.5,
                                fontWeight: isLeftCurrent || isLeftDone ? '800' : '600',
                                color: isLeftCurrent
                                  ? '#7e22ce'
                                  : isLeftDone
                                  ? '#15803d'
                                  : '#64748b',
                              }}
                              numberOfLines={1}
                            >
                              {leftStage.name}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '900',
                              color: isLeftCurrent
                                ? '#7e22ce'
                                : isLeftDone
                                ? '#16a34a'
                                : '#94a3b8',
                            }}
                          >
                            {isLeftDone ? '✓' : isLeftCurrent ? '--' : '○'}
                          </Text>
                        </TouchableOpacity>

                        {/* Right Stage Pill */}
                        <TouchableOpacity
                          onPress={() => setSelectedBodyshopStage(rightStage)}
                          activeOpacity={0.75}
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 10,
                            paddingHorizontal: 10,
                            borderRadius: 12,
                            backgroundColor: isRightCurrent
                              ? '#faf5ff'
                              : isRightDone
                              ? '#f0fdf4'
                              : '#f8fafc',
                            borderColor: isRightCurrent
                              ? '#c084fc'
                              : isRightDone
                              ? '#bbf7d0'
                              : '#e2e8f0',
                            borderWidth: isRightCurrent ? 2 : 1,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 4 }}>
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: isRightCurrent
                                  ? '#9333ea'
                                  : isRightDone
                                  ? '#16a34a'
                                  : '#cbd5e1',
                              }}
                            />
                            <Text
                              style={{
                                fontSize: 11.5,
                                fontWeight: isRightCurrent || isRightDone ? '800' : '600',
                                color: isRightCurrent
                                  ? '#7e22ce'
                                  : isRightDone
                                  ? '#15803d'
                                  : '#64748b',
                              }}
                              numberOfLines={1}
                            >
                              {rightStage.name}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '900',
                              color: isRightCurrent
                                ? '#7e22ce'
                                : isRightDone
                                ? '#16a34a'
                                : '#94a3b8',
                            }}
                          >
                            {isRightDone ? '✓' : isRightCurrent ? '--' : '○'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                </View>
              </CustomerCard>

              {/* Bodyshop Case Summary Details */}
              <CustomerCard style={{ borderColor: '#cbd5e1' }}>
                <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Accident Claim Details
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <View style={{ width: '50%', marginBottom: 10, paddingRight: 6 }}>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>Job Card No</Text>
                    <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '800', fontFamily: 'monospace' }}>
                      {dash(jc)}
                    </Text>
                  </View>
                  <View style={{ width: '50%', marginBottom: 10, paddingLeft: 6 }}>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>Claim Intimation No</Text>
                    <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '800', fontFamily: 'monospace' }}>
                      {dash(card?.claim_intimation_no)}
                    </Text>
                  </View>
                  <View style={{ width: '50%', marginBottom: 10, paddingRight: 6 }}>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>Insurance Company</Text>
                    <Text style={{ color: '#0f172a', fontSize: 12.5, fontWeight: '800' }}>
                      {dash(card?.insurance_company)}
                    </Text>
                  </View>
                  <View style={{ width: '50%', marginBottom: 10, paddingLeft: 6 }}>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>Surveyor Name</Text>
                    <Text style={{ color: '#0f172a', fontSize: 12.5, fontWeight: '800' }}>
                      {dash(card?.surveyor_name)}
                    </Text>
                  </View>
                  {card?.estimated_amount != null ? (
                    <View style={{ width: '50%', paddingRight: 6 }}>
                      <Text style={{ color: '#64748b', fontSize: 11 }}>Approved Estimate</Text>
                      <Text style={{ color: '#16a34a', fontSize: 13, fontWeight: '900' }}>
                        {formatInr(Number(card.estimated_amount))}
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ width: '50%', paddingLeft: 6 }}>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>Service Advisor</Text>
                    <Text style={{ color: '#0f172a', fontSize: 12.5, fontWeight: '800' }}>
                      {dash(advisor)}
                    </Text>
                  </View>
                </View>
              </CustomerCard>
            </>
          ) : (
            /* ═══════════════════════════════════════════════════════════════════ */
            /* ── CASE 2: REGULAR SERVICE (6 STAGES WORKSHOP TIMELINE) ─────────── */
            /* ═══════════════════════════════════════════════════════════════════ */
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

              {/* Interactive Standard Service Stages */}
              <CustomerCard>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-[16px] font-bold">Service Stages</Text>
                  <Text className="text-xs text-blue-600 font-semibold">Tap stage for details ➔</Text>
                </View>

                {standardStages.map((stage, index) => (
                  <TouchableOpacity
                    key={stage.title}
                    onPress={() => setSelectedServiceStageIndex(index)}
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
            </>
          )}

          {/* ── INSURANCE CLAIM DOCUMENTS SHORTCUT BANNER ── */}
          <CustomerCard style={{ backgroundColor: '#fffbeb', borderColor: '#fef3c7' }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 mr-2">
                <Text className="text-2xl mr-3">📁</Text>
                <View className="flex-1">
                  <Text className="text-[13.5px] font-bold text-amber-900">Insurance Claim Documents</Text>
                  <Text className="text-[11.5px] text-amber-800">
                    Upload DL, RC, Claim Form & KYC to speed up surveyor approval.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(customer)/documents')}
                activeOpacity={0.8}
                className="bg-amber-600 active:bg-amber-700 px-3 py-2 rounded-xl"
              >
                <Text className="text-white text-xs font-black">Upload ➔</Text>
              </TouchableOpacity>
            </View>
          </CustomerCard>

          {/* ── ADVISOR QUICK CONTACT CARD ── */}
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

          {/* ── BODYSHOP STAGE DETAIL MODAL ── */}
          {selectedBodyshopStage && (
            <Modal
              visible={Boolean(selectedBodyshopStage)}
              transparent
              animationType="fade"
              onRequestClose={() => setSelectedBodyshopStage(null)}
            >
              <View className="flex-1 bg-black/70 justify-center items-center p-4">
                <View className="w-full max-w-sm max-h-[88%] bg-white rounded-3xl p-5 shadow-2xl">
                  {/* Header */}
                  <View className="flex-row justify-between items-center pb-3 border-b border-slate-100">
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#f3e8ff' }}>
                          <Text style={{ color: '#7e22ce', fontSize: 10, fontWeight: '800' }}>
                            {selectedBodyshopStage.group}
                          </Text>
                        </View>
                        <Text className="text-[11px] uppercase font-bold text-slate-500">
                          Stage {selectedBodyshopStage.stage} of 18
                        </Text>
                      </View>
                      <Text className="text-[16px] font-black text-slate-900">{selectedBodyshopStage.name}</Text>
                    </View>
                    <View
                      className={`px-2.5 py-1 rounded-full ${
                        selectedBodyshopStage.stage < currentBodyshopStage || invoiced
                          ? 'bg-green-100'
                          : selectedBodyshopStage.stage === currentBodyshopStage
                          ? 'bg-purple-100'
                          : 'bg-slate-100'
                      }`}
                    >
                      <Text
                        className={`text-[10.5px] font-black uppercase ${
                          selectedBodyshopStage.stage < currentBodyshopStage || invoiced
                            ? 'text-green-800'
                            : selectedBodyshopStage.stage === currentBodyshopStage
                            ? 'text-purple-800'
                            : 'text-slate-600'
                        }`}
                      >
                        {selectedBodyshopStage.stage < currentBodyshopStage || invoiced
                          ? '✓ Done'
                          : selectedBodyshopStage.stage === currentBodyshopStage
                          ? '⏳ In Progress'
                          : 'Upcoming'}
                      </Text>
                    </View>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} className="max-h-[420px]">
                  <View className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 mb-3">
                    <Text className="text-slate-600 text-[10.5px] font-bold text-center">
                      Read-only · Live updates from your Service Advisor & workshop team
                    </Text>
                  </View>

                  {/* Stage Description */}
                  <Text className="text-slate-700 text-xs leading-relaxed my-3 bg-slate-50 p-3 rounded-2xl">
                    {selectedBodyshopStage.desc}
                  </Text>

                  {showEstimateDocInStage ? (
                    <View className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 mb-4">
                      <Text className="text-blue-900 text-xs font-black uppercase tracking-wide mb-1">
                        Workshop Estimate Upload
                      </Text>
                      {card?.estimated_amount != null ? (
                        <Text className="text-slate-800 text-sm font-bold mb-2">
                          Estimate amount: {formatInr(Number(card.estimated_amount))}
                        </Text>
                      ) : null}
                      {bodyshopEstimateDoc ? (
                        <>
                          <Text className="text-slate-600 text-[11.5px] mb-2" numberOfLines={2}>
                            {String(bodyshopEstimateDoc.file_name || 'Estimate document')} — uploaded by workshop
                          </Text>
                          <TouchableOpacity
                            onPress={() => void openWorkshopEstimateDoc()}
                            disabled={openingEstimateDoc}
                            activeOpacity={0.85}
                            className="bg-blue-600 rounded-xl py-2.5 items-center"
                          >
                            <Text className="text-white font-black text-xs">
                              {openingEstimateDoc ? 'Opening…' : '📄 View Workshop Estimate'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text className="text-slate-600 text-[11.5px]">
                          Workshop estimate document is not uploaded yet. Your Service Advisor will share it after
                          preparation.
                        </Text>
                      )}
                    </View>
                  ) : null}

                  <View className="bg-slate-50 rounded-2xl p-3.5 mb-4 border border-slate-200">
                    <Text className="text-slate-800 text-xs font-black uppercase tracking-wide mb-2">
                      Workshop stage details
                    </Text>
                    {activeStageDetailRows.map((row, idx) => (
                      <View
                        key={`${row.label}-${idx}`}
                        className={`py-2 ${idx < activeStageDetailRows.length - 1 ? 'border-b border-slate-200' : ''}`}
                      >
                        <Text className="text-slate-500 text-[11px] font-semibold mb-0.5">{row.label}</Text>
                        <Text
                          className="text-slate-900 text-xs font-bold leading-snug"
                          selectable
                        >
                          {row.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                  </ScrollView>

                  {/* Close Modal Button */}
                  <TouchableOpacity
                    onPress={() => setSelectedBodyshopStage(null)}
                    activeOpacity={0.8}
                    className="w-full py-3 bg-purple-600 rounded-2xl items-center mt-2"
                  >
                    <Text className="text-white font-bold text-xs">Close Details</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

          {/* ── STANDARD SERVICE STAGE DETAIL MODAL ── */}
          {activeStandardStage && selectedServiceStageIndex !== null && (
            <Modal
              visible={selectedServiceStageIndex !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setSelectedServiceStageIndex(null)}
            >
              <View className="flex-1 bg-black/70 justify-center items-center p-4">
                <View className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl">
                  {/* Header */}
                  <View className="flex-row justify-between items-center pb-3 border-b border-slate-100">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-2xl">{activeStandardStage.icon}</Text>
                      <View>
                        <Text className="text-[10px] uppercase font-bold text-blue-600">
                          Stage {selectedServiceStageIndex + 1} of {standardStages.length}
                        </Text>
                        <Text className="text-[15px] font-bold text-slate-900">{activeStandardStage.title}</Text>
                      </View>
                    </View>
                    <View
                      className={`px-2.5 py-0.5 rounded-full ${
                        activeStandardStage.completed
                          ? 'bg-green-100'
                          : activeStandardStage.current
                          ? 'bg-amber-100'
                          : 'bg-slate-100'
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold uppercase ${
                          activeStandardStage.completed
                            ? 'text-green-800'
                            : activeStandardStage.current
                            ? 'text-amber-800'
                            : 'text-slate-600'
                        }`}
                      >
                        {activeStandardStage.completed ? 'Completed' : activeStandardStage.current ? 'Active Now' : 'Upcoming'}
                      </Text>
                    </View>
                  </View>

                  {/* Stage Description */}
                  <Text className="text-slate-600 text-xs leading-relaxed my-3 bg-slate-50 p-3 rounded-2xl">
                    {activeStandardStage.desc}
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
                        {techInfo?.name || (selectedServiceStageIndex >= 2 ? 'In Floor Queue' : 'Assigned in repair stage')}
                      </Text>
                    </View>

                    <View className="flex-row justify-between items-center py-1 border-b border-slate-200">
                      <Text className="text-slate-500 text-xs">🏢 Workshop Bay</Text>
                      <Text className="font-bold font-mono text-blue-700 text-xs">
                        {techInfo?.bay_no ? `Bay ${techInfo.bay_no}` : selectedServiceStageIndex >= 2 ? 'Allocating Bay...' : '—'}
                      </Text>
                    </View>
                  </View>

                  {/* Close Modal Button */}
                  <TouchableOpacity
                    onPress={() => setSelectedServiceStageIndex(null)}
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
