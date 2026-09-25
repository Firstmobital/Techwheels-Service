import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import {
  CustomerCard,
  CustomerToast,
  HorizontalPhaseStepper,
  asText,
  dash,
  formatInr,
  type PhaseStepStatus,
} from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerGetActiveJob,
  customerGetRepairCard,
  customerGetBodyshopEstimateViewUrl,
  parseBodyshopEstimateDocument,
} from '../../lib/api/customerPortal'
import { supabase } from '../../lib/supabase'
import { Icon } from '../../components/ui/Icon'
import { getBodyshopStageDetailRows } from '../../lib/customer/bodyshopStageDetails'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { CustomerPrimaryActionCard } from '../../components/customer/CustomerPrimaryActionCard'

const BODYSHOP_JOURNEY_PHASES = [
  { phase: 1, title: 'Intake', from: 1, to: 4 },
  { phase: 2, title: 'Paperwork', from: 5, to: 8 },
  { phase: 3, title: 'Survey & parts', from: 9, to: 12 },
  { phase: 4, title: 'Workshop & QC', from: 13, to: 14 },
  { phase: 5, title: 'Billing & handover', from: 15, to: 18 },
] as const

type JourneyPhaseStatus = 'complete' | 'active' | 'upcoming'

function phaseStatus(from: number, to: number, current: number, allDone: boolean): JourneyPhaseStatus {
  if (allDone || current > to) return 'complete'
  if (current >= from && current <= to) return 'active'
  return 'upcoming'
}

function PhaseStatusBadge({ status }: { status: JourneyPhaseStatus }) {
  const styles =
    status === 'complete'
      ? { bg: '#DCFCE7', text: '#166534', label: 'Complete' }
      : status === 'active'
        ? { bg: CustomerTheme.tabActiveBg, text: CustomerTheme.primary, label: 'In progress' }
        : { bg: '#F1F5F9', text: CustomerTheme.inkMuted, label: 'Up next' }

  return (
    <View style={{ backgroundColor: styles.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: styles.text, fontSize: 10.5, fontWeight: '800' }}>{styles.label}</Text>
    </View>
  )
}

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
  const [estimatePreviewUri, setEstimatePreviewUri] = useState<string | null>(null)

  const bodyshopEstimateDoc = parseBodyshopEstimateDocument(card)
  const showEstimateDocInStage =
    selectedBodyshopStage?.stage === 6 || selectedBodyshopStage?.stage === 7

  const openWorkshopEstimateDoc = async () => {
    if (!token) return
    setOpeningEstimateDoc(true)
    try {
      const resolved = await customerGetBodyshopEstimateViewUrl(token, selectedReg, bodyshopEstimateDoc)
      if (resolved.isImage) {
        setEstimatePreviewUri(resolved.viewUrl)
        return
      }
      const canOpen = await Linking.canOpenURL(resolved.viewUrl)
      if (!canOpen) {
        throw new Error('Unable to open this document on your device.')
      }
      await Linking.openURL(resolved.viewUrl)
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

  const bodyshopPhaseStepper = useMemo(() => {
    const allDone = Boolean(invoiced || card?.overall_status === 'delivered')
    const shortLabels = ['Intake', 'Paperwork', 'Survey', 'Workshop', 'Handover']
    return BODYSHOP_JOURNEY_PHASES.map((phase, idx) => {
      const status = phaseStatus(phase.from, phase.to, currentBodyshopStage, allDone)
      return {
        label: shortLabels[idx] || phase.title,
        status: status as PhaseStepStatus,
      }
    })
  }, [card?.overall_status, currentBodyshopStage, invoiced])

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
      title={isAccident ? 'Repair journey' : 'Service journey'}
      subtitle={
        isAccident
          ? `18 workshop phases for ${selected?.reg_number || 'your vehicle'}`
          : `Live service phases for ${selected?.reg_number || 'your vehicle'}`
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

                <View style={{ marginBottom: 16 }}>
                  <HorizontalPhaseStepper steps={bodyshopPhaseStepper} />
                </View>

                {/* Current Stage Highlight Box */}
                <View
                  style={{
                    backgroundColor: CustomerTheme.primaryLight,
                    borderColor: 'rgba(0,82,155,0.2)',
                    borderWidth: 1.5,
                    borderRadius: CustomerTheme.radiusCard,
                    padding: 14,
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ color: CustomerTheme.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Current stage
                  </Text>
                  <Text style={{ color: CustomerTheme.navy, fontSize: 19, fontWeight: '900', marginTop: 3 }}>
                    Stage {currentBodyshopStage} – {currentStageName}
                  </Text>
                  <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11.5, marginTop: 4, fontWeight: '500' }}>
                    {BODYSHOP_18_STAGES[currentBodyshopStage - 1]?.desc || 'Repairs and inspection proceeding on workshop floor.'}
                  </Text>
                </View>

                {/* Progress Bar */}
                <View style={{ marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ color: CustomerTheme.ink, fontSize: 12, fontWeight: '800' }}>
                      Bodyshop progress
                    </Text>
                    <Text style={{ color: CustomerTheme.primary, fontSize: 12, fontWeight: '900' }}>
                      {completedBodyshopCount} / 18 completed ({bodyshopProgressPercent}%)
                    </Text>
                  </View>
                  <View style={{ width: '100%', height: 7, backgroundColor: CustomerTheme.primaryLight, borderRadius: 999, overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${Math.max(5, bodyshopProgressPercent)}%`,
                        height: '100%',
                        backgroundColor: bodyshopProgressPercent === 100 ? CustomerTheme.success : CustomerTheme.primary,
                        borderRadius: 999,
                      }}
                    />
                  </View>
                </View>
              </CustomerCard>

              {/* ── Vertical repair journey (column timeline) ── */}
              <CustomerCard style={{ borderColor: CustomerTheme.border }}>
                <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                  ORDER JOURNEY
                </Text>
                <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900', marginBottom: 14 }}>
                  Tap any step for workshop details
                </Text>

                {BODYSHOP_JOURNEY_PHASES.map((phaseBlock) => {
                  const status = phaseStatus(
                    phaseBlock.from,
                    phaseBlock.to,
                    currentBodyshopStage,
                    Boolean(invoiced || card?.overall_status === 'delivered')
                  )
                  const steps = BODYSHOP_18_STAGES.filter(
                    (s) => s.stage >= phaseBlock.from && s.stage <= phaseBlock.to
                  )

                  return (
                    <View
                      key={phaseBlock.phase}
                      style={{
                        marginBottom: 16,
                        padding: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: CustomerTheme.border,
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={{ color: CustomerTheme.ink, fontSize: 12, fontWeight: '900', flex: 1, paddingRight: 8 }}>
                          PHASE {phaseBlock.phase} OF {BODYSHOP_JOURNEY_PHASES.length}: {phaseBlock.title}
                        </Text>
                        <PhaseStatusBadge status={status} />
                      </View>

                      {steps.map((step, stepIdx) => {
                        const isDone =
                          invoiced || card?.overall_status === 'delivered' || step.stage < currentBodyshopStage
                        const isCurrent = !isDone && step.stage === currentBodyshopStage
                        const isLast = stepIdx === steps.length - 1
                        const lineColor = isDone ? CustomerTheme.success : CustomerTheme.border

                        return (
                          <TouchableOpacity
                            key={step.stage}
                            onPress={() => setSelectedBodyshopStage(step)}
                            activeOpacity={0.75}
                            style={{ flexDirection: 'row', minHeight: 56 }}
                          >
                            <View style={{ width: 28, alignItems: 'center' }}>
                              <View
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 11,
                                  borderWidth: 2,
                                  borderColor: isDone
                                    ? CustomerTheme.success
                                    : isCurrent
                                      ? CustomerTheme.primary
                                      : CustomerTheme.border,
                                  backgroundColor: isDone ? CustomerTheme.success : isCurrent ? '#FFFFFF' : '#FFFFFF',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {isDone ? (
                                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text>
                                ) : isCurrent ? (
                                  <View
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: 4,
                                      backgroundColor: CustomerTheme.primary,
                                    }}
                                  />
                                ) : null}
                              </View>
                              {!isLast ? (
                                <View style={{ flex: 1, width: 2, backgroundColor: lineColor, marginVertical: 2 }} />
                              ) : null}
                            </View>

                            <View style={{ flex: 1, paddingBottom: isLast ? 0 : 12, paddingLeft: 4 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text
                                  style={{
                                    color: CustomerTheme.ink,
                                    fontSize: 14,
                                    fontWeight: isCurrent ? '900' : '700',
                                    flex: 1,
                                    paddingRight: 6,
                                  }}
                                >
                                  {step.shortName}
                                </Text>
                                {isCurrent ? (
                                  <Text style={{ color: CustomerTheme.primary, fontSize: 16, fontWeight: '700' }}>›</Text>
                                ) : null}
                              </View>
                              <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11.5, marginTop: 3, lineHeight: 16 }}>
                                {step.desc}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  )
                })}
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

              {/* Service journey — vertical column timeline */}
              <CustomerCard style={{ borderColor: CustomerTheme.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900' }}>Service journey</Text>
                  <PhaseStatusBadge
                    status={
                      invoiced
                        ? 'complete'
                        : standardStages.some((s) => s.current)
                          ? 'active'
                          : standardStages.every((s) => s.completed)
                            ? 'complete'
                            : 'active'
                    }
                  />
                </View>

                {standardStages.map((stage, index) => {
                  const isLast = index === standardStages.length - 1
                  const lineColor = stage.completed ? CustomerTheme.success : CustomerTheme.border
                  return (
                    <TouchableOpacity
                      key={stage.title}
                      onPress={() => setSelectedServiceStageIndex(index)}
                      activeOpacity={0.75}
                      style={{ flexDirection: 'row', minHeight: 58 }}
                    >
                      <View style={{ width: 28, alignItems: 'center' }}>
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: stage.completed
                              ? CustomerTheme.success
                              : stage.current
                                ? CustomerTheme.primary
                                : CustomerTheme.border,
                            backgroundColor: stage.completed ? CustomerTheme.success : '#fff',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {stage.completed ? (
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text>
                          ) : stage.current ? (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: CustomerTheme.primary,
                              }}
                            />
                          ) : null}
                        </View>
                        {!isLast ? (
                          <View style={{ flex: 1, width: 2, backgroundColor: lineColor, marginVertical: 2 }} />
                        ) : null}
                      </View>
                      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 14, paddingLeft: 4 }}>
                        <Text style={{ color: CustomerTheme.ink, fontSize: 14, fontWeight: stage.current ? '900' : '700' }}>
                          {stage.title}
                        </Text>
                        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11.5, marginTop: 3, lineHeight: 16 }}>
                          {stage.desc}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </CustomerCard>
            </>
          )}

          <CustomerPrimaryActionCard />

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
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: CustomerTheme.primaryLight }}>
                          <Text style={{ color: CustomerTheme.primary, fontSize: 10, fontWeight: '800' }}>
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
                          ? 'bg-sky-100'
                          : 'bg-slate-100'
                      }`}
                    >
                      <Text
                        className={`text-[10.5px] font-black uppercase ${
                          selectedBodyshopStage.stage < currentBodyshopStage || invoiced
                            ? 'text-green-800'
                            : selectedBodyshopStage.stage === currentBodyshopStage
                            ? 'text-sky-900'
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
                    className="w-full py-3 rounded-2xl items-center mt-2"
                    style={{ backgroundColor: CustomerTheme.primary }}
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

      <Modal
        visible={Boolean(estimatePreviewUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setEstimatePreviewUri(null)}
      >
        <View className="flex-1 bg-black/92 items-center justify-center p-4">
          <TouchableOpacity
            onPress={() => setEstimatePreviewUri(null)}
            className="absolute top-12 right-6 w-10 h-10 rounded-full bg-white/20 items-center justify-center z-50"
          >
            <Text className="text-white font-black text-lg">×</Text>
          </TouchableOpacity>
          {estimatePreviewUri ? (
            <Image
              source={{ uri: estimatePreviewUri }}
              style={{ width: '100%', height: '82%' }}
              resizeMode="contain"
            />
          ) : null}
          <Text className="text-white/80 text-xs font-semibold mt-3 text-center">
            Workshop estimate · pinch to zoom if supported
          </Text>
        </View>
      </Modal>
    </CustomerScreen>
  )
}
