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
  formatInr,
  getDirectAdvisorOrWorkshopPhone,
} from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetGatePass } from '../../lib/api/customerPortal'
import { useCustomerVisit } from '../../context/CustomerVisitContext'
import { mechanicalStatusLabel } from '../../lib/customer/mechanicalCustomerUi'
import { Icon, IconName } from '../../components/ui/Icon'
import { RemainingDocumentsCard } from '../../components/customer/RemainingDocumentsCard'
import { CustomerPrimaryActionCard } from '../../components/customer/CustomerPrimaryActionCard'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { useCustomerScreenRefresh } from '../../components/customer/customerScreenRefresh'

export default function CustomerDashboardScreen() {
  const router = useRouter()
  const { token, vehicles, selectedReg } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const {
    ready: visitReady,
    job,
    repairCard,
    mechCase,
    isMechanical,
    isBodyshop,
    refresh: refreshVisit,
  } = useCustomerVisit()
  const [gatePass, setGatePass] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !selectedReg) return
    try {
      const passResult = await customerGetGatePass(token, selectedReg).catch(() => null)
      setGatePass(passResult)
      setError(null)
      await refreshVisit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load job.')
    }
  }, [token, selectedReg, refreshVisit])

  // Fast & smooth 3.5s background auto-refresh without UI flicker
  useFocusEffect(
    useCallback(() => {
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

  const onPullRefresh = useCallback(async () => {
    await load()
  }, [load])
  useCustomerScreenRefresh(onPullRefresh)

  const customerName =
    asText(selected?.owner_name) ||
    asText(repairCard?.customer_name) ||
    asText(job?.owner_name)
  const model = asText(job?.model) || asText(selected?.model)
  const variant = asText(job?.variant) || asText(selected?.variant)
  const km = formatKm(job?.km_reading ?? selected?.km_reading)
  const serviceType = asText(job?.service_type) || asText(selected?.service_type)
  const advisor =
    asText(job?.sa_display_name) ||
    asText(job?.sa_name) ||
    asText(selected?.sa_display_name) ||
    asText(selected?.sa_name) ||
    asText(repairCard?.sa_display_name) ||
    asText(repairCard?.sa_name) ||
    asText(repairCard?.service_advisor_name)
  const insuranceCompany =
    asText(repairCard?.insurance_company) ||
    asText(job?.insurance_company) ||
    asText(job?.insurance_company)
  const surveyorName = asText(repairCard?.surveyor_name) || asText(job?.surveyor_name)
  const surveyorMobile =
    asText(repairCard?.surveyor_contact) ||
    asText(repairCard?.surveyor_mobile) ||
    asText(repairCard?.surveyor_phone) ||
    asText(job?.surveyor_contact) ||
    asText(job?.surveyor_mobile)
  const jc = asText(job?.jc_number) || asText(selected?.jc_number)
  const claimIntimation =
    asText(repairCard?.claim_intimation_no) ||
    asText(job?.claim_intimation_no) ||
    asText(job?.claim_intimation_no)
  const insurancePolicyNo =
    asText(repairCard?.insurance_policy_no) ||
    asText(job?.insurance_policy_no) ||
    asText(job?.insurance_policy_no)
  const approvedEstimateRaw = repairCard?.estimated_amount ?? job?.estimated_amount
  const approvedEstimate =
    approvedEstimateRaw != null && approvedEstimateRaw !== '' ? formatInr(Number(approvedEstimateRaw)) : null
  const delivered = Boolean(job?.invoice_done_at || selected?.invoice_done_at)
  const mechanicalStatus = isMechanical ? mechanicalStatusLabel(mechCase) : null
  const showBodyshopFields = visitReady && isBodyshop
  const homeContentReady = visitReady && Boolean(selected)
  return (
    <CustomerScreen title="" subtitle="">
      {!homeContentReady ? (
        <ActivityIndicator color={CustomerTheme.primary} className="py-8" />
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

          {/* ── Hero banner (mockup) ── */}
          <LinearGradient
            colors={[CustomerTheme.primary, CustomerTheme.navy]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: CustomerTheme.radiusCard,
              padding: 18,
              marginBottom: 12,
              minHeight: 112,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
              {isMechanical ? dash(serviceType) || 'Workshop service' : 'Accidental & bodyshop care'}
            </Text>
            <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 6, lineHeight: 26, maxWidth: '92%' }}>
              {isMechanical ? (mechanicalStatus || 'Your service visit') : 'Care That Keeps You Moving.'}
            </Text>
          </LinearGradient>

          {/* ── Selected vehicle card ── */}
          <CustomerCard style={{ marginTop: -4, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, fontWeight: '700' }}>
                  {customerName || 'Your vehicle'}
                </Text>
                <Text style={{ color: CustomerTheme.ink, fontSize: 22, fontWeight: '900', fontFamily: 'monospace', letterSpacing: 1, marginTop: 2 }}>
                  {selected.reg_number}
                </Text>
                <Text style={{ color: CustomerTheme.ink, fontSize: 14, fontWeight: '800', marginTop: 2 }} numberOfLines={2}>
                  {model || 'Tata Motors Vehicle'}
                  {variant ? ` · ${variant}` : ''}
                </Text>
                {km ? (
                  <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, fontWeight: '600', marginTop: 4 }}>{km}</Text>
                ) : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: CustomerTheme.border,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: CustomerTheme.primaryLight,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="user" size={16} color={CustomerTheme.primary} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: CustomerTheme.inkMuted, fontSize: 10.5, fontWeight: '700' }}>Service advisor</Text>
                    <Text style={{ color: CustomerTheme.ink, fontSize: 14.5, fontWeight: '900', marginTop: 1 }} numberOfLines={2}>
                      {dash(advisor)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: delivered ? '#ECFDF5' : CustomerTheme.primaryLight,
                    borderWidth: 1,
                    borderColor: delivered ? '#86EFAC' : 'rgba(0,82,155,0.25)',
                  }}
                >
                  <Text style={{ color: delivered ? CustomerTheme.success : CustomerTheme.primary, fontSize: 11, fontWeight: '800' }}>
                    {delivered ? 'Ready for delivery' : 'In service'}
                  </Text>
                </View>
                {jc ? (
                  <Text style={{ color: CustomerTheme.inkMuted, fontSize: 10.5, fontWeight: '700', fontFamily: 'monospace' }}>
                    JC #{jc.length > 14 ? jc.slice(-12) : jc}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Chat"
                onPress={() => router.push('/(customer)/chat')}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  borderWidth: 1.5,
                  borderColor: CustomerTheme.primary,
                  borderRadius: CustomerTheme.radiusButton,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: '#FFFFFF',
                }}
              >
                <Icon name="message-square" size={15} color={CustomerTheme.primary} strokeWidth={2.2} />
                <Text style={{ color: CustomerTheme.primary, fontSize: 12.5, fontWeight: '800' }}>Chat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void Linking.openURL(`tel:${getDirectAdvisorOrWorkshopPhone(job || (selected as unknown as Record<string, unknown>))}`)}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  backgroundColor: CustomerTheme.primary,
                  borderRadius: CustomerTheme.radiusButton,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Icon name="phone" size={15} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '800' }}>Call advisor</Text>
              </TouchableOpacity>
            </View>
            <Text
              style={{
                color: CustomerTheme.inkMuted,
                fontSize: 11.5,
                lineHeight: 16,
                marginTop: 10,
                textAlign: 'center',
                fontWeight: '500',
              }}
            >
              We prefer chat for faster updates and a clear record of your request. Call when you need to speak directly.
            </Text>
          </CustomerCard>

          {showBodyshopFields ? <RemainingDocumentsCard regNumber={selected?.reg_number} /> : null}
          <CustomerPrimaryActionCard includeDocumentAction={false} />

          <View style={{ marginBottom: 14 }}>
            <ActionTile
              highlighted
              icon="alert-circle"
              title="Report issue"
              subtitle="Complaints & concerns"
              onPress={() => router.push('/(customer)/complaint')}
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
                  borderColor: 'rgba(0, 210, 196, 0.35)',
                }}
              >
                <Text style={{ color: CustomerTheme.navy, fontSize: 11, fontWeight: '800' }}>{dash(serviceType)}</Text>
              </View>
            </View>
            <RecordRow label="Job Card Number" value={dash(jc)} mono />
            <RecordRow label="Service Advisor" value={dash(advisor)} />
            {isMechanical && mechCase?.floor?.technician_name ? (
              <RecordRow
                label="Technician"
                value={`${mechCase.floor.technician_name}${mechCase.floor.bay_no ? ` · Bay ${mechCase.floor.bay_no}` : ''}`}
              />
            ) : null}
            {showBodyshopFields ? (
              <>
                <RecordRow label="Claim Intimation No" value={dash(claimIntimation)} mono />
                <RecordRow label="Insurance Company" value={dash(insuranceCompany)} />
                {insurancePolicyNo ? (
                  <RecordRow label="Insurance Policy No" value={dash(insurancePolicyNo)} mono />
                ) : null}
                <RecordRow label="Surveyor Name" value={dash(surveyorName)} />
                <RecordRow
                  label="Surveyor Mob No"
                  value={dash(surveyorMobile)}
                  mono
                  last={!approvedEstimate}
                />
                {approvedEstimate ? (
                  <RecordRow label="Approved Estimate" value={approvedEstimate} highlight last />
                ) : null}
              </>
            ) : (
              <RecordRow label="KM reading" value={km || '—'} last />
            )}
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
  highlighted,
  onPress,
}: {
  icon: IconName
  title: string
  subtitle: string
  highlighted?: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        width: highlighted ? '100%' : '48%',
        flexGrow: 1,
        backgroundColor: highlighted ? CustomerTheme.primaryLight : CustomerTheme.card,
        borderWidth: highlighted ? 2 : 1,
        borderColor: highlighted ? CustomerTheme.primary : CustomerTheme.border,
        borderLeftWidth: highlighted ? 4 : 1,
        borderLeftColor: highlighted ? CustomerTheme.primary : CustomerTheme.border,
        borderRadius: CustomerTheme.radiusCard,
        padding: highlighted ? 16 : 14,
        shadowColor: CustomerTheme.navy,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: highlighted ? 0.1 : 0.05,
        shadowRadius: highlighted ? 12 : 8,
        elevation: highlighted ? 3 : 2,
      }}
    >
      <View style={{ flexDirection: highlighted ? 'row' : 'column', alignItems: highlighted ? 'center' : 'flex-start', gap: highlighted ? 12 : 0 }}>
        <View
          style={{
            width: highlighted ? 44 : 36,
            height: highlighted ? 44 : 36,
            borderRadius: 12,
            backgroundColor: highlighted ? '#FFFFFF' : CustomerTheme.bgMuted,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: highlighted ? 0 : 8,
          }}
        >
          <Icon name={icon} size={highlighted ? 20 : 18} color={CustomerTheme.primary} strokeWidth={2.2} />
        </View>
        <View style={{ flex: highlighted ? 1 : undefined }}>
          <Text style={{ fontSize: highlighted ? 15 : 13.5, fontWeight: '900', color: CustomerTheme.ink, letterSpacing: -0.2 }}>{title}</Text>
          <Text style={{ fontSize: 11.5, color: CustomerTheme.inkMuted, marginTop: 3, fontWeight: '500' }}>{subtitle}</Text>
        </View>
        {highlighted ? <Icon name="chevron-right" size={20} color={CustomerTheme.primary} strokeWidth={2.2} /> : null}
      </View>
    </TouchableOpacity>
  )
}
