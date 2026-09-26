import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { useCustomerScreenRefresh } from '../../components/customer/customerScreenRefresh'
import { CustomerCard, CustomerToast } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerListHelpdeskContacts,
  type CustomerHelpdeskContactRow,
} from '../../lib/api/customerHelpdesk'
import { CustomerTheme } from '../../lib/customer/customerTheme'

type ContactTier = {
  id: number
  groupKey: 'dealership' | 'tata_motors'
  level: string
  title: string
  role: string
  desc: string
  phone: string
  email: string
  chatContactKey: string | null
  icon: string
  badgeColor: string
  textColor: string
}

const BADGE_STYLES: Record<
  CustomerHelpdeskContactRow['badge_variant'],
  { badgeColor: string; textColor: string }
> = {
  blue: { badgeColor: 'bg-blue-100', textColor: 'text-blue-800' },
  amber: { badgeColor: 'bg-amber-100', textColor: 'text-amber-800' },
  rose: { badgeColor: 'bg-rose-100', textColor: 'text-rose-800' },
  indigo: { badgeColor: 'bg-indigo-100', textColor: 'text-indigo-800' },
  emerald: { badgeColor: 'bg-emerald-100', textColor: 'text-emerald-800' },
}

const FALLBACK_TIERS: ContactTier[] = [
  {
    id: 1,
    groupKey: 'dealership',
    level: 'Level 1 · CRM Desk',
    title: 'Payal Makhija',
    role: 'Customer Relationship Manager (CRM)',
    desc: 'Vehicle service queries, appointment coordination, delay issues & prompt resolution.',
    phone: '9116667296',
    email: 'Crmservice@techwheels.in',
    chatContactKey: 'payal',
    icon: '👩‍💼',
    badgeColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  {
    id: 2,
    groupKey: 'dealership',
    level: 'Level 2 · Service Head',
    title: 'Govind Singh',
    role: 'Service Manager (Workshop Operations)',
    desc: 'Technical disputes, repair quality oversight & workshop floor management.',
    phone: '9116667274',
    email: 'service@techwheels.in',
    chatContactKey: 'govind',
    icon: '👨‍💼',
    badgeColor: 'bg-amber-100',
    textColor: 'text-amber-800',
  },
  {
    id: 3,
    groupKey: 'dealership',
    level: 'Level 3 · Dealership GM',
    title: 'Mr Rajesh Panday',
    role: 'General Manager (Dealership Head)',
    desc: 'Executive escalation, unresolved grievances, critical repeat issues & billing disputes.',
    phone: '9257051606',
    email: 'gmservice@techwheels.in',
    chatContactKey: 'rajesh',
    icon: '🏛️',
    badgeColor: 'bg-rose-100',
    textColor: 'text-rose-800',
  },
  {
    id: 4,
    groupKey: 'tata_motors',
    level: 'Tata Motors · Level 1',
    title: 'Mr Akshay Jethalia',
    role: 'Customer Care Manager (Tata Motors Official)',
    desc: 'Official Tata Motors OEM customer care, warranty policies & vehicle escalation.',
    phone: '9328726988',
    email: 'AJJ820986@tatamotors.com',
    chatContactKey: 'tata_akshay',
    icon: '🚘',
    badgeColor: 'bg-indigo-100',
    textColor: 'text-indigo-800',
  },
  {
    id: 5,
    groupKey: 'tata_motors',
    level: 'Tata Motors · Regional Head',
    title: 'Mr Gurmeet Singh',
    role: 'Regional Customer Care Manager (Tata Motors Official)',
    desc: 'Regional OEM leadership intervention for state-level unresolved customer complaints.',
    phone: '8288004301',
    email: 'gumeet.singh@tatamotors.com',
    chatContactKey: 'tata_gurmeet',
    icon: '🌐',
    badgeColor: 'bg-emerald-100',
    textColor: 'text-emerald-800',
  },
]

function mapRow(row: CustomerHelpdeskContactRow): ContactTier {
  const style = BADGE_STYLES[row.badge_variant] ?? BADGE_STYLES.blue
  return {
    id: row.id,
    groupKey: row.group_key,
    level: row.level_label,
    title: row.contact_name,
    role: row.role_title,
    desc: row.description?.trim() || '',
    phone: row.phone,
    email: row.email?.trim() || '',
    chatContactKey: row.chat_contact_key,
    icon: row.icon_emoji?.trim() || '👤',
    badgeColor: style.badgeColor,
    textColor: style.textColor,
  }
}

export default function CustomerHelpdeskScreen() {
  const router = useRouter()
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [tiers, setTiers] = useState<ContactTier[]>(FALLBACK_TIERS)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    if (!token) {
      setTiers(FALLBACK_TIERS)
      setLoading(false)
      return
    }
    try {
      const rows = await customerListHelpdeskContacts(token)
      if (rows.length > 0) {
        setTiers(rows.map(mapRow))
      } else {
        setTiers(FALLBACK_TIERS)
      }
    } catch {
      setTiers(FALLBACK_TIERS)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useCustomerScreenRefresh(load)

  const dealershipTiers = useMemo(() => tiers.filter((t) => t.groupKey === 'dealership'), [tiers])
  const tataTiers = useMemo(() => tiers.filter((t) => t.groupKey === 'tata_motors'), [tiers])

  const handleCall = async (phone: string) => {
    try {
      await Linking.openURL(`tel:${phone}`)
    } catch {
      setToast({ ok: false, msg: `Unable to open phone dialer for ${phone}` })
    }
  }

  const handleEmail = async (email: string, title: string) => {
    if (!email) {
      setToast({ ok: false, msg: 'No email configured for this contact.' })
      return
    }
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
    <CustomerCard key={`${tier.id}-${tier.phone}`} style={{ marginBottom: 12 }}>
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

      {tier.desc ? (
        <Text className="text-slate-600 text-xs bg-slate-50 p-2.5 rounded-xl mb-3 leading-relaxed">{tier.desc}</Text>
      ) : null}

      <View className="flex-row gap-2 pt-1 border-t border-slate-100">
        <TouchableOpacity
          onPress={() => void handleCall(tier.phone)}
          activeOpacity={0.8}
          className="flex-1 py-2.5 bg-blue-600 rounded-xl items-center flex-row justify-center gap-1 shadow-sm"
        >
          <Text className="text-xs">📞</Text>
          <Text className="text-white font-bold text-xs">Call</Text>
        </TouchableOpacity>

        {tier.chatContactKey ? (
          <TouchableOpacity
            onPress={() => {
              if (!selected?.reg_number) {
                setToast({ ok: false, msg: 'Open Home and choose a vehicle before chatting.' })
                return
              }
              router.push({ pathname: '/(customer)/chat', params: { contact: tier.chatContactKey } })
            }}
            activeOpacity={0.8}
            className="flex-1 py-2.5 bg-slate-900 rounded-xl items-center flex-row justify-center gap-1 shadow-sm"
          >
            <Text className="text-xs">💬</Text>
            <Text className="text-white font-bold text-xs">Chat</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={() => void handleEmail(tier.email, tier.title)}
          activeOpacity={0.8}
          className="flex-1 py-2.5 bg-purple-600 rounded-xl items-center flex-row justify-center gap-1 shadow-sm"
        >
          <Text className="text-xs">✉️</Text>
          <Text className="text-white font-bold text-xs">Mail</Text>
        </TouchableOpacity>
      </View>
    </CustomerCard>
  )

  return (
    <CustomerScreen
      title="Helpdesk & Escalation"
      subtitle="Direct contact matrix for Dealership Management & Tata Motors OEM support"
    >
      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={CustomerTheme.primary} />
        </View>
      ) : (
        <View>
          <View className="mb-4">
            <View className="flex-row justify-between items-center mb-2 px-1">
              <Text className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                🏢 Techwheels Dealership Management
              </Text>
              <Text className="text-[11px] text-blue-600 font-bold">{dealershipTiers.length} Levels</Text>
            </View>
            {dealershipTiers.map(renderTierCard)}
          </View>

          <View className="mb-4">
            <View className="flex-row justify-between items-center mb-2 px-1">
              <Text className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                🚘 Tata Motors Official Support Team
              </Text>
              <Text className="text-[11px] text-indigo-600 font-bold">OEM Escalation</Text>
            </View>
            {tataTiers.map(renderTierCard)}
          </View>
        </View>
      )}
    </CustomerScreen>
  )
}
