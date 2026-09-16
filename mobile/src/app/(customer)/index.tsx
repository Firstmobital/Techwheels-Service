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

export default function CustomerDashboardScreen() {
  const router = useRouter()
  const { token, vehicles, selectedReg } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [settlement, setSettlement] = useState<Record<string, unknown> | null>(null)
  const [gatePass, setGatePass] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStageModal, setSelectedStageModal] = useState<number | null>(null)
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

  const load = useCallback(async () => {
    if (!token) return
    setError(null)
    try {
      const [jobResult, payResult, passResult] = await Promise.all([
        customerGetActiveJob(token, selected?.reg_number),
        customerGetSettlement(token, selected?.reg_number).catch(() => null),
        customerGetGatePass(token, selected?.reg_number).catch(() => null),
      ])
      setJob(jobResult.job)
      setSettlement(payResult)
      setGatePass(passResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load job.')
    } finally {
      setLoading(false)
    }
  }, [token, selected?.reg_number])

  // Fast & optimized 3.5s auto-refresh
  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
      const timer = setInterval(() => {
        void load()
      }, 3500)
      return () => clearInterval(timer)
    }, [load])
  )

  useEffect(() => {
    void load()
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

  // 5 Service Stages for Flipkart-style Live Tracker
  const currentStageIndex = delivered ? 4 : job?.technician_name ? 3 : job?.estimate_done_at ? 2 : jc ? 1 : 0

  const trackerStages = [
    { title: 'Intake', icon: '📥', desc: 'Vehicle check-in & initial inspection' },
    { title: 'Job Card', icon: '📋', desc: `Assigned SA: ${advisor || 'Service Advisor'} · JC #${jc || 'Pending'}` },
    { title: 'Quote', icon: '📝', desc: 'Itemized parts & labour quotation' },
    { title: 'Bay Work', icon: '🔧', desc: `Technician: ${technician || 'Assigned'} · Bay ${bayNo || 'Floor'}` },
    { title: 'Ready', icon: '✅', desc: 'Repairs completed & tested for delivery' },
  ]

  return (
    <CustomerScreen title="Dashboard" subtitle="Live service job card for the selected vehicle">
      {loading && !selected ? (
        <ActivityIndicator color="#2563eb" className="py-8" />
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
              className="bg-emerald-600 rounded-2xl p-4 mb-3.5 shadow-lg border-2 border-emerald-300 flex-row items-center justify-between"
            >
              <View className="flex-row items-center gap-3 flex-1 pr-2">
                <View className="w-11 h-11 rounded-2xl bg-white/20 items-center justify-center">
                  <Text className="text-2xl">🎟️</Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-emerald-100 text-[10px] font-black uppercase tracking-wider">
                      Official Departure Pass Issued
                    </Text>
                    <View className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  </View>
                  <Text className="text-white text-[15px] font-black" numberOfLines={1}>
                    Gate Pass #{asText(gatePass.gate_pass_no)} Ready
                  </Text>
                  <Text className="text-emerald-100 text-[11.5px] font-semibold mt-0.5" numberOfLines={1}>
                    Authorized by Accounts · Tap to View Pass
                  </Text>
                </View>
              </View>
              <View className="bg-white px-3 py-1.5 rounded-xl shadow-xs">
                <Text className="text-emerald-800 text-xs font-black">View Pass ➔</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* ── REGISTERED VEHICLE HERO CARD WITH PROMINENT JOB CARD NUMBER ── */}
          <LinearGradient
            colors={['#0f172a', '#1e3a8a', '#2563eb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 16, padding: 16, marginBottom: 14, elevation: 4 }}
          >
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-2">
                <Text className="text-blue-200 text-[10px] font-black uppercase tracking-widest">
                  REGISTERED VEHICLE
                </Text>
                <Text className="text-white text-2xl font-black mt-0.5 tracking-wider">
                  {selected.reg_number}
                </Text>
                <Text className="text-blue-100 text-[13px] mt-0.5 font-bold">
                  {model || 'Tata Vehicle'}
                  {variant ? ` · ${variant}` : ''}
                </Text>
              </View>

              <View className="items-end gap-1.5" style={{ maxWidth: '52%' }}>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: delivered ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <Text className="text-white text-[11px] font-black" numberOfLines={1}>
                    {delivered ? '✅ Delivered / Ready' : '⏳ In Service'}
                  </Text>
                </View>

                {/* PROMINENT JOB CARD NUMBER BADGE */}
                {jc ? (
                  <View className="bg-white/20 border border-white/30 px-2.5 py-1 rounded-xl">
                    <Text className="text-white font-mono font-black text-[10px]" numberOfLines={1}>
                      JC #{jc.length > 18 ? jc.slice(-12) : jc}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="mt-4 pt-3 border-t border-white/20 flex-row flex-wrap">
              <View className="w-1/2 pr-2 mb-2.5">
                <Text className="text-blue-200 text-[10.5px] font-semibold">Customer Name</Text>
                <Text className="text-white text-[13px] font-black uppercase" numberOfLines={1}>{dash(owner)}</Text>
              </View>
              <View className="w-1/2 pl-2 mb-2.5">
                <Text className="text-blue-200 text-[10.5px] font-semibold">Live Job Card No</Text>
                <Text className="text-white text-[12.5px] font-mono font-black" numberOfLines={1}>{jc ? `#${jc}` : 'Opening…'}</Text>
              </View>
              <View className="w-1/2 pr-2 mb-2.5">
                <Text className="text-blue-200 text-[10.5px] font-semibold">Assigned Technician</Text>
                <Text className="text-white text-[12.5px] font-bold" numberOfLines={1}>{dash(technician)}</Text>
              </View>
              <View className="w-1/2 pl-2 mb-2.5">
                <Text className="text-blue-200 text-[10.5px] font-semibold">Workshop Bay No</Text>
                <Text className="text-emerald-300 text-[12.5px] font-mono font-black" numberOfLines={1}>{dash(bayNo) || 'Floor Bay'}</Text>
              </View>
              <View className="w-1/2 pr-2 mb-1">
                <Text className="text-blue-200 text-[10.5px] font-semibold">Service Type</Text>
                <Text className="text-white text-[12px] font-bold" numberOfLines={1}>{dash(serviceType)}</Text>
              </View>
              <View className="w-1/2 pl-2 mb-1">
                <Text className="text-blue-200 text-[10.5px] font-semibold">Assigned Advisor</Text>
                <Text className="text-white text-[12px] font-bold" numberOfLines={1}>{dash(advisor)}</Text>
              </View>
            </View>

            {/* Direct Call Advisor One-Tap Banner */}
            <TouchableOpacity
              onPress={() => void Linking.openURL(`tel:${getDirectAdvisorOrWorkshopPhone(job || (selected as unknown as Record<string, unknown>))}`)}
              className="mt-2 bg-emerald-500 active:bg-emerald-600 rounded-xl py-2.5 px-4 flex-row items-center justify-between shadow-sm"
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-base">📞</Text>
                <Text className="text-white text-xs font-black">
                  Call Advisor: {dash(advisor)} ({getDirectAdvisorOrWorkshopPhone(job || (selected as unknown as Record<string, unknown>))})
                </Text>
              </View>
              <View className="bg-white/25 px-2.5 py-0.5 rounded-full">
                <Text className="text-white text-[11px] font-black">Call Now</Text>
              </View>
            </TouchableOpacity>
          </LinearGradient>

          {/* ── GATE PASS READY ALERT BANNER ── */}
          {gatePass ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/(customer)/gatepass')}
              className="bg-purple-900 border-2 border-purple-400 rounded-2xl p-4 mb-4 shadow-lg overflow-hidden"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                  <Text className="text-2xl">🎟️</Text>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-amber-300 text-xs font-black uppercase tracking-wider">
                        Gate Pass Ready
                      </Text>
                      <View className="bg-emerald-500 px-2 py-0.5 rounded-full">
                        <Text className="text-white text-[10px] font-black">CLEARED</Text>
                      </View>
                    </View>
                    <Text className="text-white text-base font-black tracking-tight mt-0.5">
                      Gate Pass #{String(gatePass.gate_pass_no || 'OFFICIAL')}
                    </Text>
                    <Text className="text-purple-200 text-[11px] font-semibold">
                      Approved by Accounts · Tap to View & Download PDF
                    </Text>
                  </View>
                </View>
                <View className="bg-white px-3 py-1.5 rounded-xl shadow-sm">
                  <Text className="text-purple-950 font-black text-xs">Open Pass ➔</Text>
                </View>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* ── FLIPKART-STYLE LIVE REPAIR TRACKER WITH MOVING LIGHT BEAM ── */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setSelectedStageModal(currentStageIndex)}
            className="bg-white border-2 border-slate-900 rounded-2xl p-4 mb-4 shadow-md overflow-hidden relative"
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-lg">🛠️</Text>
                <View>
                  <Text className="text-slate-900 text-[14px] font-black tracking-tight">
                    Live Workshop Repair Tracker
                  </Text>
                  <Text className="text-slate-500 text-[11px]">Tap for Advisor, Technician & Bay Details</Text>
                </View>
              </View>
              <View className="bg-blue-600 px-2.5 py-1 rounded-full flex-row items-center gap-1">
                <View className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
                <Text className="text-white text-[10px] font-black">
                  {trackerStages[currentStageIndex].title}
                </Text>
              </View>
            </View>

            {/* Clean Progress Track Bar */}
            <View className="my-3 relative">
              {/* Background Grey Track Line */}
              <View className="h-2 bg-slate-200 rounded-full overflow-hidden relative">
                {/* Active Filled Progress Line */}
                <View
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: `${((currentStageIndex + 1) / trackerStages.length) * 100}%` }}
                />
              </View>

              {/* 5 Stage Node Icons */}
              <View className="flex-row justify-between -mt-3.5 px-1">
                {trackerStages.map((stg, idx) => {
                  const isDone = idx <= currentStageIndex
                  const isCurrent = idx === currentStageIndex
                  return (
                    <View key={stg.title} className="items-center w-12">
                      <View
                        className={`w-7 h-7 rounded-full items-center justify-center border-2 ${
                          isCurrent
                            ? 'bg-blue-600 border-blue-600 shadow-md ring-2 ring-blue-300'
                            : isDone
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        <Text className="text-xs">{isDone ? (isCurrent ? stg.icon : '✓') : stg.icon}</Text>
                      </View>
                      <Text
                        className={`text-[9.5px] mt-1 text-center font-extrabold ${
                          isCurrent ? 'text-blue-700' : isDone ? 'text-slate-800' : 'text-slate-400'
                        }`}
                      >
                        {stg.title}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </View>

            {/* Bottom Tap Hint */}
            <View className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-2 flex-row items-center justify-between">
              <Text className="text-slate-700 text-xs font-bold flex-1 pr-2">
                📍 {trackerStages[currentStageIndex].desc}
              </Text>
              <Text className="text-blue-600 text-xs font-black">View Details ➔</Text>
            </View>
          </TouchableOpacity>

          {/* ── ACTION SHORTCUT TILES ── */}
          <View className="flex-row flex-wrap" style={{ gap: 10, marginBottom: 2 }}>
            <ActionTile
              emoji="🚨"
              title="Tell Us Your Problem"
              subtitle="Register complaints & issues"
              border="#fed7aa"
              accent="#f97316"
              onPress={() => router.push('/(customer)/complaint')}
            />
            <ActionTile
              emoji="📋"
              title="Digital Estimate"
              subtitle="Approve or reject quotation"
              border="#bfdbfe"
              accent="#2563eb"
              onPress={() => router.push('/(customer)/estimate')}
            />
            <ActionTile
              emoji="🧾"
              title="Bills & Receipts"
              subtitle="Invoices & payment records"
              border="#bbf7d0"
              accent="#16a34a"
              onPress={() => router.push('/(customer)/invoices')}
            />
            <ActionTile
              emoji="🎟️"
              title="Digital Gate Pass"
              subtitle="Official Dealership Clearance"
              border="#e9d5ff"
              accent="#9333ea"
              onPress={() => router.push('/(customer)/gatepass')}
            />
            <ActionTile
              emoji="📅"
              title="Book Service"
              subtitle="Schedule next visit or pickup"
              border="#c7d2fe"
              accent="#4f46e5"
              onPress={() => router.push('/(customer)/booking')}
            />
            <ActionTile
              emoji="🛠️"
              title="Live Repair Tracker"
              subtitle="Workshop stages for this job"
              border="#fecdd3"
              accent="#e11d48"
              onPress={() => router.push('/(customer)/tracker')}
            />
            <ActionTile
              emoji="🏛️"
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
          <CustomerCard style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">📞</Text>
              <View className="flex-1">
                <Text className="text-[13.5px] font-bold text-green-800">Need Advisor Assistance?</Text>
                <Text className="text-[12px] text-green-700">
                  Service Advisor: <Text className="font-bold">{dash(advisor)}</Text>
                </Text>
              </View>
              {advisorPhone ? (
                <TouchableOpacity
                  onPress={() => void Linking.openURL(`tel:${advisorPhone}`)}
                  className="bg-green-600 px-3.5 py-2 rounded-xl"
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
            className="bg-slate-900 rounded-2xl p-4 mb-3.5 flex-row items-center justify-between border border-slate-700 shadow-lg"
          >
            <View className="flex-row items-center gap-3 flex-1 pr-2">
              <View className="w-10 h-10 rounded-xl bg-blue-500/20 items-center justify-center border border-blue-400/40">
                <Text className="text-xl">⚡</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white text-xs font-black uppercase tracking-wider">
                  {checkingOta ? 'Checking for updates…' : 'App Version & Updates'}
                </Text>
                <Text className="text-slate-400 text-[11px] mt-0.5" numberOfLines={1}>
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

      {/* ── STAGE DETAILS POPUP MODAL (TAPPING IN MIDDLE OF TRACKER) ── */}
      <Modal
        visible={selectedStageModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedStageModal(null)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white rounded-t-3xl p-5 shadow-2xl border-t-2 border-slate-900">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-3 mb-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-2xl">{selectedStageModal !== null ? trackerStages[selectedStageModal].icon : '🛠️'}</Text>
                <View>
                  <Text className="text-slate-900 font-black text-base">
                    Stage {selectedStageModal !== null ? selectedStageModal + 1 : ''}: {selectedStageModal !== null ? trackerStages[selectedStageModal].title : ''}
                  </Text>
                  <Text className="text-slate-500 text-xs">Live Floor Incharge Updates</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedStageModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
              >
                <Text className="text-slate-700 font-bold">✕</Text>
              </TouchableOpacity>
            </View>

            <View className="space-y-2 mb-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <View className="flex-row justify-between py-1 border-b border-slate-200">
                <Text className="text-slate-600 font-semibold text-xs">Job Card Number:</Text>
                <Text className="text-slate-900 font-mono font-black text-xs">{jc ? `#${jc}` : '—'}</Text>
              </View>
              <View className="flex-row justify-between py-1 border-b border-slate-200">
                <Text className="text-slate-600 font-semibold text-xs">Assigned Advisor:</Text>
                <Text className="text-slate-900 font-bold text-xs">{dash(advisor)}</Text>
              </View>
              <View className="flex-row justify-between py-1 border-b border-slate-200">
                <Text className="text-slate-600 font-semibold text-xs">Assigned Technician:</Text>
                <Text className="text-slate-900 font-bold text-xs">{dash(job?.technician_name)}</Text>
              </View>
              <View className="flex-row justify-between py-1">
                <Text className="text-slate-600 font-semibold text-xs">Workshop Bay No:</Text>
                <Text className="text-blue-700 font-black text-xs">{dash(job?.bay_no) || 'Floor Bay'}</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => setSelectedStageModal(null)}
              className="bg-blue-600 py-3 rounded-xl items-center"
            >
              <Text className="text-white font-extrabold text-xs">Close Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </CustomerScreen>
  )
}

function ActionTile({
  emoji,
  title,
  subtitle,
  border,
  accent,
  onPress,
}: {
  emoji: string
  title: string
  subtitle: string
  border: string
  accent: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: '48%',
        flexGrow: 1,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: border,
        borderLeftWidth: 4,
        borderLeftColor: accent,
        borderRadius: 14,
        padding: 14,
        elevation: 2,
      }}
    >
      <Text style={{ fontSize: 24, marginBottom: 4 }}>{emoji}</Text>
      <Text style={{ fontSize: 13.5, fontWeight: '900', color: '#0f172a' }}>{title}</Text>
      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{subtitle}</Text>
    </TouchableOpacity>
  )
}
