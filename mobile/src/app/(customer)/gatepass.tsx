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
import { WorkshopQr } from '../../components/customer/WorkshopQr'

export default function CustomerGatePassScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [pass, setPass] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      setPass(await customerGetGatePass(token, selectedReg))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load gate pass.')
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg])

  useFocusEffect(
    useCallback(() => {
      void load()
      const timer = setInterval(() => {
        void load()
      }, 8000)
      return () => clearInterval(timer)
    }, [load])
  )

  const issued = Boolean(asText(pass?.gate_pass_no))
  const qrToken = asText(pass?.qr_token) || asText(pass?.qr)
  const billed = formatInr(pass?.billed_amount)
  const received = formatInr(pass?.amount_received)

  const sharePass = async () => {
    if (!pass) return
    setBusy(true)
    try {
      const message = [
        'OFFICIAL VEHICLE GATE PASS',
        `Pass #${asText(pass.gate_pass_no)}`,
        `Vehicle: ${asText(pass.reg_number) || selected?.reg_number || ''}`,
        `Customer: ${asText(pass.customer_name) || selected?.owner_name || ''}`,
        `Job Card: ${asText(pass.job_card_no) || selected?.jc_number || ''}`,
        asText(pass.invoice_no) ? `Invoice: ${asText(pass.invoice_no)}` : null,
        asText(pass.issued_by) ? `Authorized By: ${asText(pass.issued_by)}` : null,
        asText(pass.issued_at) ? `Issued At: ${formatWhen(pass.issued_at)}` : null,
        qrToken ? `Exit token: ${qrToken}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      const html = `<html><body style="font-family:sans-serif;padding:24px">
        <h2>Official Vehicle Gate Pass</h2>
        <pre style="font-size:14px">${message.replace(/</g, '&lt;')}</pre>
      </body></html>`
      const printed = await Print.printToFileAsync({ html })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(printed.uri)
      } else {
        await Share.share({ message })
      }
    } catch {
      await Share.share({
        message: `Gate Pass ${asText(pass.gate_pass_no)} · ${asText(pass.reg_number) || selected?.reg_number || ''}`,
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
        <TouchableOpacity onPress={() => void load()} className="border border-slate-200 bg-white px-3 py-1.5 rounded-lg">
          <Text className="text-[12px] font-bold">{loading ? 'Checking…' : '🔄 Refresh'}</Text>
        </TouchableOpacity>
      </View>
      {error ? <CustomerToast ok={false} message={error} /> : null}

      {loading && !pass ? (
        <ActivityIndicator color="#2563eb" />
      ) : (
        <>
          {!issued ? (
            <CustomerCard style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}>
              <View className="flex-row">
                <Text className="text-[26px] mr-3">⏳</Text>
                <View className="flex-1">
                  <Text className="text-[14px] font-extrabold text-amber-900">Gate Pass Under Clearance at Accounts Desk</Text>
                  <Text className="text-[12.5px] text-amber-800 mt-1 leading-5">
                    Your service intake & billing is being processed. Once the Accounts & Billing Desk verifies the settlement and generates the official Gate Pass, it will appear below
                    {` `}with the workshop exit code if they issued one.
                  </Text>
                  <Text className="text-[11.5px] font-bold text-amber-800 mt-2">🔄 Live syncing with Dealership Accounts Desk…</Text>
                </View>
              </View>
            </CustomerCard>
          ) : null}

          <CustomerCard
            style={{
              borderWidth: 2,
              borderColor: issued ? '#16a34a' : '#cbd5e1',
              backgroundColor: issued ? '#f0fdf4' : '#f8fafc',
            }}
          >
            <View className="flex-row justify-between items-start border-b border-slate-200 pb-3 mb-3">
              <View className="flex-1 pr-2">
                <Text className="text-[11px] font-extrabold text-blue-700 tracking-widest">
                  FIRST MOBITEL PVT. LTD. · AUTHORIZED TATA WORKSHOP
                </Text>
                <Text className="text-[16px] font-black text-slate-900 mt-1">OFFICIAL VEHICLE GATE PASS</Text>
              </View>
              <View className={`px-2 py-1 rounded-full ${issued ? 'bg-green-100' : 'bg-amber-100'}`}>
                <Text className={`text-[11px] font-bold ${issued ? 'text-green-800' : 'text-amber-800'}`}>
                  {issued ? '✅ VALID FOR VEHICLE EXIT' : '⏳ AWAITING ACCOUNTS CLEARANCE'}
                </Text>
              </View>
            </View>

            <View className="items-center py-3">
              {issued && qrToken ? (
                <WorkshopQr value={qrToken} />
              ) : (
                <View className="w-[140px] h-[140px] bg-slate-100 rounded-xl items-center justify-center">
                  <Text className="text-3xl">🔒</Text>
                  <Text className="text-[10px] font-bold text-slate-400 mt-1">
                    {issued ? 'NO QR ISSUED' : 'PENDING RELEASE'}
                  </Text>
                </View>
              )}
              <Text className={`mt-2 font-extrabold ${issued ? 'text-green-700' : 'text-slate-700'}`}>
                Pass #{issued ? asText(pass?.gate_pass_no) : 'GP-PENDING'}
              </Text>
            </View>

            <View className="bg-white border border-slate-200 rounded-xl p-3">
              <View className="flex-row mb-3">
                <Field label="Vehicle Reg:" value={asText(pass?.reg_number) || selected?.reg_number || '—'} mono />
                <Field label="Customer Name:" value={asText(pass?.customer_name) || selected?.owner_name || '—'} />
              </View>
              <View className="flex-row mb-3">
                <Field label="Job Card:" value={asText(pass?.job_card_no) || selected?.jc_number || '—'} mono />
                <Field label="Invoice / Settlement:" value={asText(pass?.invoice_no) || '—'} mono />
              </View>
              {billed || received ? (
                <View className="flex-row mb-3">
                  <Field label="Billed:" value={billed || '—'} mono />
                  <Field label="Received:" value={received || '—'} mono />
                </View>
              ) : null}
              <View className="border-t border-slate-100 pt-2">
                <Text className="text-slate-500 text-[12.5px]">Accounts Clearance Status:</Text>
                <Text className={`font-extrabold text-[13px] ${issued ? 'text-green-700' : 'text-red-600'}`}>
                  {issued
                    ? asText(pass?.payment_status)
                      ? `✓ ${String(pass?.payment_status).toUpperCase()} · ACCOUNTS CLEARED FOR DEPARTURE`
                      : '✓ GATE PASS ISSUED · ACCOUNTS CLEARED FOR DEPARTURE'
                    : '⏳ PENDING ACCOUNTS DESK RELEASE'}
                </Text>
              </View>
            </View>

            <Text className="text-center text-[11px] text-slate-500 mt-3">
              Authorized By: <Text className="font-bold">{dash(pass?.issued_by)}</Text> · Issued At:{' '}
              {issued ? dash(formatWhen(pass?.issued_at) || asText(pass?.issued_at)) : 'Pending'}
            </Text>

            {issued ? (
              <View className="mt-3">
                <PrimaryButton
                  label={busy ? 'Preparing pass…' : '📥 Download / Print Gate Pass'}
                  onPress={() => void sharePass()}
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

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-1 pr-2">
      <Text className="text-slate-500 text-[12.5px]">{label}</Text>
      <Text className={`font-extrabold ${mono ? 'text-sky-800' : 'text-slate-900'}`}>{dash(value)}</Text>
    </View>
  )
}
