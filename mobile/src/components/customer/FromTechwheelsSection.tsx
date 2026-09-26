import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { useCustomerScreenRefresh } from './customerScreenRefresh'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import type { CustomerBodyshopAsset } from '../../lib/api/customerBodyshopUploads'
import {
  customerGetGatePass,
  customerGetRepairCard,
  customerGetSettlement,
  customerListEstimates,
  customerOpenBodyshopEstimateDocument,
  resolveWorkshopEstimateDocument,
} from '../../lib/api/customerPortal'
import { Icon } from '../ui/Icon'

type WorkshopDoc = {
  id: string
  title: string
  subtitle: string
  ready: boolean
  onView?: () => void
}

type FromTechwheelsSectionProps = {
  /** Reuse repair card already loaded on Documents (avoids stale / partial fetches). */
  repairCard?: Record<string, unknown> | null
  /** Bodyshop asset list from the same screen (includes workshop `doc_estimate`). */
  workshopDocuments?: CustomerBodyshopAsset[]
}

export function FromTechwheelsSection({
  repairCard: repairCardProp,
  workshopDocuments: workshopDocumentsProp,
}: FromTechwheelsSectionProps = {}) {
  const { token, selectedReg } = useCustomerSession()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<WorkshopDoc[]>([])
  const [estimatePreviewUri, setEstimatePreviewUri] = useState<string | null>(null)
  const [openingEstimate, setOpeningEstimate] = useState(false)

  const openEstimate = useCallback(
    async (estimateDoc: ReturnType<typeof resolveWorkshopEstimateDocument>) => {
      if (!token || !selectedReg) return
      setOpeningEstimate(true)
      try {
        const result = await customerOpenBodyshopEstimateDocument(token, selectedReg, estimateDoc)
        if (result.mode === 'preview') {
          setEstimatePreviewUri(result.uri)
        }
      } catch (err) {
        Alert.alert(
          'Repair quotation',
          err instanceof Error ? err.message : 'Unable to open workshop estimate.'
        )
      } finally {
        setOpeningEstimate(false)
      }
    },
    [token, selectedReg]
  )

  const load = useCallback(async () => {
    if (!token || !selectedReg) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [card, estimates, settlement, gatePass] = await Promise.all([
        repairCardProp !== undefined
          ? Promise.resolve(repairCardProp)
          : customerGetRepairCard(token, selectedReg, { bypassCache: true }).catch(() => null),
        customerListEstimates(token, selectedReg).catch(() => []),
        customerGetSettlement(token, selectedReg).catch(() => null),
        customerGetGatePass(token, selectedReg).catch(() => null),
      ])

      const estimateDoc = resolveWorkshopEstimateDocument(card, workshopDocumentsProp)
      const estRow = estimates[0] as Record<string, unknown> | undefined
      const estUrl = String(estRow?.estimate_drive_url ?? '').trim()
      const hasQuotation = Boolean(estimateDoc || estUrl)

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
          subtitle: hasQuotation ? 'Ready to view' : 'Available after workshop estimate is prepared',
          ready: hasQuotation,
          onView: async () => {
            if (estimateDoc) {
              await openEstimate(estimateDoc)
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
  }, [token, selectedReg, repairCardProp, workshopDocumentsProp, openEstimate])

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
                  disabled={item.id === 'quotation' && openingEstimate}
                  style={{
                    borderWidth: 1,
                    borderColor: CustomerTheme.navy,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    opacity: item.id === 'quotation' && openingEstimate ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: CustomerTheme.navy, fontSize: 12, fontWeight: '800' }}>
                    {item.id === 'quotation' && openingEstimate ? 'Opening…' : 'View'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </View>

      <Modal
        visible={Boolean(estimatePreviewUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setEstimatePreviewUri(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 16 }}>
          <TouchableOpacity
            onPress={() => setEstimatePreviewUri(null)}
            style={{ alignSelf: 'flex-end', marginBottom: 12, padding: 8 }}
          >
            <Icon name="x" size={22} color="#fff" />
          </TouchableOpacity>
          {estimatePreviewUri ? (
            <Image source={{ uri: estimatePreviewUri }} style={{ width: '100%', height: '78%' }} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </View>
  )
}
