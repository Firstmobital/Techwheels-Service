import { useCallback, useState } from 'react'
import { Linking, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { useCustomerScreenRefresh } from '../../components/customer/customerScreenRefresh'
import { CustomerCard, CustomerToast } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'

interface ContactTier {
  level: string
  title: string
  role: string
  desc: string
  phone: string
  email: string
  icon: string
  badgeColor: string
  textColor: string
}

const DEALERSHIP_TIERS: ContactTier[] = [
  {
    level: 'Level 1 · CRM Desk',
    title: 'Payal Makhija',
    role: 'Customer Relationship Manager (CRM)',
    desc: 'Vehicle service queries, appointment coordination, delay issues & prompt resolution.',
    phone: '9116667296',
    email: 'Crmservice@techwheels.in',
    icon: '👩‍💼',
    badgeColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  {
    level: 'Level 2 · Service Head',
    title: 'Govind Singh',
    role: 'Service Manager (Workshop Operations)',
    desc: 'Technical disputes, repair quality oversight & workshop floor management.',
    phone: '9116667274',
    email: 'service@techwheels.in',
    icon: '👨‍💼',
    badgeColor: 'bg-amber-100',
    textColor: 'text-amber-800',
  },
  {
    level: 'Level 3 · Dealership GM',
    title: 'Mr Rajesh Panday',
    role: 'General Manager (Dealership Head)',
    desc: 'Executive escalation, unresolved grievances, critical repeat issues & billing disputes.',
    phone: '9257051606',
    email: 'gmservice@techwheels.in',
    icon: '🏛️',
    badgeColor: 'bg-rose-100',
    textColor: 'text-rose-800',
  },
]

const TATA_MOTORS_TIERS: ContactTier[] = [
  {
    level: 'Tata Motors · Level 1',
    title: 'Mr Akshay Jethalia',
    role: 'Customer Care Manager (Tata Motors Official)',
    desc: 'Official Tata Motors OEM customer care, warranty policies & vehicle escalation.',
    phone: '9328726988',
    email: 'AJJ820986@tatamotors.com',
    icon: '🚘',
    badgeColor: 'bg-indigo-100',
    textColor: 'text-indigo-800',
  },
  {
    level: 'Tata Motors · Regional Head',
    title: 'Mr Gurmeet Singh',
    role: 'Regional Customer Care Manager (Tata Motors Official)',
    desc: 'Regional OEM leadership intervention for state-level unresolved customer complaints.',
    phone: '8288004301',
    email: 'gumeet.singh@tatamotors.com',
    icon: '🌐',
    badgeColor: 'bg-emerald-100',
    textColor: 'text-emerald-800',
  },
]

export default function CustomerHelpdeskScreen() {
  const router = useRouter()
  const { selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleCall = async (phone: string) => {
    try {
      await Linking.openURL(`tel:${phone}`)
    } catch {
      setToast({ ok: false, msg: `Unable to open phone dialer for ${phone}` })
    }
  }

  const handleChat = () => {
    router.push('/(customer)/chat')
  }

  const handleEmail = async (email: string, title: string) => {
    const reg = selected?.reg_number || 'Vehicle'
    const owner = selected?.owner_name || 'Customer'
    const subject = encodeURIComponent(`[Techwheels Service Helpdesk] ${reg} - ${owner}`)
    const body = encodeURIComponent(
      `Dear ${title},\n\nVehicle Registration: ${reg}\nOwner: ${owner}\n\nQuery / Concern Details:\n\n`
    )
    try {
      await Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`)
    } catch {
      setToast({ ok: false, msg: `Unable to open email app for ${email}` })
    }
  }

  const renderTierCard = (tier: ContactTier) => (
    <CustomerCard key={tier.phone} style={{ marginBottom: 12 }}>
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-2xl">{tier.icon}</Text>
          <View>
            <View className={`px-2 py-0.5 rounded-full ${tier.badgeColor} self-start mb-0.5`}>
              <Text className={`text-[10px] font-bold ${tier.textColor}`}>{tier.level}</Text>
            </View>
            <Text className="text-[15px] font-bold text-slate-900">{tier.title}</Text>
            <Text className="text-slate-500 text-xs">{tier.role}</Text>
          </View>
        </View>
      </View>

      <Text className="text-slate-600 text-xs bg-slate-50 p-2.5 rounded-xl mb-3 leading-relaxed">
        {tier.desc}
      </Text>

      {/* 1-Tap Action Buttons */}
      <View className="flex-row gap-2 pt-1 border-t border-slate-100">
        <TouchableOpacity
          onPress={handleChat}
          activeOpacity={0.8}
          className="flex-1 py-2.5 bg-emerald-600 rounded-xl items-center flex-row justify-center gap-1 shadow-sm"
        >
          <Text className="text-xs">💬</Text>
          <Text className="text-white font-bold text-xs">Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleCall(tier.phone)}
          activeOpacity={0.8}
          className="flex-1 py-2.5 bg-blue-600 rounded-xl items-center flex-row justify-center gap-1 shadow-sm"
        >
          <Text className="text-xs">📞</Text>
          <Text className="text-white font-bold text-xs">Call</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleEmail(tier.email, tier.title)}
          activeOpacity={0.8}
          className="flex-1 py-2.5 bg-purple-600 rounded-xl items-center flex-row justify-center gap-1 shadow-sm"
        >
          <Text className="text-xs">✉️</Text>
          <Text className="text-white font-bold text-xs">Mail</Text>
        </TouchableOpacity>
      </View>
    </CustomerCard>
  )

  const onPullRefresh = useCallback(async () => {}, [])
  useCustomerScreenRefresh(onPullRefresh)

  return (
    <CustomerScreen
      title="Helpdesk & Escalation"
      subtitle="Direct contact matrix for Dealership Management & Tata Motors OEM support"
    >
      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}

      <View>
        {/* Dealership Management Section */}
        <View className="mb-4">
          <View className="flex-row justify-between items-center mb-2 px-1">
            <Text className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              🏢 Techwheels Dealership Management
            </Text>
            <Text className="text-[11px] text-blue-600 font-bold">3 Levels</Text>
          </View>
          {DEALERSHIP_TIERS.map(renderTierCard)}
        </View>

        {/* Tata Motors Support Team Section */}
        <View className="mb-4">
          <View className="flex-row justify-between items-center mb-2 px-1">
            <Text className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
              🚘 Tata Motors Official Support Team
            </Text>
            <Text className="text-[11px] text-indigo-600 font-bold">OEM Escalation</Text>
          </View>
          {TATA_MOTORS_TIERS.map(renderTierCard)}
        </View>

      </View>
    </CustomerScreen>
  )
}
