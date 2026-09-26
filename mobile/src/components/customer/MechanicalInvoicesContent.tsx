import { Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CustomerCard } from './customerUi'
import { formatInr, formatWhen } from './customerUi'
import type { MechanicalCasePayload } from '../../lib/customer/mechanicalCustomerUi'
import { openReceptionDocument } from '../../lib/customer/openReceptionDocument'

function MoneyCol({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 10.5, color: '#64748b', fontWeight: '700' }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '900', color: color || '#0f172a', marginTop: 4, fontFamily: 'monospace' }}>
        {value}
      </Text>
    </View>
  )
}

export function MechanicalInvoicesContent({
  mechCase,
  jcLabel,
}: {
  mechCase: MechanicalCasePayload
  jcLabel: string
}) {
  const router = useRouter()
  const inv = mechCase.invoice
  const billed = inv?.billed_amount != null ? Number(inv.billed_amount) : null
  const received = inv?.amount_received != null ? Number(inv.amount_received) : 0
  const remaining = inv?.remaining_amount != null ? Number(inv.remaining_amount) : null
  const hasBill = billed != null && billed > 0
  const payments = mechCase.payments || []
  const estimate = mechCase.expected_invoice_amount != null ? Number(mechCase.expected_invoice_amount) : null
  const payStatus = String(inv?.payment_status || '').toLowerCase()
  const cleared = hasBill && remaining != null && remaining <= 0 && (payStatus === 'received' || received >= (billed || 0))

  return (
    <CustomerCard>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: '#0f172a' }}>Service billing</Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{jcLabel}</Text>
        </View>
        <View style={{ backgroundColor: cleared ? '#dcfce7' : hasBill ? '#fef3c7' : '#f1f5f9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#334155' }}>
            {!hasBill ? 'Bill pending' : cleared ? 'Fully paid' : payStatus === 'partial' ? 'Partially paid' : 'Payment due'}
          </Text>
        </View>
      </View>

      {!hasBill ? (
        <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
          <Text style={{ color: '#334155', fontWeight: '700', fontSize: 13 }}>Bill not raised yet</Text>
          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4, lineHeight: 17 }}>
            Accounts will publish the tax invoice after service advisor mark done and billing capture.
          </Text>
          {estimate != null && estimate > 0 ? (
            <Text style={{ color: '#475569', fontSize: 12, marginTop: 8 }}>
              Estimate (not amount due): <Text style={{ fontWeight: '800' }}>{formatInr(estimate)}</Text>
            </Text>
          ) : null}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', backgroundColor: '#f8fafc', borderRadius: 12, paddingVertical: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
            <MoneyCol label="Total billed" value={formatInr(billed ?? 0) ?? '—'} />
            <MoneyCol label="Received" value={formatInr(received) ?? '—'} color={received > 0 ? '#16a34a' : undefined} />
            <MoneyCol
              label="Remaining"
              value={(remaining != null ? formatInr(remaining) : formatInr(0)) ?? '—'}
              color={remaining != null && remaining > 0 ? '#dc2626' : '#16a34a'}
            />
          </View>
          {inv?.invoice_number ? (
            <Text style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
              Invoice {inv.invoice_number}
              {inv.invoice_date ? ` · ${String(inv.invoice_date)}` : ''}
            </Text>
          ) : null}
          {payments.length > 0 ? (
            <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10, marginBottom: 10 }}>
              <Text style={{ fontWeight: '800', fontSize: 12, marginBottom: 8, color: '#0f172a' }}>Payment receipts</Text>
              {payments.map((p, idx) => (
                <View
                  key={String(p.id ?? idx)}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 8,
                    borderBottomWidth: idx < payments.length - 1 ? 1 : 0,
                    borderBottomColor: '#f1f5f9',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 12, color: '#334155' }}>
                      {String(p.payment_mode || 'Payment').toUpperCase()}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {p.payment_received_date
                        ? String(p.payment_received_date)
                        : p.posted_at
                          ? formatWhen(String(p.posted_at))
                          : ''}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '900', color: '#15803d', fontFamily: 'monospace' }}>{formatInr(Number(p.amount) || 0)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {(mechCase.invoice_drive_url || mechCase.invoice_storage_path) ? (
            <TouchableOpacity
              style={{ backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8 }}
              onPress={() =>
                void openReceptionDocument({
                  driveUrl: mechCase.invoice_drive_url,
                  storagePath: mechCase.invoice_storage_path,
                })
              }
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Download tax invoice</Text>
            </TouchableOpacity>
          ) : null}
          {mechCase.gate_pass_issued ? (
            <TouchableOpacity
              style={{ backgroundColor: '#059669', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              onPress={() => router.push('/(customer)/gatepass')}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>View gate pass</Text>
            </TouchableOpacity>
          ) : hasBill && remaining != null && remaining > 0 ? (
            <Text style={{ textAlign: 'center', color: '#64748b', fontSize: 12, marginTop: 8, lineHeight: 18 }}>
              Pay the remaining balance at the workshop billing desk to release your gate pass.
            </Text>
          ) : null}
        </>
      )}
    </CustomerCard>
  )
}
