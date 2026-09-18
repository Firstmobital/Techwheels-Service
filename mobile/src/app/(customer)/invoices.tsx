import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, dash, formatInr, formatWhen } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerGetGatePass,
  customerGetServiceHistory,
  customerGetSettlement,
  customerListEstimates,
} from '../../lib/api/customerPortal'
import { computeSettlement, parseEstimate } from '../../lib/customer/math'

export default function CustomerInvoicesScreen() {
  const router = useRouter()
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [estimates, setEstimates] = useState<ReturnType<typeof parseEstimate>[]>([])
  const [payment, setPayment] = useState<Record<string, unknown> | null>(null)
  const [pass, setPass] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [hist, est, pay, passData] = await Promise.all([
        customerGetServiceHistory(token, selectedReg),
        customerListEstimates(token, selectedReg),
        customerGetSettlement(token, selectedReg).catch(() => null),
        customerGetGatePass(token, selectedReg).catch(() => null),
      ])
      setHistory(hist)
      setEstimates(est.map(parseEstimate))
      setPayment(pay)
      setPass(passData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load bills.')
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const estimateTotal = estimates.reduce((sum, row) => sum + (row.grand_total || 0), 0)
  const billed =
    payment?.total_billed ?? payment?.billed_amount ?? pass?.billed_amount ?? selected?.billed_amount
  const received =
    payment?.amount_received ?? pass?.amount_received ?? selected?.amount_received
  const pay = computeSettlement({
    billed,
    received,
    estimateTotal: estimateTotal > 0 ? estimateTotal : null,
  })
  const billedFromQuote = pay.status === 'quoted'
  const invoices = history.filter((row) => row.invoice_drive_url || row.invoice_storage_path || row.invoice_done_at)
  const latestInvoiceUrl = selected?.invoice_drive_url || invoices.find((row) => row.invoice_drive_url)?.invoice_drive_url

  const effectiveInvoiceNo = String(
    payment?.invoice_no ||
    pass?.invoice_no ||
    (pay.billed && pay.billed > 0 ? `INV-${String(payment?.jc_number || pass?.job_card_no || selected?.jc_number || '00000').replace(/[^0-9]/g, '').slice(-5)}` : '')
  )
  const effectiveInvoiceDate = String(
    payment?.invoice_date ||
    pass?.invoice_date ||
    (selected?.invoice_done_at ? new Date(selected.invoice_done_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '')
  )

  const paymentList: any[] = (Array.isArray(payment?.payments) && payment.payments.length > 0)
    ? payment.payments
    : (pay.received != null && pay.received > 0 ? [{
        id: 'rec-1',
        amount: pay.received,
        payment_mode: pass?.settlement_reason === 'paid' ? 'UPI' : 'Accounts Cleared',
        posted_at: payment?.updated_at || pass?.issued_at || selected?.invoice_done_at || new Date().toISOString(),
        payment_received_date: effectiveInvoiceDate,
        voucher_no: pass?.gate_pass_no || null,
        reference: 'Accounts Desk Clearance',
      }] : [])

  return (
    <CustomerScreen
      title="Invoices & Payments"
      subtitle={`Billed amounts, receipts & gatepass settlement for ${selected?.reg_number || 'your vehicle'}`}
    >
      <View className="flex-row justify-end mb-3">
        <TouchableOpacity onPress={() => void load()} className="border border-slate-200 bg-white px-3 py-1.5 rounded-lg">
          <Text className="text-[12px] font-bold">{loading ? 'Checking…' : '🔄 Refresh'}</Text>
        </TouchableOpacity>
      </View>
      {error ? <CustomerToast ok={false} message={error} /> : null}
      {loading ? (
        <ActivityIndicator color="#2563eb" />
      ) : (
        <>
          <CustomerCard>
            <View className="flex-row items-start justify-between mb-3">
              <View>
                <Text className="text-slate-900 text-[16px] font-bold">Settlement Summary</Text>
                <Text className="text-slate-500 text-[12px]">
                  Job Card #{dash(payment?.jc_number || pass?.job_card_no || selected?.jc_number)}
                  {estimates.length > 0 ? ` · ${estimates.length} Quotation(s)` : ''}
                </Text>
              </View>
              <View
                className={`px-2 py-1 rounded-full ${
                  pay.status === 'paid'
                    ? 'bg-green-100'
                    : pay.status === 'partial'
                      ? 'bg-amber-100'
                      : pay.status === 'empty'
                        ? 'bg-slate-100'
                        : 'bg-blue-100'
                }`}
              >
                <Text className="text-[11px] font-bold text-slate-800">
                  {pay.status === 'paid'
                    ? '✅ Fully Paid'
                    : pay.status === 'partial'
                      ? `⚡ Partially Paid (${formatInr(pay.received)})`
                      : pay.status === 'due'
                        ? '⏳ Payment Due'
                        : pay.status === 'quoted'
                          ? 'Quoted'
                          : 'Awaiting bill'}
                </Text>
              </View>
            </View>

            <View className="flex-row bg-slate-50 rounded-xl py-3 mb-3 border border-slate-200/80">
              <MoneyCol label={billedFromQuote ? 'Quoted' : 'Total Billed'} value={formatInr(pay.billed)} />
              <MoneyCol
                label="Received Amount"
                value={pay.received != null ? formatInr(pay.received) : '—'}
                color={pay.received != null && pay.received > 0 ? '#16a34a' : undefined}
              />
              <MoneyCol
                label="Remaining Due"
                value={pay.remaining != null ? formatInr(pay.remaining) : '—'}
                color={pay.remaining != null && pay.remaining > 0 ? '#dc2626' : '#16a34a'}
              />
            </View>

            {/* Invoice & Job Card Metadata Row */}
            {(effectiveInvoiceNo || effectiveInvoiceDate) ? (
              <View className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 mb-3">
                {effectiveInvoiceNo ? (
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="text-[11px] font-bold text-blue-900">Tax Invoice Number</Text>
                    <Text className="text-[12px] font-black text-blue-950 font-mono">
                      {effectiveInvoiceNo}
                    </Text>
                  </View>
                ) : null}
                {effectiveInvoiceDate ? (
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[11px] font-medium text-blue-800">Invoice Date</Text>
                    <Text className="text-[11.5px] font-bold text-blue-900">
                      {effectiveInvoiceDate}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Payment Transactions List from Accounts Desk */}
            {paymentList.length > 0 ? (
              <View className="border-t border-slate-200 pt-3 mb-3">
                <Text className="text-[12px] font-bold mb-2 text-slate-900">
                  💳 Payment Receipts & Modes ({paymentList.length}):
                </Text>
                {paymentList.map((p: any, idx: number) => {
                  const mode = String(p.payment_mode || 'Payment').toUpperCase()
                  const isUpi = mode.includes('UPI')
                  const isCash = mode.includes('CASH')
                  const isCard = mode.includes('CARD')
                  const icon = isUpi ? '📱' : isCash ? '💵' : isCard ? '💳' : '🧾'
                  return (
                    <View
                      key={p.id || idx}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 mb-2 flex-row justify-between items-center"
                    >
                      <View className="flex-1 pr-2">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-sm">{icon}</Text>
                          <Text className="text-[12.5px] font-black text-slate-800">
                            {mode}
                          </Text>
                          <View className="bg-emerald-100 px-1.5 py-0.5 rounded-md">
                            <Text className="text-[9.5px] font-bold text-emerald-800">✓ Credited</Text>
                          </View>
                        </View>
                        <Text className="text-[11px] text-slate-500 mt-0.5">
                          {p.payment_received_date || (p.posted_at ? formatWhen(p.posted_at) : 'Cleared')}
                          {p.voucher_no ? ` · Voucher: ${p.voucher_no}` : ''}
                          {p.reference ? ` · Ref: ${p.reference}` : ''}
                        </Text>
                      </View>
                      <Text className="text-[13px] font-black text-emerald-700 font-mono">
                        {formatInr(Number(p.amount) || 0)}
                      </Text>
                    </View>
                  )
                })}
              </View>
            ) : null}

            {estimates.length > 0 ? (
              <View className="border-t border-slate-200 pt-3 mb-3">
                <Text className="text-[12px] font-bold mb-2">
                  📋 Estimate Breakdown ({estimates.length} Quotation{estimates.length > 1 ? 's' : ''}):
                </Text>
                {estimates.map((est) => (
                  <View key={est.estimate_id} className="flex-row justify-between bg-slate-50 rounded-lg px-3 py-2 mb-1.5">
                    <View className="flex-1 pr-2">
                      <Text className="text-[12px] font-bold text-sky-800">#{est.estimate_no}</Text>
                      <Text className="text-[11px] text-slate-500">
                        ({est.items.length} items · {est.status})
                      </Text>
                    </View>
                    <Text className="text-[12px] font-extrabold">{est.grand_total != null ? formatInr(est.grand_total) : '—'}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {latestInvoiceUrl ? (
              <TouchableOpacity
                className="bg-blue-600 rounded-xl py-3 items-center mb-2"
                onPress={() => void Linking.openURL(String(latestInvoiceUrl))}
              >
                <Text className="text-white font-extrabold">📥 Download Tax Invoice</Text>
              </TouchableOpacity>
            ) : null}

            {pay.status === 'paid' || (pay.remaining != null && pay.remaining <= 0 && (pay.billed ?? 0) > 0) ? (
              <View className="space-y-2">
                <View className="bg-emerald-50 rounded-xl p-3 items-center border border-emerald-200">
                  <Text className="text-emerald-800 text-[13px] font-black">
                    ✓ Payment Settled · Official Gate Pass Ready!
                  </Text>
                  <Text className="text-emerald-700 text-[11.5px] mt-0.5 text-center">
                    Vehicle departure clearance released by Accounts Desk.
                  </Text>
                </View>
                <TouchableOpacity
                  className="bg-emerald-600 active:bg-emerald-700 rounded-xl py-3.5 items-center mt-2 shadow-sm"
                  onPress={() => router.push('/(customer)/gatepass')}
                >
                  <Text className="text-white font-black text-sm">🎟️ View & Print Official Gate Pass (PDF)</Text>
                </TouchableOpacity>
              </View>
            ) : pay.remaining != null && pay.remaining > 0 ? (
              <View className="space-y-2">
                <Text className="text-center text-slate-600 text-[12.5px] leading-5">
                  Complete balance payment of <Text className="font-extrabold text-slate-900">{formatInr(pay.remaining)}</Text> at workshop billing desk to release Gate Pass.
                </Text>
                <TouchableOpacity
                  className="bg-slate-900 rounded-xl py-3 items-center mt-1"
                  onPress={() => router.push('/(customer)/gatepass')}
                >
                  <Text className="text-white font-extrabold text-xs">Check Gate Pass Status →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text className="text-center text-slate-500 text-[12.5px]">
                Invoice and settlement figures appear after Accounts posts them.
              </Text>
            )}
          </CustomerCard>

          {invoices.map((row) => (
            <CustomerCard key={String(row.id)}>
              <Text className="text-slate-900 font-bold">{String(row.jc_number || 'Job')}</Text>
              <Text className="text-slate-600 mt-1">{String(row.service_type || 'Service')}</Text>
              {row.service_date ? <Text className="text-slate-500 text-xs mt-1">{formatWhen(row.service_date)}</Text> : null}
              {row.total_amount != null && Number(row.total_amount) > 0 ? (
                <Text className="text-slate-800 font-bold mt-1">{formatInr(row.total_amount)}</Text>
              ) : null}
              {row.invoice_drive_url ? (
                <Text className="text-blue-700 mt-2 font-semibold" onPress={() => void Linking.openURL(String(row.invoice_drive_url))}>
                  Open invoice
                </Text>
              ) : null}
            </CustomerCard>
          ))}

          <CustomerCard style={{ backgroundColor: '#f8fafc' }}>
            <View className="flex-row">
              <Text className="text-[22px] mr-3">🔒</Text>
              <View className="flex-1">
                <Text className="text-[13px] font-bold">Workshop Payments Accepted</Text>
                <Text className="text-[12px] text-slate-500 mt-1">
                  UPI (GPay / PhonePe / Paytm), Credit / Debit Cards, Net Banking & Cash at workshop billing desk.
                </Text>
              </View>
            </View>
          </CustomerCard>
        </>
      )}
    </CustomerScreen>
  )
}

function MoneyCol({ label, value, color }: { label: string; value: string | null; color?: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-[11px] text-slate-500 font-semibold">{label}</Text>
      <Text className="text-[16px] font-extrabold mt-0.5" style={color ? { color } : undefined}>
        {value || '—'}
      </Text>
    </View>
  )
}
