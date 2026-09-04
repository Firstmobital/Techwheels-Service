import { useEffect, useState } from 'react'
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native'
import {
  applyDmsInvoiceAndAlignPayer,
  getBodyshopSettlement,
  mergeSettlementCard,
  postCustomerAmount,
  postDoRelease,
  reverseSettlementLine,
  settlementStatusLabel,
  upsertBodyshopSettlementHeader,
  type SettlementCardCache,
  type SettlementPayload,
} from '../lib/api/bodyshopSettlement'

function inr(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function numOrNull(raw: string) {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function textOrNull(raw: string) {
  const t = raw.trim()
  return t || null
}

function lineRefRemark(line: { reference?: string | null; remarks?: string | null }) {
  const a = String(line.reference ?? '').trim()
  const b = String(line.remarks ?? '').trim()
  if (a && b && a !== b) return `${a} · ${b}`
  return a || b || '—'
}

const pillColor = (status: string | null | undefined) => {
  const v = String(status ?? 'pending').toLowerCase()
  if (v === 'received') return { bg: '#e4f4ec', fg: '#1c8f63' }
  if (v === 'partial') return { bg: '#e9effe', fg: '#2a4cd0' }
  if (v === 'not_received') return { bg: '#fbe9ec', fg: '#c33b53' }
  return { bg: '#fbefdd', fg: '#c9751b' }
}

export function BodyshopSettlementBilling<T extends SettlementCardCache>({
  card,
  styles,
  onCardChange,
  onToast,
}: {
  card: T
  styles: Record<string, any>
  onCardChange: (next: T) => void
  onToast: (msg: string, type: 'success' | 'error') => void
}) {
  const [payload, setPayload] = useState<SettlementPayload | null>(null)
  const [partsStatus, setPartsStatus] = useState(card.parts_entry_status ?? 'pending')
  const [invoiceAmount, setInvoiceAmount] = useState(card.billed_amount != null ? String(card.billed_amount) : '')
  const [doStatus, setDoStatus] = useState(card.do_status ?? 'pending')
  const [doAmount, setDoAmount] = useState(card.do_amount != null ? String(card.do_amount) : '')
  const [mainAmt, setMainAmt] = useState('')
  const [gstAmt, setGstAmt] = useState('')
  const [tdsAmt, setTdsAmt] = useState('')
  const [custAmt, setCustAmt] = useState('')
  const [doNote, setDoNote] = useState('')
  const [custNote, setCustNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const next = await getBodyshopSettlement(card.id)
      setPayload(next)
      const h = next.header
      const c = next.card
      setPartsStatus(String(c.parts_entry_status ?? card.parts_entry_status ?? 'pending'))
      const billed = c.billed_amount ?? h?.invoice_amount ?? card.billed_amount
      setInvoiceAmount(billed != null ? String(billed) : '')
      setDoStatus(String(c.do_status ?? h?.do_status ?? card.do_status ?? 'pending'))
      const dAmt = c.do_amount ?? h?.do_amount ?? card.do_amount
      setDoAmount(dAmt != null ? String(dAmt) : '')
      onCardChange(mergeSettlementCard(card, next))
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to load settlement', 'error')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  const header = payload?.header
  const kind = header?.customer_settlement_kind ?? card.customer_settlement_kind
  const kindLabel = kind === 'refund' ? 'Customer Refund' : kind === 'none' ? 'Settled' : 'Recoverable from customer'

  async function saveHeader() {
    const nextDoAmt = numOrNull(doAmount)
    if (doStatus === 'received' && nextDoAmt == null) {
      onToast('DO Amount is required when DO Status is Received', 'error')
      return
    }
    setBusy(true)
    try {
      const next = await upsertBodyshopSettlementHeader({
        repairCardId: card.id,
        partsEntryStatus: partsStatus,
        invoiceAmount: numOrNull(invoiceAmount),
        doAmount: nextDoAmt,
        doStatus,
      })
      setPayload(next)
      onCardChange(mergeSettlementCard(card, next))
      onToast('Billing saved', 'success')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function useDmsInvoice() {
    const inv = payload?.suggested_invoice
    if (!inv?.total_invoice_amount) {
      onToast('No DMS invoice found for this job card', 'error')
      return
    }
    setBusy(true)
    try {
      const { payload: next, card: aligned } = await applyDmsInvoiceAndAlignPayer({
        card,
        invoice: inv,
        partsEntryStatus: partsStatus,
        doAmount: numOrNull(doAmount),
        doStatus,
      })
      setPayload(next)
      setInvoiceAmount(String(inv.total_invoice_amount))
      onCardChange(aligned)
      onToast(
        inv.account
          ? 'Invoice attached. Policy company set to DMS bill-to.'
          : `Attached invoice ${inv.invoice_number ?? ''}`.trim(),
        'success',
      )
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not attach DMS invoice', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveDo() {
    const main = numOrNull(mainAmt)
    const gst = numOrNull(gstAmt)
    const tds = numOrNull(tdsAmt)
    if ((main ?? 0) + (gst ?? 0) + (tds ?? 0) <= 0) {
      onToast('Enter Main, GST or TDS', 'error')
      return
    }
    setBusy(true)
    try {
      const note = textOrNull(doNote)
      const next = await postDoRelease({
        repairCardId: card.id,
        mainAmount: main,
        gstAmount: gst,
        tdsAmount: tds,
        reference: note,
        remarks: note,
      })
      setPayload(next)
      onCardChange(mergeSettlementCard(card, next))
      setMainAmt('')
      setGstAmt('')
      setTdsAmt('')
      setDoNote('')
      onToast('DO payment posted', 'success')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'DO payment failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveCustomer() {
    const amt = numOrNull(custAmt)
    if (amt == null || amt <= 0) {
      onToast(kind === 'refund' ? 'Enter refund amount' : 'Enter amount received from customer', 'error')
      return
    }
    setBusy(true)
    try {
      const note = textOrNull(custNote)
      const next = await postCustomerAmount({
        repairCardId: card.id,
        amount: amt,
        reference: note,
        remarks: note,
      })
      setPayload(next)
      onCardChange(mergeSettlementCard(card, next))
      setCustAmt('')
      setCustNote('')
      onToast(kind === 'refund' ? 'Refund posted' : 'Customer receipt posted', 'success')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Customer post failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  function reverseLine(id: number) {
    Alert.alert('Reverse line', 'Post a reversal for this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reverse',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const next = await reverseSettlementLine(id, 'reversed from mobile Billing')
              setPayload(next)
              onCardChange(mergeSettlementCard(card, next))
              onToast('Line reversed', 'success')
            } catch (e) {
              onToast(e instanceof Error ? e.message : 'Reverse failed', 'error')
            }
          })()
        },
      },
    ])
  }

  const doPay = header?.do_payment_status ?? card.do_payment_status
  const custPay = header?.customer_payment_status ?? card.customer_payment_status
  const doPill = pillColor(doPay)
  const custPill = pillColor(custPay)

  return (
    <>
      <Text style={styles.sectionTitle}>Billing & DO</Text>
      {payload?.payer_mismatch ? (
        <Text style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>
          Policy on card: {card.insurance_company || '—'} · DMS bill-to: {payload.suggested_invoice?.account || '—'}
        </Text>
      ) : null}
      {header?.needs_accounts_review ? (
        <Text style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>Old Payment Received had no posted lines. Statuses stay Pending until amounts are posted.</Text>
      ) : null}
      <View style={styles.formCard}>
        <Text style={styles.fieldLabel}>Parts Entry Status</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {['pending', 'entered', 'billed'].map((s) => {
            const active = partsStatus === s
            return (
              <TouchableOpacity key={s} onPress={() => setPartsStatus(s)}>
                <View style={[styles.chip, active && { backgroundColor: '#2a4cd0', borderColor: '#2a4cd0' }]}>
                  <Text style={[styles.chipText, active && { color: '#fff' }]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
        <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Invoice / Billed Amount (₹)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={invoiceAmount} onChangeText={setInvoiceAmount} placeholder="0" placeholderTextColor="#a7a99f" />
        {payload?.suggested_invoice?.total_invoice_amount != null && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.fieldLabel}>DMS invoice</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21' }}>
              {payload.suggested_invoice.invoice_number ?? '—'}
              {payload.suggested_invoice.account ? ` · ${payload.suggested_invoice.account}` : ''}
            </Text>
            {card.insurance_company ? (
              <Text style={{ fontSize: 12, color: '#82858f', marginTop: 4 }}>Policy on card: {card.insurance_company}</Text>
            ) : null}
            <TouchableOpacity onPress={() => void useDmsInvoice()} disabled={busy} style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#2a4cd0' }}>Use DMS invoice</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={[styles.fieldLabel, { marginTop: 10 }]}>DO Status</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {['pending', 'received', 'not_received'].map((s) => {
            const active = doStatus === s
            return (
              <TouchableOpacity key={s} onPress={() => setDoStatus(s)}>
                <View style={[styles.chip, active && { backgroundColor: '#1c8f63', borderColor: '#1c8f63' }]}>
                  <Text style={[styles.chipText, active && { color: '#fff' }]}>{s === 'not_received' ? 'Not received' : s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
        <Text style={[styles.fieldLabel, { marginTop: 8 }]}>DO Amount (₹)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={doAmount} onChangeText={setDoAmount} placeholder="0" placeholderTextColor="#a7a99f" />
        {(header?.do_amount ?? card.do_amount) != null && (
          <>
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Customer Diff</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21', marginBottom: 10 }}>
              {inr(header?.customer_diff_amount ?? card.customer_diff_amount)} · {kindLabel}
            </Text>
          </>
        )}
        <TouchableOpacity onPress={() => void saveHeader()} disabled={busy} style={styles.saveBtnSmall}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Saving…' : 'Save Billing & DO'}</Text>
        </TouchableOpacity>
      </View>

      {(header?.do_amount ?? card.do_amount) != null && (
      <>
      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Stage 18 · DO Payment</Text>
      <View style={styles.formCard}>
        <View style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: doPill.bg, borderColor: doPill.fg, marginBottom: 10 }]}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: doPill.fg }}>{settlementStatusLabel(doPay)}</Text>
        </View>
        <Text style={{ fontSize: 12, color: '#82858f', marginBottom: 8 }}>Insurance due {inr(header?.insurance_due_amount)}</Text>
        {String(doPay ?? '').toLowerCase() === 'received' ? (
          <Text style={{ fontSize: 13, color: '#82858f' }}>DO is fully posted. Who and when for each line are in Posted entries.</Text>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Main (₹)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={mainAmt} onChangeText={setMainAmt} placeholder="0" placeholderTextColor="#a7a99f" />
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>GST (₹)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={gstAmt} onChangeText={setGstAmt} placeholder="0" placeholderTextColor="#a7a99f" />
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>TDS (₹)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={tdsAmt} onChangeText={setTdsAmt} placeholder="0" placeholderTextColor="#a7a99f" />
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Reference / Remark</Text>
            <TextInput style={styles.input} value={doNote} onChangeText={setDoNote} placeholder="UTR, cheque, or note" placeholderTextColor="#a7a99f" />
            <Text style={{ fontSize: 12, color: '#82858f', marginVertical: 8 }}>Post any combination. Each save stores who posted it, when, and this reference.</Text>
            <TouchableOpacity onPress={() => void saveDo()} disabled={busy} style={styles.saveBtnSmall}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Post DO payment</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Stage 18 · Customer Diff Payment</Text>
      <View style={styles.formCard}>
        <View style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: custPill.bg, borderColor: custPill.fg, marginBottom: 10 }]}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: custPill.fg }}>{settlementStatusLabel(custPay)} · {kindLabel}</Text>
        </View>
        {kind === 'none' || String(custPay ?? '').toLowerCase() === 'received' ? (
          <Text style={{ fontSize: 13, color: '#82858f' }}>
            {kind === 'none' ? 'Nothing to collect or refund.' : 'Customer side is fully posted. Who and when for each line are in Posted entries.'}
          </Text>
        ) : (
          <>
            <Text style={styles.fieldLabel}>{kind === 'refund' ? 'Amount refunded (₹)' : 'Amount received from customer (₹)'}</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={custAmt} onChangeText={setCustAmt} placeholder="0" placeholderTextColor="#a7a99f" />
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Reference / Remark</Text>
            <TextInput style={styles.input} value={custNote} onChangeText={setCustNote} placeholder="UTR, cheque, or note" placeholderTextColor="#a7a99f" />
            <Text style={{ fontSize: 12, color: '#82858f', marginVertical: 8 }}>Remaining {inr(header?.customer_remaining_amount)}</Text>
            <TouchableOpacity onPress={() => void saveCustomer()} disabled={busy} style={styles.saveBtnSmall}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{kind === 'refund' ? 'Post refund' : 'Post customer receipt'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Posted entries</Text>
      <View style={styles.formCard}>
        {(payload?.lines ?? []).length === 0 ? (
          <Text style={{ fontSize: 13, color: '#82858f' }}>No payment lines yet.</Text>
        ) : (
          (payload?.lines ?? []).map((line) => (
            <View key={line.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f6f4ee', opacity: line.is_reversed || line.line_type === 'reversal' ? 0.5 : 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1a1b21' }}>{line.component} · {inr(line.amount)}</Text>
              <Text style={{ fontSize: 11, color: '#82858f' }}>{line.created_at ? new Date(line.created_at).toLocaleString('en-IN') : ''}{line.actor_email ? ` · ${line.actor_email}` : ''}</Text>
              <Text style={{ fontSize: 12, color: '#4b4e59', marginTop: 2 }}>Ref: {lineRefRemark(line)}</Text>
              {!line.is_reversed && line.line_type !== 'reversal' ? (
                <TouchableOpacity onPress={() => reverseLine(line.id)}>
                  <Text style={{ fontSize: 12, color: '#c33b53', fontWeight: '700', marginTop: 4 }}>Reverse</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </View>
      </>
      )}
    </>
  )
}
