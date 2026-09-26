import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, dash, formatInr, formatWhen } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerGetActiveJob,
  customerGetGatePass,
  customerGetMechanicalCase,
  customerGetServiceHistory,
  customerGetSettlement,
  customerListEstimates,
} from '../../lib/api/customerPortal'
import { MechanicalInvoicesContent } from '../../components/customer/MechanicalInvoicesContent'
import { resolveCustomerVisitKind } from '../../lib/customer/mechanicalServiceType'
import type { MechanicalCasePayload } from '../../lib/customer/mechanicalCustomerUi'
import { computeSettlement, parseEstimate } from '../../lib/customer/math'
import { useCustomerScreenRefresh } from '../../components/customer/customerScreenRefresh'

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
  const [mechCase, setMechCase] = useState<MechanicalCasePayload | null>(null)
  const [isMechanicalVisit, setIsMechanicalVisit] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const jobRes = await customerGetActiveJob(token, selectedReg).catch(() => ({ job: null }))
      const mechanical = resolveCustomerVisitKind(jobRes.job as Record<string, unknown> | null) === 'mechanical'
      setIsMechanicalVisit(mechanical)

      if (mechanical) {
        const [hist, mech, passData] = await Promise.all([
          customerGetServiceHistory(token, selectedReg).catch(() => [] as Record<string, unknown>[]),
          customerGetMechanicalCase(token, selectedReg).catch(() => null),
          customerGetGatePass(token, selectedReg).catch(() => null),
        ])
        setHistory(hist)
        setMechCase((mech as MechanicalCasePayload | null) ?? null)
        setPayment(null)
        setEstimates([])
        setPass(passData)
      } else {
        const [hist, est, pay, passData] = await Promise.all([
          customerGetServiceHistory(token, selectedReg).catch(() => [] as Record<string, unknown>[]),
          customerListEstimates(token, selectedReg).catch(() => [] as Record<string, unknown>[]),
          customerGetSettlement(token, selectedReg).catch(() => null),
          customerGetGatePass(token, selectedReg).catch(() => null),
        ])
        setHistory(hist)
        setEstimates((est || []).map(parseEstimate))
        setPayment(pay)
        setPass(passData)
        setMechCase(null)
      }
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

  useCustomerScreenRefresh(load)

  const billed =
    (payment?.total_billed != null && Number(payment.total_billed) > 0 ? Number(payment.total_billed) : null) ??
    (payment?.billed_amount != null && Number(payment.billed_amount) > 0 ? Number(payment.billed_amount) : null) ??
    (pass?.billed_amount != null && Number(pass.billed_amount) > 0 ? Number(pass.billed_amount) : null) ??
    (selected?.billed_amount != null && Number(selected.billed_amount) > 0 ? Number(selected.billed_amount) : null) ??
    (estimates.length > 0 && estimates[0].grand_total != null && estimates[0].grand_total > 0 ? estimates[0].grand_total : null)
  const received =
    (payment?.amount_received != null ? Number(payment.amount_received) : null) ??
    (pass?.amount_received != null ? Number(pass.amount_received) : null) ??
    (selected?.amount_received != null ? Number(selected.amount_received) : null) ??
    0
  const pay = computeSettlement({
    billed,
    received,
  })
  const invoices = history.filter((row) => row.invoice_drive_url || row.invoice_storage_path || row.invoice_done_at)
  const latestInvoiceUrl = selected?.invoice_drive_url || invoices.find((row) => row.invoice_drive_url)?.invoice_drive_url

  const effectiveInvoiceNo = String(
    payment?.invoice_no ||
    pass?.invoice_no ||
    ''
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

  const isAccidentalCase = Boolean(
    payment?.is_insurance_claim ||
    payment?.is_bodyshop ||
    String(payment?.service_type || '').toLowerCase().includes('accident') ||
    String(payment?.service_type || '').toLowerCase().includes('bodyshop') ||
    String(selected?.service_type || '').toLowerCase().includes('accident') ||
    String(selected?.service_type || '').toLowerCase().includes('bodyshop') ||
    Boolean(payment?.insurance_company) ||
    Number(payment?.do_amount ?? 0) > 0
  )
  const insuranceCompany = payment?.insurance_company ? String(payment.insurance_company) : null
  const insurancePolicyNo = payment?.insurance_policy_no ? String(payment.insurance_policy_no) : null
  const claimIntimationNo = payment?.claim_intimation_no ? String(payment.claim_intimation_no) : null
  const billedTotal = Number(payment?.total_billed ?? pay.billed ?? 0)
  const doAmount = Number(payment?.do_amount ?? 0)
  const doRemaining = Number(payment?.do_remaining ?? doAmount)
  const isCashAccident = isAccidentalCase && doAmount === 0 && !insuranceCompany
  const customerDiff = Number(payment?.customer_diff_amount ?? (doAmount > 0 ? Math.max(0, billedTotal - doAmount) : billedTotal))
  const customerReceived = Number(payment?.customer_posted_amount ?? pay.received ?? 0)
  const customerRemaining = Number(payment?.customer_remaining_amount ?? Math.max(0, customerDiff - customerReceived))
  const isBillGenerated = billedTotal > 0 || customerDiff > 0 || (effectiveInvoiceNo.length > 0 && !effectiveInvoiceNo.includes('00000'))
  const isCustomerCleared = isBillGenerated && customerReceived > 0 && customerRemaining <= 0

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
          {isMechanicalVisit ? (
            mechCase ? (
              <MechanicalInvoicesContent
                mechCase={mechCase}
                jcLabel={`Job Card #${dash(mechCase.jc_number || selected?.jc_number)} · ${mechCase.service_type || 'Service'}`}
              />
            ) : (
              <CustomerCard>
                <Text className="text-slate-800 font-bold">Service billing</Text>
                <Text className="text-slate-600 text-[12px] mt-2 leading-5">
                  Billing details will appear after the workshop database update is applied (`customer_get_mechanical_case`).
                </Text>
              </CustomerCard>
            )
          ) : null}
          {!isMechanicalVisit && isAccidentalCase ? (
            /* ── DEDICATED BODYSHOP & INSURANCE CLAIM SETTLEMENT CARD ── */
            <CustomerCard>
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-1 pr-2">
                  <View className="flex-row items-center gap-1.5 mb-1">
                    <Text className="text-base">🛡️</Text>
                    <Text className="text-slate-900 text-[16px] font-black">
                      {isCashAccident ? 'Accident Repair (Cash / Direct Pay)' : 'Insurance Settlement'}
                    </Text>
                  </View>
                  <Text className="text-slate-500 text-[12px]">
                    Job Card #{dash(payment?.jc_number || pass?.job_card_no || selected?.jc_number)}
                    {insuranceCompany ? ` · ${insuranceCompany}` : isCashAccident ? ' · Cash Settlement' : ''}
                  </Text>
                </View>
                <View
                  className={`px-2.5 py-1 rounded-full ${
                    isCustomerCleared
                      ? 'bg-green-100'
                      : !isBillGenerated
                      ? 'bg-slate-100'
                      : customerReceived > 0
                      ? 'bg-amber-100'
                      : 'bg-blue-100'
                  }`}
                >
                  <Text
                    className={`text-[11px] font-black ${
                      isCustomerCleared
                        ? 'text-green-800'
                        : !isBillGenerated
                        ? 'text-slate-600'
                        : customerReceived > 0
                        ? 'text-amber-800'
                        : 'text-blue-800'
                    }`}
                  >
                    {isCustomerCleared
                      ? '✅ Customer Cleared'
                      : !isBillGenerated
                      ? '⏳ Bill Generating'
                      : customerReceived > 0
                      ? `⚡ Partially Paid (${formatInr(customerReceived)})`
                      : `⏳ Share Due (${formatInr(customerRemaining)})`}
                  </Text>
                </View>
              </View>

              {/* Insurance Policy & Claim Details Box */}
              {(insurancePolicyNo || claimIntimationNo || insuranceCompany) ? (
                <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
                  {insuranceCompany ? (
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="text-[11.5px] text-slate-500">Insurance Company</Text>
                      <Text className="text-[12px] font-bold text-slate-900">{insuranceCompany}</Text>
                    </View>
                  ) : null}
                  {insurancePolicyNo ? (
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="text-[11.5px] text-slate-500">Policy Number</Text>
                      <Text className="text-[12px] font-mono font-bold text-slate-800">{insurancePolicyNo}</Text>
                    </View>
                  ) : null}
                  {claimIntimationNo ? (
                    <View className="flex-row justify-between items-center">
                      <Text className="text-[11.5px] text-slate-500">Claim Intimation</Text>
                      <Text className="text-[12px] font-mono font-bold text-slate-800">{claimIntimationNo}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* 2-Tier Split: Total Bill vs DO vs Customer Liability */}
              <View className="bg-slate-50 rounded-xl p-3 mb-3 border border-slate-200/80">
                <View className="flex-row justify-between items-center pb-2.5 border-b border-slate-200">
                  <Text className="text-[13px] font-bold text-slate-800">Total Tax Invoice Billed</Text>
                  <Text className="text-[16px] font-black text-slate-900 font-mono">
                    {formatInr(Number(payment?.total_billed ?? pay.billed ?? 0))}
                  </Text>
                </View>

                {/* Insurance Share (DO) */}
                <View className="flex-row justify-between items-center py-2.5 border-b border-slate-200">
                  <View className="flex-1 pr-2">
                    <Text className="text-[12px] font-bold text-sky-900">🛡️ Insurance Share (DO Amount)</Text>
                    <Text className="text-[10.5px] text-slate-500">Payable directly by Insurance Company</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[14px] font-black text-sky-800 font-mono">
                      {formatInr(doAmount)}
                    </Text>
                    <Text className="text-[10px] text-slate-500">
                      Due: {formatInr(doRemaining)}
                    </Text>
                  </View>
                </View>

                {/* Customer Share (Diff / Excess) */}
                <View className="flex-row justify-between items-center pt-2.5">
                  <View className="flex-1 pr-2">
                    <Text className="text-[12px] font-bold text-slate-900">👤 Customer Share (Diff / Excess)</Text>
                    <Text className="text-[10.5px] text-slate-500">Compulsory excess, depreciation & file charges</Text>
                  </View>
                  <Text className="text-[15px] font-black text-slate-900 font-mono">
                    {formatInr(customerDiff)}
                  </Text>
                </View>
              </View>

              {/* Customer Share Clearance Breakdown */}
              <View className="flex-row bg-slate-100 rounded-xl py-3 mb-3 border border-slate-200/80">
                <MoneyCol label="Customer Share" value={formatInr(customerDiff)} />
                <MoneyCol
                  label="Customer Paid"
                  value={formatInr(customerReceived)}
                  color={customerReceived > 0 ? '#16a34a' : undefined}
                />
                <MoneyCol
                  label="Customer Remaining"
                  value={formatInr(customerRemaining)}
                  color={customerRemaining > 0 ? '#dc2626' : '#16a34a'}
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
                    💳 Customer Payment Receipts ({paymentList.length}):
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

              {latestInvoiceUrl ? (
                <TouchableOpacity
                  className="bg-blue-600 rounded-xl py-3 items-center mb-2"
                  onPress={() => void Linking.openURL(String(latestInvoiceUrl))}
                >
                  <Text className="text-white font-extrabold">📥 Download Tax Invoice</Text>
                </TouchableOpacity>
              ) : null}

              {isCustomerCleared ? (
                <View className="space-y-2">
                  <View className="bg-emerald-50 rounded-xl p-3 items-center border border-emerald-200">
                    <Text className="text-emerald-800 text-[13px] font-black text-center">
                      ✓ Customer Liability Paid · Official Gate Pass Ready!
                    </Text>
                    <Text className="text-emerald-700 text-[11.5px] mt-0.5 text-center">
                      Customer payment of {formatInr(customerReceived)} received. {doAmount > 0 ? `Insurance DO (${formatInr(doAmount)}) under settlement from insurer.` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    className="bg-emerald-600 active:bg-emerald-700 rounded-xl py-3.5 items-center mt-2 shadow-sm"
                    onPress={() => router.push('/(customer)/gatepass')}
                  >
                    <Text className="text-white font-black text-sm">🎟️ View & Print Official Gate Pass (PDF)</Text>
                  </TouchableOpacity>
                </View>
              ) : isBillGenerated ? (
                <View className="space-y-2">
                  <Text className="text-center text-slate-600 text-[12.5px] leading-5">
                    Please pay customer share balance of <Text className="font-extrabold text-slate-900">{formatInr(customerRemaining)}</Text> at workshop billing desk to release Gate Pass.
                  </Text>
                  <TouchableOpacity
                    className="bg-slate-900 rounded-xl py-3 items-center mt-1"
                    onPress={() => router.push('/(customer)/gatepass')}
                  >
                    <Text className="text-white font-extrabold text-xs">Check Gate Pass Status →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 items-center">
                  <Text className="text-slate-700 font-bold text-xs text-center">
                    ⏳ Vehicle repair is currently under progress.
                  </Text>
                  <Text className="text-slate-500 text-[11px] text-center mt-0.5">
                    Tax invoice, DO amount and customer liability will appear once Accounts generates the bill.
                  </Text>
                </View>
              )}
            </CustomerCard>
          ) : !isMechanicalVisit ? (
            /* ── STANDARD CASH / DIRECT SETTLEMENT SUMMARY CARD ── */
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
                <MoneyCol label="Total Billed" value={formatInr(pay.billed)} />
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
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push('/(customer)/estimate')}
                  className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 flex-row items-center justify-between"
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-[12.5px] font-bold text-blue-900">
                      📋 Workshop Quotation / Estimate ({estimates.length})
                    </Text>
                    <Text className="text-[11px] text-blue-700 mt-0.5">
                      To approve or reject parts & labour estimates, visit the Estimate tab.
                    </Text>
                  </View>
                  <Text className="text-blue-700 font-extrabold text-xs">Review ➔</Text>
                </TouchableOpacity>
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
          ) : null}

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
