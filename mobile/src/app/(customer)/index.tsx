import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import {
  CustomerCard,
  RecordRow,
  asText,
  dash,
  formatKm,
  getDirectAdvisorOrWorkshopPhone,
  pickAdvisorPhone,
} from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerGetActiveJob,
  customerGetGatePass,
  customerGetSettlement,
} from '../../lib/api/customerPortal'
import { computeSettlement } from '../../lib/customer/math'
import { manualCheckForOTAUpdate } from '../../hooks/useMandatoryOTAUpdate'
import { Icon, IconName } from '../../components/ui/Icon'

export default function CustomerDashboardScreen() {
  const router = useRouter()
  const { token, vehicles, selectedReg } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [settlement, setSettlement] = useState<Record<string, unknown> | null>(null)
  const [gatePass, setGatePass] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStageIndex, setActiveStageIndex] = useState<number | null>(null)
  const [showTrackerDetails, setShowTrackerDetails] = useState<boolean>(false)
  const [checkingOta, setCheckingOta] = useState(false)
  const [otaStatusText, setOtaStatusText] = useState<string | null>(null)

  const handleManualOtaUpdate = async () => {
    setCheckingOta(true)
    setOtaStatusText('Checking for updates…')
    try {
      const res = await manualCheckForOTAUpdate((msg) => setOtaStatusText(msg))
      if (res.isAvailable) {
        Alert.alert('🚀 Update Installed', 'The app has been updated and is restarting now!')
      } else {
        Alert.alert('App Update Status', res.message || 'You have the latest version of the app.')
      }
    } catch (e: any) {
      Alert.alert('Update Error', e?.message || 'Could not verify update status. Check your connection.')
    } finally {
      setCheckingOta(false)
      setOtaStatusText(null)
    }
  }

  const load = useCallback(async (isInitial = false) => {
    if (!token) return
    if (isInitial && !job && !selected) {
      setLoading(true)
    }
    try {
      const [jobResult, payResult, passResult] = await Promise.all([
        customerGetActiveJob(token, selected?.reg_number).catch((err) => ({
          job: null,
          error: err instanceof Error ? err.message : 'Unable to load job.',
        })),
        customerGetSettlement(token, selected?.reg_number).catch(() => null),
        customerGetGatePass(token, selected?.reg_number).catch(() => null),
      ])
      if (jobResult.job) {
        setJob(jobResult.job)
        setError(null)
      } else if (!job && !selected && 'error' in jobResult && jobResult.error) {
        setError(String(jobResult.error))
      }
      if (payResult) setSettlement(payResult)
      if (passResult) setGatePass(passResult)
    } catch (err) {
      if (!job && !selected) {
        setError(err instanceof Error ? err.message : 'Unable to load job.')
      }
    } finally {
      setLoading(false)
    }
  }, [token, selected?.reg_number, job, selected])

  // Fast & smooth 3.5s background auto-refresh without UI flicker
  useFocusEffect(
    useCallback(() => {
      void load(false)
      const timer = setInterval(() => {
        void load(false)
      }, 3500)
      return () => clearInterval(timer)
    }, [load])
  )

  useEffect(() => {
    void load(true)
  }, [load])

  const model = asText(job?.model) || asText(selected?.model)
  const variant = asText(job?.variant) || asText(selected?.variant)
  const owner = asText(job?.owner_name) || asText(selected?.owner_name)
  const km = formatKm(job?.km_reading ?? selected?.km_reading)
  const serviceType = asText(job?.service_type) || asText(selected?.service_type)
  const advisor = asText(job?.sa_display_name) || asText(job?.sa_name) || asText(selected?.sa_display_name) || asText(selected?.sa_name)
  const technician = asText(job?.technician_name)
  const bayNo = asText(job?.bay_no)
  const jc = asText(job?.jc_number) || asText(selected?.jc_number)
  const branch = asText(job?.branch) || asText(selected?.branch)
  const delivered = Boolean(job?.invoice_done_at || selected?.invoice_done_at)
  const pay = computeSettlement({
    billed: settlement?.total_billed ?? settlement?.billed_amount ?? job?.billed_amount ?? selected?.billed_amount,
    received: settlement?.amount_received ?? job?.amount_received ?? selected?.amount_received,
  })
  const advisorPhone = pickAdvisorPhone(job) || pickAdvisorPhone(selected as unknown as Record<string, unknown>)

  // 5 Service Stages for Clean Live Tracker
  const currentStageIndex = delivered ? 4 : job?.technician_name ? 3 : job?.estimate_done_at ? 2 : jc ? 1 : 0

  const trackerStages: { title: string; icon: IconName; desc: string }[] = [
    { title: 'Intake', icon: 'arrow-down', desc: 'Vehicle check-in & initial inspection' },
    { title: 'Job Card', icon: 'file-text', desc: `Assigned SA: ${advisor || 'Service Advisor'} · JC #${jc || 'Pending'}` },
    { title: 'Quote', icon: 'file', desc: 'Itemized parts & labour quotation' },
    { title: 'Bay Work', icon: 'sliders', desc: `Technician: ${technician || 'Assigned'} · Bay ${bayNo || 'Floor'}` },
    { title: 'Ready', icon: 'check-circle', desc: 'Repairs completed & tested for delivery' },
  ]

  return (
    <CustomerScreen title="" subtitle="">
      {loading && !selected ? (
        <ActivityIndicator color="#1e60ff" className="py-8" />
      ) : error ? (
        <Text className="text-red-600 font-bold text-center py-4">{error}</Text>
      ) : !selected ? (
        <Text className="text-slate-600 text-center py-4">No vehicle found for this mobile number.</Text>
      ) : (
        <>
          {/* ── GATE PASS UNLOCKED / READY BANNER ── */}
          {gatePass && gatePass.gate_pass_no ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/(customer)/gatepass')}
              className="bg-emerald-600 rounded-2xl p-4 mb-3.5 shadow-lg border border-emerald-400/40 flex-row items-center justify-between"
            >
              <View className="flex-row items-center gap-3 flex-1 pr-2">
                <View className="w-10 h-10 rounded-xl bg-white/20 items-center justify-center">
                  <Icon name="shield-check" size={22} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-emerald-100 text-[10px] font-black uppercase tracking-wider">
                      Official Departure Pass Issued
                    </Text>
                    <View className="w-2 h-2 rounded-full bg-white" />
                  </View>
                  <Text className="text-white text-[15px] font-black" numberOfLines={1}>
                    Gate Pass #{asText(gatePass.gate_pass_no)} Ready
                  </Text>
                  <Text className="text-emerald-100 text-[11.5px] font-medium mt-0.5" numberOfLines={1}>
                    Authorized by Accounts · Tap to View Pass
                  </Text>
                </View>
              </View>
              <View className="bg-white px-3 py-1.5 rounded-xl shadow-xs">
                <Text className="text-emerald-800 text-xs font-black">View Pass ➔</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* ── REGISTERED VEHICLE HERO CARD ── */}
          <LinearGradient
            colors={['#0f172a', '#1e293b', '#1e3a8a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 22,
              padding: 18,
              marginBottom: 16,
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.22,
              shadowRadius: 14,
              elevation: 5,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Icon name="truck" size={13} color="#60a5fa" strokeWidth={2.2} />
                  <Text style={{ color: '#93c5fd', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>
                    REGISTERED VEHICLE
                  </Text>
                </View>
                <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '900', letterSpacing: 1.5, fontFamily: 'monospace' }}>
                  {selected.reg_number}
                </Text>
                <Text style={{ color: '#ffffff', fontSize: 14.5, fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
                  {model || 'Tata Vehicle'}
                  {variant ? ` · ${variant}` : ''}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 6, maxWidth: '48%' }}>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4.5,
                    borderRadius: 999,
                    backgroundColor: delivered ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)',
                    borderWidth: 1.2,
                    borderColor: delivered ? '#34d399' : '#fbbf24',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: delivered ? '#34d399' : '#fbbf24',
                      marginRight: 5,
                    }}
                  />
                  <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }} numberOfLines={1}>
                    {delivered ? 'Delivered / Ready' : 'In Service'}
                  </Text>
                </View>

                {jc ? (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: '900', fontSize: 10 }} numberOfLines={1}>
                      JC #{jc.length > 16 ? jc.slice(-12) : jc}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Quick Metrics Grid */}
            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', flexDirection: 'row', flexWrap: 'wrap' }}>
              <View style={{ width: '50%', paddingRight: 8, marginBottom: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Customer Name</Text>
                <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' }} numberOfLines={1}>{dash(owner)}</Text>
              </View>
              <View style={{ width: '50%', paddingLeft: 8, marginBottom: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Odometer</Text>
                <Text style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace', fontWeight: '800' }} numberOfLines={1}>{km || '—'}</Text>
              </View>
              <View style={{ width: '50%', paddingRight: 8, marginBottom: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Assigned Technician</Text>
                <Text style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '800' }} numberOfLines={1}>{dash(technician)}</Text>
              </View>
              <View style={{ width: '50%', paddingLeft: 8, marginBottom: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Workshop Bay No</Text>
                <Text style={{ color: '#34d399', fontSize: 12.5, fontFamily: 'monospace', fontWeight: '900' }} numberOfLines={1}>{dash(bayNo) || 'Floor Bay'}</Text>
              </View>
              <View style={{ width: '50%', paddingRight: 8, marginBottom: 2 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Service Type</Text>
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }} numberOfLines={1}>{dash(serviceType)}</Text>
              </View>
              <View style={{ width: '50%', paddingLeft: 8, marginBottom: 2 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Assigned Advisor</Text>
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }} numberOfLines={1}>{dash(advisor)}</Text>
              </View>
            </View>

            {/* Direct Call Advisor Action */}
            <TouchableOpacity
              onPress={() => void Linking.openURL(`tel:${getDirectAdvisorOrWorkshopPhone(job || (selected as unknown as Record<string, unknown>))}`)}
              activeOpacity={0.85}
              className="mt-3 bg-emerald-600 active:bg-emerald-700 rounded-xl py-2 px-3.5 flex-row items-center justify-between shadow-sm"
            >
              <View className="flex-row items-center gap-2 flex-1 pr-2">
                <Icon name="phone" size={14} color="#ffffff" />
                <Text className="text-white text-xs font-black flex-1" numberOfLines={1} ellipsizeMode="tail">
                  Call Advisor: {dash(advisor)} ({getDirectAdvisorOrWorkshopPhone(job || (selected as unknown as Record<string, unknown>))})
                </Text>
              </View>
              <View className="bg-white/20 px-2.5 py-0.5 rounded-full shrink-0">
                <Text className="text-white text-[10.5px] font-black">Call Now</Text>
              </View>
            </TouchableOpacity>
          </LinearGradient>

          {/* ── PRIMARY BOOK SERVICE CTA ── */}
          <TouchableOpacity
            onPress={() => router.push('/(customer)/booking')}
            activeOpacity={0.88}
            style={{
              backgroundColor: '#2563eb',
              borderRadius: 18,
              paddingVertical: 14,
              paddingHorizontal: 16,
              marginBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.28,
              shadowRadius: 10,
              elevation: 4,
            }}
          >
            <View className="flex-row items-center gap-3 flex-1 pr-2">
              <View className="w-10 h-10 rounded-xl bg-white/20 items-center justify-center shrink-0">
                <Icon name="calendar" size={20} color="#ffffff" strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text className="text-white text-[15px] font-black tracking-tight" numberOfLines={1}>
                  Book Service Appointment
                </Text>
                <Text className="text-blue-100 text-[11.5px]" numberOfLines={1} ellipsizeMode="tail">
                  Schedule maintenance, repair or pickup
                </Text>
              </View>
            </View>
            <View className="bg-white px-3 py-1.5 rounded-xl shadow-xs shrink-0">
              <Text className="text-blue-700 font-black text-xs">Book ➔</Text>
            </View>
          </TouchableOpacity>

          {/* ── LIVE REPAIR TRACKER (INLINE DETAILS ACCORDION) ── */}
          {(() => {
            const effectiveStage = activeStageIndex !== null ? activeStageIndex : currentStageIndex
            return (
              <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-sm overflow-hidden">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center gap-2">
                    <View className="w-8 h-8 rounded-lg bg-blue-50 items-center justify-center">
                      <Icon name="clock" size={16} color="#1e60ff" />
                    </View>
                    <View>
                      <Text className="text-slate-900 text-[14px] font-black tracking-tight">
                        Live Workshop Repair Tracker
                      </Text>
                      <Text className="text-slate-500 text-[11px] font-medium">Tap stage for live bay details</Text>
                    </View>
                  </View>
                  <View className="bg-blue-600 px-2.5 py-1 rounded-full flex-row items-center gap-1.5">
                    <View className="w-1.5 h-1.5 bg-emerald-300 rounded-full" />
                    <Text className="text-white text-[10px] font-black">
                      {trackerStages[currentStageIndex].title}
                    </Text>
                  </View>
                </View>

                {/* Clean Progress Track Bar */}
                <View className="my-3 relative">
                  {/* Background Track Line */}
                  <View className="h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                    <View
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${((currentStageIndex + 1) / trackerStages.length) * 100}%` }}
                    />
                  </View>

                  {/* 5 Stage Node Icons */}
                  <View className="flex-row justify-between -mt-3 px-1">
                    {trackerStages.map((stg, idx) => {
                      const isDone = idx <= currentStageIndex
                      const isCurrent = idx === currentStageIndex
                      const isSelected = effectiveStage === idx
                      return (
                        <TouchableOpacity
                          key={stg.title}
                          onPress={() => {
                            setActiveStageIndex(idx)
                            setShowTrackerDetails(true)
                          }}
                          activeOpacity={0.7}
                          className="items-center w-12"
                        >
                          <View
                            className={`w-7 h-7 rounded-full items-center justify-center border-2 ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 shadow-md'
                                : isDone
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'bg-white border-slate-300'
                            }`}
                          >
                            <Icon
                              name={isDone && !isCurrent && !isSelected ? 'check' : stg.icon}
                              size={12}
                              color={isDone || isCurrent || isSelected ? '#ffffff' : '#94a3b8'}
                              strokeWidth={2.5}
                            />
                          </View>
                          <Text
                            className={`text-[9.5px] mt-1 text-center font-bold ${
                              isSelected ? 'text-blue-700 font-black' : isDone ? 'text-slate-800' : 'text-slate-400'
                            }`}
                          >
                            {stg.title}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>

                {/* Bottom Toggle Bar */}
                <TouchableOpacity
                  onPress={() => {
                    if (activeStageIndex === null) {
                      setActiveStageIndex(currentStageIndex)
                    }
                    setShowTrackerDetails((prev) => !prev)
                  }}
                  activeOpacity={0.8}
                  className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 mt-2 flex-row items-center justify-between"
                >
                  <Text className="text-slate-700 text-xs font-semibold flex-1 pr-2" numberOfLines={1}>
                    📍 {trackerStages[effectiveStage].desc}
                  </Text>
                  <Text className="text-blue-600 text-xs font-black">
                    {showTrackerDetails ? 'Hide Details ▲' : 'View Details ▼'}
                  </Text>
                </TouchableOpacity>

                {/* Inline Expanded Stage Details Box */}
                {showTrackerDetails && (
                  <View className="mt-3 pt-3 border-t border-slate-100">
                    <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-slate-900 font-black text-xs">
                          Stage {effectiveStage + 1}: {trackerStages[effectiveStage].title}
                        </Text>
                      </View>
                      <View className="bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                        <Text className="text-blue-700 text-[10.5px] font-bold">
                          {effectiveStage <= currentStageIndex ? 'Active / Completed' : 'Pending Step'}
                        </Text>
                      </View>
                    </View>

                    <View className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                      <View className="flex-row justify-between py-1 border-b border-slate-200/60">
                        <Text className="text-slate-600 font-semibold text-xs">Job Card Number:</Text>
                        <Text className="text-slate-900 font-mono font-black text-xs">{jc ? `#${jc}` : '—'}</Text>
                      </View>
                      <View className="flex-row justify-between py-1 border-b border-slate-200/60">
                        <Text className="text-slate-600 font-semibold text-xs">Assigned Advisor:</Text>
                        <Text className="text-slate-900 font-bold text-xs">{dash(advisor)}</Text>
                      </View>
                      <View className="flex-row justify-between py-1 border-b border-slate-200/60">
                        <Text className="text-slate-600 font-semibold text-xs">Assigned Technician:</Text>
                        <Text className="text-slate-900 font-bold text-xs">{dash(technician)}</Text>
                      </View>
                      <View className="flex-row justify-between py-1">
                        <Text className="text-slate-600 font-semibold text-xs">Workshop Bay No:</Text>
                        <Text className="text-blue-700 font-black text-xs">{dash(bayNo) || 'Floor Bay'}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )
          })()}

          {/* ── ACTION SHORTCUT TILES ── */}
          <View className="flex-row flex-wrap" style={{ gap: 10, marginBottom: 2 }}>
            <ActionTile
              icon="alert-circle"
              title="Tell Us Your Problem"
              subtitle="Register complaints & issues"
              border="#fed7aa"
              accent="#f97316"
              onPress={() => router.push('/(customer)/complaint')}
            />
            <ActionTile
              icon="file-text"
              title="Insurance Claim Docs"
              subtitle="DL, RC, Policy & KYC checklist"
              border="#fde68a"
              accent="#d97706"
              onPress={() => router.push('/(customer)/documents')}
            />
            <ActionTile
              icon="file"
              title="Digital Estimate"
              subtitle="Approve or reject quotation"
              border="#bfdbfe"
              accent="#2563eb"
              onPress={() => router.push('/(customer)/estimate')}
            />
            <ActionTile
              icon="file"
              title="Bills & Receipts"
              subtitle="Invoices & payment records"
              border="#bbf7d0"
              accent="#16a34a"
              onPress={() => router.push('/(customer)/invoices')}
            />
            <ActionTile
              icon="shield-check"
              title="Digital Gate Pass"
              subtitle="Official Dealership Clearance"
              border="#e9d5ff"
              accent="#9333ea"
              onPress={() => router.push('/(customer)/gatepass')}
            />
            <ActionTile
              icon="calendar"
              title="Book Service"
              subtitle="Schedule next visit or pickup"
              border="#c7d2fe"
              accent="#4f46e5"
              onPress={() => router.push('/(customer)/booking')}
            />
            <ActionTile
              icon="list"
              title="My Bookings"
              subtitle="Track appointments & status"
              border="#bae6fd"
              accent="#0284c7"
              onPress={() => router.push('/(customer)/my-bookings')}
            />
            <ActionTile
              icon="clock"
              title="Live Repair Tracker"
              subtitle="Workshop stages for this job"
              border="#fecdd3"
              accent="#e11d48"
              onPress={() => router.push('/(customer)/tracker')}
            />
            <ActionTile
              icon="phone"
              title="Helpdesk & Escalation"
              subtitle="Dealership & Tata Motors support"
              border="#fed7aa"
              accent="#ea580c"
              onPress={() => router.push('/(customer)/helpdesk')}
            />
          </View>

          {/* ── WORKSHOP CURRENT RECORD CARD ── */}
          <CustomerCard>
            <View className="flex-row items-start justify-between mb-3">
              <View>
                <Text className="text-slate-900 text-[16px] font-bold">Workshop Record</Text>
                <Text className="text-slate-500 text-[12px]">Current Job Card Details</Text>
              </View>
              <View className="bg-blue-50 px-2 py-1 rounded-full">
                <Text className="text-blue-700 text-[11px] font-bold">{dash(serviceType)}</Text>
              </View>
            </View>
            <RecordRow label="Job Card Number" value={dash(jc)} />
            <RecordRow label="Service Advisor" value={dash(advisor)} />
            <RecordRow label="Assigned Technician" value={dash(technician)} />
            <RecordRow label="Workshop Bay No" value={dash(bayNo) || 'Floor Bay'} />
            <RecordRow label="Service Branch" value={dash(branch)} />
            <RecordRow
              last
              label="Settlement Status"
              value={
                pay.status === 'paid'
                  ? '✓ Fully Paid'
                  : pay.status === 'partial'
                    ? `⚡ Partially Paid (₹${pay.received?.toLocaleString('en-IN')})`
                    : pay.status === 'due'
                      ? '⏳ Payment Due'
                      : pay.status === 'quoted'
                        ? 'Quoted · awaiting accounts'
                        : '—'
              }
            />
          </CustomerCard>

          {/* ── ADVISOR CALL CARD ── */}
          <CustomerCard style={{ backgroundColor: '#f0fdf4', borderColor: '#dcfce7' }}>
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-xl bg-emerald-100 items-center justify-center mr-3">
                <Icon name="phone" size={18} color="#16a34a" />
              </View>
              <View className="flex-1">
                <Text className="text-[13.5px] font-bold text-emerald-900">Need Advisor Assistance?</Text>
                <Text className="text-[12px] text-emerald-700 font-medium">
                  Service Advisor: <Text className="font-bold">{dash(advisor)}</Text>
                </Text>
              </View>
              {advisorPhone ? (
                <TouchableOpacity
                  onPress={() => void Linking.openURL(`tel:${advisorPhone}`)}
                  activeOpacity={0.8}
                  className="bg-emerald-600 active:bg-emerald-700 px-3.5 py-2 rounded-xl"
                >
                  <Text className="text-white text-xs font-black">Call SA</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </CustomerCard>

          {/* ── APP UPDATE QUICK BANNER ── */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={handleManualOtaUpdate}
            disabled={checkingOta}
            className="bg-slate-900 rounded-2xl p-4 mb-3.5 flex-row items-center justify-between border border-slate-800 shadow-md"
          >
            <View className="flex-row items-center gap-3 flex-1 pr-2">
              <View className="w-10 h-10 rounded-xl bg-blue-500/20 items-center justify-center border border-blue-400/30">
                <Icon name="rotate-cw" size={18} color="#60a5fa" />
              </View>
              <View className="flex-1">
                <Text className="text-white text-xs font-black uppercase tracking-wider">
                  {checkingOta ? 'Checking for updates…' : 'App Version & Updates'}
                </Text>
                <Text className="text-slate-400 text-[11px] mt-0.5 font-medium" numberOfLines={1}>
                  {otaStatusText || 'Tap to check and install latest OTA updates'}
                </Text>
              </View>
            </View>
            <View className="bg-blue-600 px-3 py-1.5 rounded-xl">
              <Text className="text-white text-xs font-black">
                {checkingOta ? 'Checking…' : 'Update ➔'}
              </Text>
            </View>
          </TouchableOpacity>
        </>
      )}
    </CustomerScreen>
  )
}

function ActionTile({
  icon,
  title,
  subtitle,
  border,
  accent,
  onPress,
}: {
  icon: IconName
  title: string
  subtitle: string
  border: string
  accent: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        width: '48%',
        flexGrow: 1,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#f1f5f9',
        borderLeftWidth: 3.5,
        borderLeftColor: accent,
        borderRadius: 16,
        padding: 14,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: '#f8fafc',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
          borderWidth: 1,
          borderColor: border,
        }}
      >
        <Icon name={icon} size={18} color={accent} strokeWidth={2} />
      </View>
      <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a', letterSpacing: -0.2 }}>{title}</Text>
      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 3, fontWeight: '500' }}>{subtitle}</Text>
    </TouchableOpacity>
  )
}
