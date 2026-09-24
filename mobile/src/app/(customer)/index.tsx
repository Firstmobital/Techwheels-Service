import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
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
} from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerGetActiveJob,
  customerGetGatePass,
  customerGetSettlement,
} from '../../lib/api/customerPortal'
import { computeSettlement } from '../../lib/customer/math'
import { Icon, IconName } from '../../components/ui/Icon'
import { RemainingDocumentsCard } from '../../components/customer/RemainingDocumentsCard'
import { CustomerTheme } from '../../lib/customer/customerTheme'

export default function CustomerDashboardScreen() {
  const router = useRouter()
  const { token, vehicles, selectedReg } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [settlement, setSettlement] = useState<Record<string, unknown> | null>(null)
  const [gatePass, setGatePass] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

          {/* ── REGISTERED VEHICLE HERO CARD (TATA.CARS BRAND THEME) ── */}
          <LinearGradient
            colors={['#002B49', '#071A2E', '#0A1118']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 22,
              padding: 18,
              marginBottom: 16,
              shadowColor: '#002B49',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.45,
              shadowRadius: 16,
              elevation: 6,
              borderWidth: 1.5,
              borderColor: 'rgba(0, 210, 196, 0.35)',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 13 }}>🚘</Text>
                  <Text style={{ color: '#00D2C4', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    TATA MOTORS SERVICE
                  </Text>
                </View>
                <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '900', letterSpacing: 1.5, fontFamily: 'monospace' }}>
                  {selected.reg_number}
                </Text>
                <Text style={{ color: '#ffffff', fontSize: 14.5, fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
                  {model || 'Tata Motors Vehicle'}
                  {variant ? ` · ${variant}` : ''}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 6, maxWidth: '48%' }}>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4.5,
                    borderRadius: 999,
                    backgroundColor: delivered ? 'rgba(0, 210, 196, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    borderWidth: 1.2,
                    borderColor: delivered ? '#00D2C4' : '#fbbf24',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: delivered ? '#00D2C4' : '#fbbf24',
                      marginRight: 5,
                    }}
                  />
                  <Text style={{ color: delivered ? '#00D2C4' : '#fbbf24', fontSize: 11, fontWeight: '800' }} numberOfLines={1}>
                    {delivered ? 'Delivered / Ready' : 'In Service'}
                  </Text>
                </View>

                {jc ? (
                  <View style={{ backgroundColor: 'rgba(0, 210, 196, 0.15)', borderWidth: 1, borderColor: 'rgba(0, 210, 196, 0.35)', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: '#00D2C4', fontFamily: 'monospace', fontWeight: '900', fontSize: 10 }} numberOfLines={1}>
                      JC #{jc.length > 16 ? jc.slice(-12) : jc}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Quick Metrics Grid */}
            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0, 210, 196, 0.2)', flexDirection: 'row', flexWrap: 'wrap' }}>
              <View style={{ width: '50%', paddingRight: 8, marginBottom: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Customer Name</Text>
                <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' }} numberOfLines={1}>{dash(owner)}</Text>
              </View>
              <View style={{ width: '50%', paddingLeft: 8, marginBottom: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Odometer</Text>
                <Text style={{ color: '#00D2C4', fontSize: 13, fontFamily: 'monospace', fontWeight: '900' }} numberOfLines={1}>{km || '—'}</Text>
              </View>
              <View style={{ width: '50%', paddingRight: 8, marginBottom: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Assigned Technician</Text>
                <Text style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '800' }} numberOfLines={1}>{dash(technician)}</Text>
              </View>
              <View style={{ width: '50%', paddingLeft: 8, marginBottom: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: '600' }}>Workshop Bay No</Text>
                <Text style={{ color: '#00D2C4', fontSize: 12.5, fontFamily: 'monospace', fontWeight: '900' }} numberOfLines={1}>{dash(bayNo) || 'Floor Bay'}</Text>
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

            {/* Chat & call */}
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Chat"
                onPress={() => {
                  const phoneClean = (getDirectAdvisorOrWorkshopPhone(job || (selected as unknown as Record<string, unknown>)) || '').replace(/\D/g, '').slice(-10)
                  if (phoneClean) {
                    void Linking.openURL(`https://wa.me/91${phoneClean}?text=${encodeURIComponent(`Hello, I am tracking my Tata vehicle ${selected.reg_number} (Job Card: ${jc || 'Active'}). Please update on current status.`)}`)
                  }
                }}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(0, 210, 196, 0.15)',
                  borderWidth: 1,
                  borderColor: 'rgba(0, 210, 196, 0.4)',
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Icon name="message-square" size={14} color="#00D2C4" strokeWidth={2.2} />
                <Text style={{ color: '#00D2C4', fontSize: 12, fontWeight: '800' }}>Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => void Linking.openURL(`tel:${getDirectAdvisorOrWorkshopPhone(job || (selected as unknown as Record<string, unknown>))}`)}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  backgroundColor: '#003366',
                  borderWidth: 1,
                  borderColor: 'rgba(0, 210, 196, 0.3)',
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Icon name="phone" size={14} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>Direct Call</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <RemainingDocumentsCard regNumber={selected?.reg_number} />

          {/* ── ACTION SHORTCUT TILES ── */}
          <View className="flex-row flex-wrap" style={{ gap: 10, marginBottom: 2 }}>
            <ActionTile
              icon="alert-circle"
              title="Report Issue"
              subtitle="Register complaints & concerns"
              border="#fed7aa"
              accent="#f97316"
              onPress={() => router.push('/(customer)/complaint')}
            />
            <ActionTile
              icon="map"
              title="Service Journey"
              subtitle="Full workshop stage timeline"
              border="#bae6fd"
              accent={CustomerTheme.teal}
              onPress={() => router.push('/(customer)/tracker')}
            />
          </View>

          {/* ── WORKSHOP CURRENT RECORD CARD ── */}
          <CustomerCard
            style={{
              backgroundColor: '#FFFFFF',
              borderColor: CustomerTheme.border,
              borderWidth: 1,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: CustomerTheme.ink, fontSize: 17, fontWeight: '900' }}>Workshop record</Text>
                <Text style={{ color: CustomerTheme.inkMuted, fontSize: 13, marginTop: 3, fontWeight: '600' }}>
                  Current job card details
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: CustomerTheme.tabActiveBg,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: '#BAE6FD',
                }}
              >
                <Text style={{ color: CustomerTheme.teal, fontSize: 11, fontWeight: '800' }}>{dash(serviceType)}</Text>
              </View>
            </View>
            <RecordRow label="Job Card Number" value={dash(jc)} mono />
            <RecordRow label="Service Advisor" value={dash(advisor)} />
            <RecordRow label="Assigned Technician" value={dash(technician)} />
            <RecordRow label="Workshop Bay No" value={dash(bayNo) || 'Floor Bay'} />
            <RecordRow label="Service Branch" value={dash(branch)} />
            <RecordRow
              last
              label="Settlement Status"
              highlight={pay.status === 'paid'}
              value={
                pay.status === 'paid'
                  ? 'Fully paid'
                  : pay.status === 'partial'
                    ? `Partially paid · ₹${pay.received?.toLocaleString('en-IN')}`
                    : pay.status === 'due'
                      ? 'Payment due'
                      : pay.status === 'quoted'
                        ? 'Quoted · awaiting accounts'
                        : '—'
              }
            />
          </CustomerCard>

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
