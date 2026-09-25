import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { useCustomerScreenRefresh } from './customerScreenRefresh'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerGetGatePass,
  customerGetRepairCard,
  customerGetSettlement,
  customerListEstimates,
  customerOpenBodyshopEstimateDocument,
  parseBodyshopEstimateDocument,
} from '../../lib/api/customerPortal'
import { Icon } from '../ui/Icon'

type WorkshopDoc = {
  id: string
  title: string
  subtitle: string
  ready: boolean
  onView?: () => void
}

export function FromTechwheelsSection() {
  const { token, selectedReg } = useCustomerSession()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<WorkshopDoc[]>([])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [card, estimates, settlement, gatePass] = await Promise.all([
        customerGetRepairCard(token, selectedReg).catch(() => null),
        customerListEstimates(token, selectedReg).catch(() => []),
        customerGetSettlement(token, selectedReg).catch(() => null),
        customerGetGatePass(token, selectedReg).catch(() => null),
      ])

      const estimateDoc = parseBodyshopEstimateDocument(card)
      const estRow = estimates[0] as Record<string, unknown> | undefined
      const estUrl = String(estRow?.estimate_drive_url ?? '').trim()
      const settlementRow = settlement as Record<string, unknown> | null
      const billed = Number(settlementRow?.total_billed ?? settlementRow?.billed_amount ?? 0)
      const hasGate = Boolean(gatePass?.gate_pass_no || gatePass?.qr_token)
      const invoiceUrl = String(
        settlementRow?.invoice_drive_url ??
          settlementRow?.invoice_url ??
          (card as Record<string, unknown> | null)?.invoice_drive_url ??
          ''
      ).trim()

      const openUrl = async (url: string, label: string) => {
        if (!url) {
          Alert.alert(label, 'Document is not available yet.')
          return
        }
        try {
          await Linking.openURL(url)
        } catch {
          Alert.alert(label, 'Unable to open this document on your device.')
        }
      }

      const list: WorkshopDoc[] = [
        {
          id: 'quotation',
          title: 'Repair quotation',
          subtitle: estimateDoc || estUrl ? 'Ready to view' : 'Available after workshop estimate is prepared',
          ready: Boolean(estimateDoc || estUrl),
          onView: async () => {
            if (estimateDoc && token) {
              await customerOpenBodyshopEstimateDocument(token, selectedReg, estimateDoc)
              return
            }
            if (estUrl) await openUrl(estUrl, 'Quotation')
          },
        },
        {
          id: 'invoice',
          title: 'Tax invoice',
          subtitle: billed > 0 ? 'Ready to view' : 'Available after billing',
          ready: billed > 0 || Boolean(invoiceUrl),
          onView: () => void openUrl(invoiceUrl, 'Invoice'),
        },
        {
          id: 'receipts',
          title: 'Payment receipts',
          subtitle:
            Number(settlementRow?.amount_received ?? 0) > 0
              ? 'Ready to view'
              : 'Available after payment is posted',
          ready: Number(settlementRow?.amount_received ?? 0) > 0,
          onView: () => {
            Alert.alert(
              'Payment receipts',
              'Open the Payments tab to see itemised receipts for this repair.'
            )
          },
        },
        {
          id: 'gatepass',
          title: 'Vehicle gate pass',
          subtitle: hasGate ? 'Ready for delivery pickup' : 'Available after accounts clearance',
          ready: hasGate,
          onView: () => {
            if (!hasGate) {
              Alert.alert('Gate pass', 'Gate pass will appear here once billing is cleared.')
            }
          },
        },
        {
          id: 'survey',
          title: 'Surveyor approval document',
          subtitle: card?.surveyor_name ? `Surveyor: ${String(card.surveyor_name)}` : 'Available after survey stage',
          ready: Boolean(card?.surveyor_name) && Number(card?.current_stage ?? 0) >= 9,
        },
      ]

      setItems(list)
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  useCustomerScreenRefresh(load)

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: CustomerTheme.ink, fontSize: 17, fontWeight: '900', marginBottom: 4 }}>
        From Techwheels
      </Text>
      <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, marginBottom: 12, lineHeight: 18 }}>
        These appear here automatically as each workshop step finishes.
      </Text>

      <View
        style={{
          backgroundColor: CustomerTheme.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: CustomerTheme.border,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <ActivityIndicator color={CustomerTheme.teal} style={{ padding: 24 }} />
        ) : (
          items.map((item, idx) => (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 14,
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: CustomerTheme.border,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: item.ready ? '#E0F2FE' : CustomerTheme.bgMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Icon
                  name={item.ready ? 'file-text' : 'lock'}
                  size={18}
                  color={item.ready ? CustomerTheme.teal : CustomerTheme.inkSoft}
                />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: CustomerTheme.ink, fontSize: 14, fontWeight: '800' }}>{item.title}</Text>
                <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11.5, marginTop: 2 }}>{item.subtitle}</Text>
              </View>
              {item.ready && item.onView ? (
                <TouchableOpacity
                  onPress={() => void item.onView?.()}
                  style={{
                    borderWidth: 1,
                    borderColor: CustomerTheme.navy,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: CustomerTheme.navy, fontSize: 12, fontWeight: '800' }}>View</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  )
}
