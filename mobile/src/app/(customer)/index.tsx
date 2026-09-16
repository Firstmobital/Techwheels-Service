import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import {
  CustomerCard,
  RecordRow,
  asText,
  dash,
  formatKm,
  pickAdvisorPhone,
} from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetActiveJob, customerGetSettlement } from '../../lib/api/customerPortal'
import { computeSettlement } from '../../lib/customer/math'

export default function CustomerDashboardScreen() {
  const router = useRouter()
  const { token, vehicles, selectedReg } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [settlement, setSettlement] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setError(null)
    try {
      const [jobResult, payResult] = await Promise.all([
        customerGetActiveJob(token, selected?.reg_number),
        customerGetSettlement(token, selected?.reg_number).catch(() => null),
      ])
      setJob(jobResult.job)
      setSettlement(payResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load job.')
    } finally {
      setLoading(false)
    }
  }, [token, selected?.reg_number])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
      const timer = setInterval(() => {
        void load()
      }, 8000)
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
  const jc = asText(job?.jc_number) || asText(selected?.jc_number)
  const branch = asText(job?.branch) || asText(selected?.branch)
  const delivered = Boolean(job?.invoice_done_at || selected?.invoice_done_at)
  const pay = computeSettlement({
    billed: settlement?.total_billed ?? settlement?.billed_amount ?? job?.billed_amount ?? selected?.billed_amount,
    received: settlement?.amount_received ?? job?.amount_received ?? selected?.amount_received,
  })
  const advisorPhone = pickAdvisorPhone(job) || pickAdvisorPhone(selected as unknown as Record<string, unknown>)

  return (
    <CustomerScreen title="Dashboard" subtitle="Live service job card for the selected vehicle">
      {loading && !selected ? (
        <ActivityIndicator color="#2563eb" />
      ) : error ? (
        <Text className="text-red-600">{error}</Text>
      ) : !selected ? (
        <Text className="text-slate-600">No vehicle found for this mobile number.</Text>
      ) : (
        <>
          <LinearGradient
            colors={['#1e3a8a', '#2563eb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 12, padding: 16, marginBottom: 12 }}
          >
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-3">
                <Text className="text-blue-100 text-[11px] font-bold uppercase tracking-widest">Registered Vehicle</Text>
                <Text className="text-white text-2xl font-extrabold mt-1 tracking-wide">{selected.reg_number}</Text>
                <Text className="text-blue-50 text-[13.5px] mt-1">
                  <Text className="font-extrabold">{model || '—'}</Text>
                  {variant ? ` · ${variant}` : ''}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: delivered ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.3)',
                }}
              >
                <Text className="text-white text-xs font-bold">
                  {delivered ? '✅ Delivered / Ready' : '⏳ In Service'}
                </Text>
              </View>
            </View>

            <View className="mt-4 pt-3 border-t border-white/20 flex-row flex-wrap">
              <View className="w-1/2 pr-2 mb-3">
                <Text className="text-blue-100 text-[11px]">Customer Name</Text>
                <Text className="text-white text-[13.5px] font-extrabold uppercase">{dash(owner)}</Text>
              </View>
              <View className="w-1/2 pl-2 mb-3">
                <Text className="text-blue-100 text-[11px]">Current Odometer</Text>
                <Text className={`text-[13.5px] font-bold ${km ? 'text-white' : 'text-amber-300'}`}>
                  {km || '⏳ Awaiting KM Entry'}
                </Text>
              </View>
              <View className="w-1/2 pr-2">
                <Text className="text-blue-100 text-[11px]">Service Type</Text>
                <Text className="text-white text-[13.5px] font-bold">{dash(serviceType)}</Text>
              </View>
              <View className="w-1/2 pl-2">
                <Text className="text-blue-100 text-[11px]">Assigned Advisor</Text>
                <Text className="text-white text-[13.5px] font-bold">{dash(advisor)}</Text>
              </View>
            </View>
          </LinearGradient>

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
              subtitle="QR Exit Authorization"
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
          </View>

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
                  className="bg-green-600 px-3 py-2 rounded-lg"
                >
                  <Text className="text-white text-xs font-bold">Call</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </CustomerCard>
        </>
      )}
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
        borderRadius: 12,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 24, marginBottom: 4 }}>{emoji}</Text>
      <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>{title}</Text>
      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{subtitle}</Text>
    </TouchableOpacity>
  )
}
