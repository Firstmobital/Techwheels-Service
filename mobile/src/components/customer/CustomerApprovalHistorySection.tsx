import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View } from 'react-native'
import {
  customerListApprovalHistory,
  type CustomerApprovalHistoryItem,
} from '../../lib/api/customerPortal'
import { CustomerCard, formatWhen } from './customerUi'
import { CustomerTheme } from '../../lib/customer/customerTheme'

type Props = {
  token: string
  regNumber: string
  kind: 'survey' | 'service_estimate'
  title?: string
}

function eventLabel(row: CustomerApprovalHistoryItem): string {
  if (row.event_type === 'document_replaced') return 'Previous document version'
  if (row.event_type === 'customer_approved') return 'You approved'
  if (row.event_type === 'customer_rejected') return 'You rejected'
  return row.event_type
}

function eventTint(row: CustomerApprovalHistoryItem): { bg: string; fg: string } {
  if (row.event_type === 'customer_approved') return { bg: '#ECFDF5', fg: '#047857' }
  if (row.event_type === 'customer_rejected') return { bg: '#FEF2F2', fg: '#B91C1C' }
  return { bg: '#F3F4F6', fg: '#374151' }
}

export function CustomerApprovalHistorySection({ token, regNumber, kind, title }: Props) {
  const [rows, setRows] = useState<CustomerApprovalHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    if (!token || !regNumber) return
    setLoading(true)
    try {
      const list = await customerListApprovalHistory(token, regNumber, kind)
      setRows(list)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [token, regNumber, kind])

  useEffect(() => {
    void load()
  }, [load])

  const openOldDoc = async (row: CustomerApprovalHistoryItem) => {
    const url = String(row.drive_url ?? '').trim()
    if (!url) {
      Alert.alert('Document unavailable', 'This older version is no longer stored for viewing.')
      return
    }
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Unable to open', 'Could not open this document on your device.')
    }
  }

  if (loading && rows.length === 0) {
    return (
      <CustomerCard style={{ marginTop: 12 }}>
        <ActivityIndicator color={CustomerTheme.primary} />
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
          Loading approval history…
        </Text>
      </CustomerCard>
    )
  }

  if (rows.length === 0) {
    return null
  }

  const visible = expanded ? rows : rows.slice(0, 3)

  return (
    <CustomerCard style={{ marginTop: 12 }}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.85}>
        <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900' }}>
          {title ?? 'Approval history'}
        </Text>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 4 }}>
          Saved when documents change or you approve / reject ({rows.length})
        </Text>
      </TouchableOpacity>

      <View style={{ marginTop: 12, gap: 10 }}>
        {visible.map((row) => {
          const tint = eventTint(row)
          return (
            <View
              key={row.id}
              style={{
                borderWidth: 1,
                borderColor: CustomerTheme.border,
                borderRadius: 10,
                padding: 10,
                backgroundColor: tint.bg,
              }}
            >
              <Text style={{ color: tint.fg, fontWeight: '800', fontSize: 13 }}>{eventLabel(row)}</Text>
              {row.file_name ? (
                <Text style={{ color: CustomerTheme.ink, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                  {row.file_name}
                </Text>
              ) : null}
              {row.estimate_id ? (
                <Text style={{ color: CustomerTheme.ink, fontSize: 12, marginTop: 4 }}>
                  Estimate #{row.estimate_id}
                </Text>
              ) : null}
              {row.customer_reason ? (
                <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                  {row.customer_reason}
                </Text>
              ) : null}
              <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, marginTop: 6 }}>
                {formatWhen(row.created_at) ?? '—'}
              </Text>
              {row.event_type === 'document_replaced' && row.drive_url ? (
                <TouchableOpacity onPress={() => void openOldDoc(row)} style={{ marginTop: 8 }}>
                  <Text style={{ color: CustomerTheme.primary, fontWeight: '800', fontSize: 12 }}>View previous file</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        })}
      </View>

      {rows.length > 3 ? (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={{ marginTop: 10 }}>
          <Text style={{ color: CustomerTheme.primary, fontWeight: '800', fontSize: 13, textAlign: 'center' }}>
            {expanded ? 'Show less' : `Show all ${rows.length} entries`}
          </Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity onPress={() => void load()} style={{ marginTop: 8 }}>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, textAlign: 'center' }}>Refresh history</Text>
      </TouchableOpacity>
    </CustomerCard>
  )
}
