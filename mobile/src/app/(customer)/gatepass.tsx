import { useCallback, useState } from 'react'
import { ActivityIndicator, Share, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import {
  CustomerCard,
  CustomerToast,
  PrimaryButton,
  asText,
  dash,
  formatInr,
  formatWhen,
} from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetGatePass } from '../../lib/api/customerPortal'

// Helper to check if date matches today's date in Asia/Kolkata
function isIssuedToday(dateString: string | null | undefined): boolean {
  if (!dateString) return false
  try {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const targetDate = new Date(dateString).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    return todayStr === targetDate
  } catch {
    return false
  }
}

export default function CustomerGatePassScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [pass, setPass] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setError(null)
    try {
      setPass(await customerGetGatePass(token, selectedReg))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load gate pass.')
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg])

  // Fast 3.5s auto-refresh
  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
      const timer = setInterval(() => {
        void load()
      }, 3500)
      return () => clearInterval(timer)
    }, [load])
  )

  const hasIssuedRecord = Boolean(asText(pass?.gate_pass_no))
  const issuedAtDate = asText(pass?.issued_at) || asText(selected?.invoice_done_at)
  const isExpired = hasIssuedRecord && issuedAtDate ? !isIssuedToday(issuedAtDate) : false

  const billedVal = Number(pass?.billed_amount ?? selected?.billed_amount ?? 0)
  const receivedVal = Number(pass?.amount_received ?? selected?.amount_received ?? 0)
  const remainingVal = Math.max(0, billedVal - receivedVal)

  // Valid gatepass requires: issued by accounts, not expired (issued today), and cleared settlement
  const isValidToday = hasIssuedRecord && !isExpired && (remainingVal === 0 || pass?.keep_on_credit || pass?.payment_status === 'Paid')

  const billed = formatInr(billedVal)
  const received = formatInr(receivedVal)
  const remaining = formatInr(remainingVal)

  const effectiveJcNumber = asText(pass?.job_card_no) || selected?.jc_number || '—'
  const effectiveReg = asText(pass?.reg_number) || selected?.reg_number || '—'
  const effectiveOwner = asText(pass?.customer_name) || selected?.owner_name || 'Customer'
  const effectiveSa = selected?.sa_display_name || selected?.sa_name || 'Service Advisor'
  const effectiveBranch = selected?.branch || 'Sitapura'
  const effectiveServiceType = selected?.service_type || 'Paid Service'
  const effectiveInvoiceNo = asText(pass?.invoice_no) || (selected?.invoice_done_at ? `INV-${effectiveJcNumber.replace(/[^A-Z0-9]/g, '')}` : '—')
  const effectiveInvoiceDate = asText(pass?.invoice_date) || (selected?.invoice_done_at ? new Date(selected.invoice_done_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
  const clearanceStatus = asText(pass?.settlement_reason) || (remainingVal === 0 ? 'Payment received' : asText(pass?.payment_status) || 'Accounts Cleared')

  // Generate official Workshop Gatepass HTML for Print / PDF export
  const generateOfficialGatepassHtml = () => {
    const printed = new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gatepass · ${effectiveJcNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 24px; line-height: 1.4; background: #fff; }
    .header-top { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin-bottom: 24px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    h1 { font-size: 20px; font-weight: 800; margin: 0 0 4px; letter-spacing: 0.04em; color: #000; text-transform: uppercase; }
    .sub { color: #555; margin: 0 0 16px; font-size: 12.5px; }
    .validity-tag { display: inline-block; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 4px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { text-align: left; padding: 7px 10px; border: 1px solid #d4d4d8; font-size: 12.5px; vertical-align: middle; }
    th { width: 32%; background: #f8fafc; font-weight: 600; color: #1e293b; }
    td { color: #0f172a; }
    .signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 48px; padding-top: 8px; }
    .signs div { border-top: 1px solid #111; padding-top: 6px; font-size: 11.5px; color: #333; font-weight: 500; text-align: center; }
    .actions { display: flex; gap: 8px; margin-bottom: 16px; }
    .btn { background: #0284c7; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }
    @media print {
      .actions { display: none !important; }
      body { margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button class="btn" onclick="window.print()">Print gatepass</button>
  </div>
  <h1>VEHICLE GATEPASS</h1>
  <p class="sub">Techwheels Service · Mechanical · Printed ${printed}</p>
  <div class="validity-tag">✓ Valid for 1 Day: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}</div>
  <table>
    <tr><th>Job card</th><td><strong>${effectiveJcNumber}</strong></td></tr>
    <tr><th>Registration</th><td><strong>${effectiveReg}</strong></td></tr>
    <tr><th>Owner</th><td>${effectiveOwner}</td></tr>
    <tr><th>Service / Branch / SA</th><td>${effectiveServiceType} · ${effectiveBranch} · ${effectiveSa}</td></tr>
    <tr><th>Invoice number</th><td>${effectiveInvoiceNo}</td></tr>
    <tr><th>Invoice date</th><td>${effectiveInvoiceDate}</td></tr>
    <tr><th>Billed amount</th><td>₹${billedVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
    <tr><th>Amount received</th><td>₹${receivedVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
    <tr><th>Remaining</th><td>₹${remainingVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
    <tr><th>Payment status</th><td><span style="font-weight: 600; color: #16a34a;">${remainingVal === 0 ? 'received' : 'pending'}</span></td></tr>
    <tr><th>Gatepass clearance</th><td><strong style="color: #15803d;">${clearanceStatus}</strong></td></tr>
  </table>
  <div class="signs">
    <div>Accounts</div>
    <div>Security / Gate</div>
    <div>Customer</div>
  </div>
</body>
</html>`
  }

  // Print or Download Official PDF
  const handlePrintOrDownloadPdf = async () => {
    if (!isValidToday) return
    setBusy(true)
    try {
      const html = generateOfficialGatepassHtml()
      const printed = await Print.printToFileAsync({ html })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(printed.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Gate Pass - ${effectiveReg}`,
          UTI: 'com.adobe.pdf',
        })
      } else {
        await Print.printAsync({ html })
      }
    } catch (err) {
      console.error('Print error:', err)
      await Share.share({
        message: `Official Vehicle Gate Pass #${asText(pass?.gate_pass_no)} for ${effectiveReg} (Job Card: ${effectiveJcNumber}). Status: Accounts Cleared. Valid Today Only.`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <CustomerScreen
      title="Digital Gate Pass"
      subtitle="Official dealership vehicle departure authorization issued by Accounts Desk"
    >
      <View className="flex-row justify-end mb-3">
        <TouchableOpacity onPress={() => void load()} className="border border-slate-200 bg-white px-3 py-1.5 rounded-xl shadow-xs">
          <Text className="text-[12px] font-bold text-slate-700">{loading ? 'Checking…' : '🔄 Refresh'}</Text>
        </TouchableOpacity>
      </View>
      {error ? <CustomerToast ok={false} message={error} /> : null}

      {loading && !pass ? (
        <ActivityIndicator color="#2563eb" className="py-8" />
      ) : (
        <>
          {/* EXPIRED GATE PASS NOTICE (IF ISSUED ON PREVIOUS DAY) */}
          {isExpired ? (
            <CustomerCard style={{ backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
              <View className="flex-row">
                <Text className="text-[26px] mr-3">⚠️</Text>
                <View className="flex-1">
                  <Text className="text-[14px] font-extrabold text-red-900">Gate Pass Expired (Valid For 1 Day Only)</Text>
                  <Text className="text-[12.5px] text-red-800 mt-1 leading-5">
                    Vehicle Gate Pass is only valid for the day it is issued. Since this pass was issued on {formatWhen(issuedAtDate)}, please request the Accounts Desk to re-issue a fresh Gate Pass for today.
                  </Text>
                </View>
              </View>
            </CustomerCard>
          ) : null}

          {/* PENDING ACCOUNTS RELEASE NOTICE */}
          {!isValidToday && !isExpired ? (
            <CustomerCard style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}>
              <View className="flex-row">
                <Text className="text-[26px] mr-3">⏳</Text>
                <View className="flex-1">
                  <Text className="text-[14px] font-extrabold text-amber-900">Gate Pass Under Clearance at Accounts Desk</Text>
                  <Text className="text-[12.5px] text-amber-800 mt-1 leading-5">
                    Your vehicle settlement is under review. Gate pass will be unlocked once total payment is verified (Billed: {billed}, Received: {received}, Remaining: {remaining}) and released by the Accounts Desk for today's departure.
                  </Text>
                  <Text className="text-[11.5px] font-bold text-amber-800 mt-2">🔄 Live syncing with Dealership Accounts Desk…</Text>
                </View>
              </View>
            </CustomerCard>
          ) : null}

          {/* Official Vehicle Gatepass Document Card (Matching Workshop Design) */}
          <CustomerCard
            style={{
              borderWidth: 2,
              borderColor: isValidToday ? '#16a34a' : '#cbd5e1',
              backgroundColor: '#ffffff',
            }}
          >
            {/* Header Document Kicker */}
            <View className="border-b border-slate-200 pb-3 mb-3">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-[10px] font-extrabold text-blue-700 tracking-wider">
                    TECHWHEELS SERVICE · MECHANICAL
                  </Text>
                  <Text className="text-[17px] font-black text-slate-900 mt-0.5 tracking-tight">
                    VEHICLE GATEPASS
                  </Text>
                </View>
                <View className={`px-2.5 py-1 rounded-full ${isValidToday ? 'bg-green-100' : isExpired ? 'bg-red-100' : 'bg-amber-100'}`}>
                  <Text className={`text-[11px] font-extrabold ${isValidToday ? 'text-green-800' : isExpired ? 'text-red-800' : 'text-amber-800'}`}>
                    {isValidToday ? '✅ VALID FOR VEHICLE EXIT TODAY' : isExpired ? '❌ EXPIRED' : '⏳ AWAITING CLEARANCE'}
                  </Text>
                </View>
              </View>
              <Text className="text-slate-500 text-[11px] mt-1">
                Pass #{isValidToday ? asText(pass?.gate_pass_no) : 'GP-PENDING'} · Valid: 1 Day Only ({new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })})
              </Text>
            </View>

            {/* Official Gatepass Data Table */}
            <View className="border border-slate-200 rounded-xl overflow-hidden mb-4 bg-slate-50/50">
              <Row label="Job card" value={effectiveJcNumber} isBold mono />
              <Row label="Registration" value={effectiveReg} isBold mono />
              <Row label="Owner" value={effectiveOwner} />
              <Row label="Service / Branch / SA" value={`${effectiveServiceType} · ${effectiveBranch} · ${effectiveSa}`} />
              <Row label="Invoice number" value={effectiveInvoiceNo} mono />
              <Row label="Invoice date" value={effectiveInvoiceDate} />
              <Row label="Billed amount" value={billed} mono />
              <Row label="Amount received" value={received} mono />
              <Row label="Remaining" value={remaining} mono />
              <Row
                label="Payment status"
                value={remainingVal === 0 ? 'received' : 'pending'}
                color={remainingVal === 0 ? '#16a34a' : '#d97706'}
                isBold
              />
              <Row
                label="Gatepass clearance"
                value={isValidToday ? clearanceStatus : 'Pending Accounts Verification'}
                color={isValidToday ? '#15803d' : '#d97706'}
                isBold
                isLast
              />
            </View>

            {/* 3 Signature Blocks */}
            <View className="flex-row justify-between border-t border-slate-200 pt-4 px-1 mb-4">
              <View className="flex-1 items-center">
                <View className="w-16 border-t-2 border-slate-900 pt-1">
                  <Text className="text-[11px] font-bold text-slate-700 text-center">Accounts</Text>
                </View>
              </View>
              <View className="flex-1 items-center">
                <View className="w-20 border-t-2 border-slate-900 pt-1">
                  <Text className="text-[11px] font-bold text-slate-700 text-center">Security / Gate</Text>
                </View>
              </View>
              <View className="flex-1 items-center">
                <View className="w-16 border-t-2 border-slate-900 pt-1">
                  <Text className="text-[11px] font-bold text-slate-700 text-center">Customer</Text>
                </View>
              </View>
            </View>

            {/* Print / Download Action */}
            {isValidToday ? (
              <View className="mt-2">
                <PrimaryButton
                  label={busy ? 'Preparing PDF…' : '🖨️ Print / Download Gate Pass (PDF)'}
                  onPress={() => void handlePrintOrDownloadPdf()}
                  loading={busy}
                />
              </View>
            ) : null}
          </CustomerCard>
        </>
      )}
    </CustomerScreen>
  )
}

function Row({
  label,
  value,
  isBold,
  mono,
  color,
  isLast,
}: {
  label: string
  value: string
  isBold?: boolean
  mono?: boolean
  color?: string
  isLast?: boolean
}) {
  return (
    <View
      className={`flex-row justify-between py-2 px-3 items-center ${
        !isLast ? 'border-b border-slate-200' : ''
      }`}
    >
      <Text className="text-[12px] font-semibold text-slate-600 w-[38%]">{label}</Text>
      <Text
        className={`text-[12.5px] text-right flex-1 ${isBold ? 'font-black' : 'font-medium'} ${
          mono ? 'font-mono' : ''
        }`}
        style={color ? { color } : { color: '#0f172a' }}
      >
        {dash(value)}
      </Text>
    </View>
  )
}
