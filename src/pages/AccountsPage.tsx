import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { BodyshopSettlementPanel } from '../components/BodyshopSettlementPanel'
import {
  ACCOUNTS_PAYMENT_MODES,
  addAccountsMechanicalPayment,
  deleteAccountsMechanicalInvoiceFile,
  isAccountsStatusPending,
  isAccountsStatusReceived,
  isCustomerPaymentClosed,
  isMechanicalPaymentClosed,
  listAccountsBodyshopCases,
  listAccountsMechanicalCases,
  listAccountsMechanicalPaymentLines,
  listAccountsMechanicalPayments,
  lookupAccountsMechanicalDmsInvoice,
  mechanicalDraftRowRemaining,
  mechanicalDraftsFitRemaining,
  mechanicalInvoiceAmountPrefill,
  asiaKolkataTodayDate,
  mechanicalInvoiceDateInputValue,
  mechanicalPaymentReceivedDate,
  mechanicalRemaining,
  openBodyshopGatepass,
  openMechanicalGatepass,
  openMechanicalInvoiceFile,
  paymentModeLabel,
  settlementCardFromAccountsRow,
  sumAccountsPaymentModeTotals,
  upsertAccountsMechanicalInvoice,
  type AccountsBodyshopCase,
  type AccountsMechanicalCase,
  type AccountsMechanicalPayment,
  type AccountsPaymentMode,
  type MechanicalDmsInvoiceLookup,
} from '../lib/api/accounts'
import { uploadServiceAdvisorInvoice } from '../lib/api/reception'
import { supabase } from '../lib/supabase'
import type { RepairCard } from '../lib/api/bodyshopRepair'
import { settlementStatusLabel } from '../lib/api/bodyshopSettlement'
import { issueAccountsGatePass } from '../lib/gatepass'

type Section = 'mechanical' | 'bodyshop'
type BodyshopFilter = 'remaining' | 'all' | 'received' | 'pending'
type MechanicalStatusFilter = 'all' | 'pending' | 'received'

type MechanicalPaymentDraft = {
  key: string
  amount: string
  paymentMode: AccountsPaymentMode
  paymentReceivedDate: string
  paymentReference: string
}

let paymentDraftSeq = 0

function emptyMechanicalPaymentDraft(): MechanicalPaymentDraft {
  paymentDraftSeq += 1
  return {
    key: `pay-${paymentDraftSeq}`,
    amount: '',
    paymentMode: 'cash',
    paymentReceivedDate: asiaKolkataTodayDate(),
    paymentReference: '',
  }
}

function inr(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function inrKpi(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  const whole = Math.abs(n - Math.round(n)) < 0.005
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`
}

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(`${String(iso).slice(0, 10)}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

function dateParts(iso: string | null | undefined): { year: number; month: number } {
  if (!iso) return { year: 0, month: 0 }
  const [y, m] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m) return { year: 0, month: 0 }
  return { year: y, month: m }
}

function monthLabel(year: number, month: number) {
  if (!year || !month) return 'No date'
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function kindLabel(kind: string | null | undefined) {
  const v = String(kind ?? '').toLowerCase()
  if (v === 'refund') return 'Refund'
  if (v === 'none') return 'Settled'
  if (v === 'due') return 'Due'
  return '—'
}

function bodyshopOutstanding(row: Pick<AccountsBodyshopCase, 'outstanding_amount' | 'insurance_due_amount' | 'customer_remaining_amount'>): number {
  if (row.outstanding_amount != null) return Number(row.outstanding_amount)
  return Number(row.insurance_due_amount ?? 0) + Number(row.customer_remaining_amount ?? 0)
}

function bodyshopOverallStatus(row: Pick<AccountsBodyshopCase, 'derived_payment_status'>): string {
  return String(row.derived_payment_status ?? 'pending').toLowerCase()
}

function isBodyshopOverallReceived(row: Pick<AccountsBodyshopCase, 'derived_payment_status'>): boolean {
  return bodyshopOverallStatus(row) === 'received'
}

function isBodyshopOutstandingOpen(row: Pick<AccountsBodyshopCase, 'outstanding_amount' | 'insurance_due_amount' | 'customer_remaining_amount'>): boolean {
  return bodyshopOutstanding(row) > 0
}

function blobOf(...parts: Array<string | number | null | undefined>) {
  return parts.map((p) => String(p ?? '').toLowerCase()).join(' ')
}

function numOrNull(raw: string) {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function KpiTile({
  label,
  value,
  active,
  onClick,
  title,
}: {
  label: string
  value: string | number
  active?: boolean
  onClick?: () => void
  title?: string
}) {
  const className = `brx-recov-kpi${active ? ' is-active' : ''}${onClick ? '' : ' is-static'}`
  const body = (
    <>
      <span className="brx-recov-kpi__l">{label}</span>
      <span className="brx-recov-kpi__v">{value}</span>
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title}>
        {body}
      </button>
    )
  }
  return (
    <div className={className} title={title}>
      {body}
    </div>
  )
}

export default function AccountsPage() {
  const [section, setSection] = useState<Section>('mechanical')
  const [mechRows, setMechRows] = useState<AccountsMechanicalCase[]>([])
  const [bsRows, setBsRows] = useState<AccountsBodyshopCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState<number | 'all'>('all')
  const [month, setMonth] = useState<number | 'all'>('all')
  const [bsFilter, setBsFilter] = useState<BodyshopFilter>('remaining')
  const [mechStatusFilter, setMechStatusFilter] = useState<MechanicalStatusFilter>('all')
  const [mechPayLines, setMechPayLines] = useState<AccountsMechanicalPayment[]>([])

  const [editRow, setEditRow] = useState<AccountsMechanicalCase | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [billedAmount, setBilledAmount] = useState('')
  const [paymentDrafts, setPaymentDrafts] = useState<MechanicalPaymentDraft[]>(() => [emptyMechanicalPaymentDraft()])
  const [payLines, setPayLines] = useState<AccountsMechanicalPayment[]>([])
  const [saving, setSaving] = useState(false)
  const [postingPay, setPostingPay] = useState(false)
  const [uploadingInvoice, setUploadingInvoice] = useState(false)
  const [deletingInvoice, setDeletingInvoice] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [dmsLookup, setDmsLookup] = useState<MechanicalDmsInvoiceLookup | null>(null)
  const [loadingDms, setLoadingDms] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [postRow, setPostRow] = useState<AccountsBodyshopCase | null>(null)
  const [postCard, setPostCard] = useState<RepairCard | null>(null)
  const [gatepassConfirmTarget, setGatepassConfirmTarget] = useState<{
    type: 'mechanical' | 'bodyshop'
    mechRow?: AccountsMechanicalCase
    bsRow?: AccountsBodyshopCase
  } | null>(null)
  const [issuingGatepass, setIssuingGatepass] = useState(false)

  function flash(msg: string, ok = true) {
    setToast({ msg, ok })
    window.setTimeout(() => setToast(null), 4000)
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [mech, bs, lines] = await Promise.all([
        listAccountsMechanicalCases(),
        listAccountsBodyshopCases(),
        listAccountsMechanicalPaymentLines().catch(() => [] as AccountsMechanicalPayment[]),
      ])
      setMechRows(mech)
      setBsRows(bs)
      setMechPayLines(lines)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Accounts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    async function checkAdmin() {
      try {
        const { data: session } = await supabase.auth.getSession()
        if (!session?.session?.user) return
        const { data: profile } = await supabase
          .from('users')
          .select('role, is_active')
          .eq('id', session.session.user.id)
          .maybeSingle()
        const role = String(profile?.role ?? '').trim().toLowerCase()
        const isActive = profile?.is_active === true
        setIsAdmin((role === 'admin' || role === 'super_admin') && isActive)
      } catch {
        setIsAdmin(false)
      }
    }
    void checkAdmin()
  }, [])

  const periodSource = section === 'mechanical'
    ? mechRows.map((r) => r.invoice_done_at)
    : bsRows.map((r) => r.invoice_date)

  const years = useMemo(() => {
    const map = new Map<number, number>()
    for (const iso of periodSource) {
      const { year: y } = dateParts(iso)
      map.set(y, (map.get(y) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([y, count]) => ({ year: y, count }))
      .sort((a, b) => b.year - a.year)
  }, [periodSource])

  const yearScopedMech = useMemo(() => {
    if (year === 'all') return mechRows
    return mechRows.filter((r) => dateParts(r.invoice_done_at).year === year)
  }, [mechRows, year])

  const yearScopedBs = useMemo(() => {
    if (year === 'all') return bsRows
    return bsRows.filter((r) => dateParts(r.invoice_date).year === year)
  }, [bsRows, year])

  const months = useMemo(() => {
    const rows = section === 'mechanical' ? yearScopedMech : yearScopedBs
    const map = new Map<number, number>()
    for (const r of rows) {
      const iso = section === 'mechanical'
        ? (r as AccountsMechanicalCase).invoice_done_at
        : (r as AccountsBodyshopCase).invoice_date
      const { month: m } = dateParts(iso)
      map.set(m, (map.get(m) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([m, count]) => ({ month: m, count }))
      .sort((a, b) => a.month - b.month)
  }, [section, yearScopedMech, yearScopedBs])

  const periodMech = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = year === 'all' ? mechRows : yearScopedMech
    if (month !== 'all') rows = rows.filter((r) => dateParts(r.invoice_done_at).month === month)
    if (!q) return rows
    return rows.filter((r) => blobOf(r.jc_number, r.reg_number, r.invoice_number, r.owner_name, r.sa_name).includes(q))
  }, [mechRows, yearScopedMech, year, month, search])

  const searchedMech = useMemo(() => {
    if (mechStatusFilter === 'pending') return periodMech.filter((r) => isAccountsStatusPending(r.payment_status))
    if (mechStatusFilter === 'received') return periodMech.filter((r) => isAccountsStatusReceived(r.payment_status))
    return periodMech
  }, [periodMech, mechStatusFilter])

  const periodBs = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = year === 'all' ? bsRows : yearScopedBs
    if (month !== 'all') rows = rows.filter((r) => dateParts(r.invoice_date).month === month)
    if (q) rows = rows.filter((r) => blobOf(r.job_card_no, r.reg_number, r.invoice_number, r.customer_name, r.sa_name).includes(q))
    return rows
  }, [bsRows, yearScopedBs, year, month, search])

  const searchedBs = useMemo(() => {
    if (bsFilter === 'remaining') return periodBs.filter((r) => isBodyshopOutstandingOpen(r))
    if (bsFilter === 'received') return periodBs.filter((r) => isBodyshopOverallReceived(r))
    if (bsFilter === 'pending') {
      return periodBs.filter((r) => isAccountsStatusPending(r.derived_payment_status))
    }
    return periodBs
  }, [periodBs, bsFilter])

  const mechKpis = useMemo(() => {
    const pending = periodMech.filter((r) => isAccountsStatusPending(r.payment_status)).length
    const received = periodMech.filter((r) => isAccountsStatusReceived(r.payment_status)).length
    const billed = periodMech.reduce((s, r) => s + Number(r.billed_amount ?? 0), 0)
    const remaining = periodMech.reduce((s, r) => s + Number(mechanicalRemaining(r) ?? 0), 0)
    const scopedIds = new Set(periodMech.map((r) => r.reception_entry_id))
    const modes = sumAccountsPaymentModeTotals(
      mechPayLines.filter((line) => scopedIds.has(line.reception_entry_id)),
    )
    return { count: periodMech.length, pending, received, billed, remaining, ...modes }
  }, [periodMech, mechPayLines])

  const bsKpis = useMemo(() => {
    const remainingRows = periodBs.filter((r) => isBodyshopOutstandingOpen(r))
    const remaining = remainingRows.reduce((s, r) => s + bodyshopOutstanding(r), 0)
    const pending = periodBs.filter((r) => isAccountsStatusPending(r.derived_payment_status)).length
    const received = periodBs.filter((r) => isBodyshopOverallReceived(r)).length
    const billed = periodBs.reduce((s, r) => s + Number(r.invoice_amount ?? r.billed_amount ?? 0), 0)
    return {
      remaining,
      pending,
      received,
      billed,
      billedCount: periodBs.length,
    }
  }, [periodBs])

  function patchMechRow(saved: AccountsMechanicalCase) {
    setMechRows((prev) => prev.map((r) => (r.reception_entry_id === saved.reception_entry_id ? { ...r, ...saved } : r)))
    setEditRow((prev) => (prev && prev.reception_entry_id === saved.reception_entry_id ? { ...prev, ...saved } : prev))
  }

  async function openCapture(row: AccountsMechanicalCase) {
    setEditRow(row)
    setInvoiceNumber(row.invoice_number ?? '')
    setInvoiceDate(mechanicalInvoiceDateInputValue(row.invoice_date))
    setBilledAmount(mechanicalInvoiceAmountPrefill(row))
    setPaymentDrafts([emptyMechanicalPaymentDraft()])
    setPayError(null)
    setPayLines([])
    setDmsLookup(null)
    try {
      const lines = await listAccountsMechanicalPayments(row.reception_entry_id)
      setPayLines(lines)
    } catch {
      setPayLines([])
    }
    setLoadingDms(true)
    try {
      setDmsLookup(await lookupAccountsMechanicalDmsInvoice(row.jc_number))
    } catch {
      setDmsLookup({
        jc_number: row.jc_number,
        match_count: 0,
        unique: false,
        invoice_number: null,
        invoice_date: null,
        total_invoice_amount: null,
      })
    } finally {
      setLoadingDms(false)
    }
  }

  function applyDmsToForm() {
    if (!dmsLookup?.unique || dmsLookup.invoice_number == null || dmsLookup.total_invoice_amount == null) {
      flash('No unique DMS invoice', false)
      return
    }
    setInvoiceNumber(dmsLookup.invoice_number)
    setInvoiceDate(dmsLookup.invoice_date || invoiceDate)
    setBilledAmount(String(dmsLookup.total_invoice_amount))
    flash('DMS invoice loaded. Save invoice to keep it.')
  }

  async function saveCapture() {
    if (!editRow) return
    setSaving(true)
    try {
      const saved = await upsertAccountsMechanicalInvoice({
        receptionEntryId: editRow.reception_entry_id,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate.trim() || null,
        billedAmount: numOrNull(billedAmount),
      })
      patchMechRow(saved)
      flash('Invoice saved')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Save failed', false)
    } finally {
      setSaving(false)
    }
  }

  function updatePaymentDraft(key: string, patch: Partial<MechanicalPaymentDraft>) {
    setPaymentDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)))
    setPayError(null)
  }

  function addPaymentDraft() {
    setPaymentDrafts((prev) => [...prev, emptyMechanicalPaymentDraft()])
    setPayError(null)
  }

  function removePaymentDraft(key: string) {
    setPaymentDrafts((prev) => {
      if (prev.length <= 1) return prev
      const index = prev.findIndex((draft) => draft.key === key)
      if (index <= 0) return prev
      return prev.filter((draft) => draft.key !== key)
    })
    setPayError(null)
  }

  async function refreshMechanicalPayLines(receptionEntryId: number) {
    const lines = await listAccountsMechanicalPayments(receptionEntryId)
    setPayLines(lines)
    setMechPayLines((prev) => [
      ...prev.filter((line) => line.reception_entry_id !== receptionEntryId),
      ...lines,
    ])
    return lines
  }

  async function postMechanicalReceipt() {
    if (!editRow) return
    const remaining = mechanicalRemaining(editRow)
    if (editRow.billed_amount == null || remaining == null) {
      setPayError('Save invoice number and billed amount first, then post the receipt.')
      return
    }
    if (remaining <= 0) {
      setPayError('Nothing remaining to post.')
      return
    }

    const payments: Array<{
      key: string
      amount: number
      paymentMode: AccountsPaymentMode
      reference: string | null
      paymentReceivedDate: string
    }> = []

    for (let i = 0; i < paymentDrafts.length; i++) {
      const draft = paymentDrafts[i]
      const amount = numOrNull(draft.amount)
      const reference = draft.paymentReference.trim()
      const receivedDate = draft.paymentReceivedDate.trim()
      const emptyExtra = i > 0 && amount == null && !reference
      if (emptyExtra) continue
      if (amount == null || amount <= 0) {
        setPayError(paymentDrafts.length > 1 ? `Enter the amount for Payment ${i + 1}.` : 'Enter this receipt amount.')
        return
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) {
        setPayError(paymentDrafts.length > 1 ? `Enter the payment received date for Payment ${i + 1}.` : 'Enter the payment received date.')
        return
      }
      payments.push({
        key: draft.key,
        amount,
        paymentMode: draft.paymentMode,
        reference: reference || null,
        paymentReceivedDate: receivedDate,
      })
    }

    if (payments.length === 0) {
      setPayError('Enter this receipt amount.')
      return
    }

    const fit = mechanicalDraftsFitRemaining(remaining, payments.map((p) => p.amount))
    if (fit.over > 0) {
      if (fit.withinPaiseCap) {
        const last = payments[payments.length - 1]
        last.amount = mechanicalDraftRowRemaining(remaining, payments.slice(0, -1).map((p) => p.amount))
        if (last.amount <= 0) {
          setPayError(`These receipts ${inr(fit.total)} are more than remaining ${inr(remaining)}. Use remaining or raise billed.`)
          return
        }
      } else {
        setPayError(
          payments.length === 1
            ? `This receipt ${inr(fit.total)} is more than remaining ${inr(remaining)}. Use remaining or raise billed.`
            : `These receipts ${inr(fit.total)} are more than remaining ${inr(remaining)}. Use remaining or raise billed.`,
        )
        return
      }
    }

    setPayError(null)
    setPostingPay(true)
    const postedKeys = new Set<string>()
    try {
      let saved = editRow
      for (const payment of payments) {
        saved = await addAccountsMechanicalPayment({
          receptionEntryId: editRow.reception_entry_id,
          amount: payment.amount,
          paymentMode: payment.paymentMode,
          reference: payment.reference,
          paymentReceivedDate: payment.paymentReceivedDate,
        })
        postedKeys.add(payment.key)
        patchMechRow(saved)
      }
      setPaymentDrafts([emptyMechanicalPaymentDraft()])
      await refreshMechanicalPayLines(editRow.reception_entry_id)
      flash(
        isMechanicalPaymentClosed(saved)
          ? 'Payment completed'
          : payments.length > 1
            ? 'Receipts posted'
            : 'Receipt posted',
      )
    } catch (e) {
      setPaymentDrafts((prev) => {
        const leftover = prev.filter((draft) => !postedKeys.has(draft.key))
        return leftover.length > 0 ? leftover : [emptyMechanicalPaymentDraft()]
      })
      try {
        await refreshMechanicalPayLines(editRow.reception_entry_id)
      } catch {
        // keep last patched row / history if refresh fails
      }
      setPayError(e instanceof Error ? e.message : 'Receipt failed')
    } finally {
      setPostingPay(false)
    }
  }

  async function uploadMechanicalInvoice(file: File) {
    if (!editRow) return
    setUploadingInvoice(true)
    try {
      const res = await uploadServiceAdvisorInvoice(editRow.reception_entry_id, file)
      if (res.error || !res.data) throw new Error(res.error || 'Invoice upload failed')
      const next = {
        ...editRow,
        invoice_storage_path: res.data.invoice_storage_path,
        invoice_file_name: res.data.invoice_file_name,
        invoice_drive_url: res.data.invoice_drive_url,
      }
      patchMechRow(next)
      flash('Invoice file uploaded')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Invoice upload failed', false)
    } finally {
      setUploadingInvoice(false)
    }
  }

  async function removeMechanicalInvoice() {
    if (!editRow) return
    if (!window.confirm('Are you sure you want to delete this uploaded invoice document?')) return
    setDeletingInvoice(true)
    try {
      await deleteAccountsMechanicalInvoiceFile(editRow.reception_entry_id, editRow.invoice_storage_path)
      const next = {
        ...editRow,
        invoice_storage_path: null,
        invoice_file_name: null,
        invoice_drive_url: null,
      }
      patchMechRow(next)
      flash('Invoice document deleted')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to delete invoice document', false)
    } finally {
      setDeletingInvoice(false)
    }
  }

  function printMechGatepass(row: AccountsMechanicalCase) {
    setGatepassConfirmTarget({ type: 'mechanical', mechRow: row })
  }

  function openPost(row: AccountsBodyshopCase) {
    setPostRow(row)
    setPostCard(settlementCardFromAccountsRow(row))
  }

  function printGatepass(row: AccountsBodyshopCase) {
    setGatepassConfirmTarget({ type: 'bodyshop', bsRow: row })
  }

  async function handleConfirmIssueGatepass() {
    if (!gatepassConfirmTarget) return
    setIssuingGatepass(true)
    try {
      if (gatepassConfirmTarget.type === 'mechanical' && gatepassConfirmTarget.mechRow) {
        const row = gatepassConfirmTarget.mechRow
        const gpNo = `GP-${row.jc_number ? row.jc_number.replace(/[^0-9]/g, '').slice(-5) : Date.now().toString().slice(-5)}`
        await issueAccountsGatePass({
          gate_pass_no: gpNo,
          reg_number: row.reg_number || 'VEHICLE',
          customer_name: row.owner_name || 'Customer',
          customer_phone: row.owner_phone || null,
          job_card_no: row.jc_number,
          invoice_no: row.invoice_number || `INV-${gpNo.replace('GP-', '')}`,
          invoice_date: row.invoice_date || null,
          billed_amount: Number(row.billed_amount) || 0,
          amount_received: Number(row.amount_received) || Number(row.billed_amount) || 0,
          payment_status: 'Paid',
          issued_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          issued_by: 'Accounts Desk · Dealership',
          branch: row.branch || 'Sitapura Workshop',
          qr_token: `GP_AUTH_${gpNo}_${row.reg_number}_SECURE`,
        })
        openMechanicalGatepass(row)
        flash(`✅ Gate Pass #${gpNo} generated & released to Customer App for ${row.reg_number}!`)
      } else if (gatepassConfirmTarget.type === 'bodyshop' && gatepassConfirmTarget.bsRow) {
        const row = gatepassConfirmTarget.bsRow
        const gpNo = `GP-${row.job_card_no ? row.job_card_no.replace(/[^0-9]/g, '').slice(-5) : Date.now().toString().slice(-5)}`
        await issueAccountsGatePass({
          gate_pass_no: gpNo,
          reg_number: row.reg_number || 'VEHICLE',
          customer_name: row.customer_name || 'Customer',
          customer_phone: null,
          job_card_no: row.job_card_no,
          invoice_no: row.invoice_number || `INV-${gpNo.replace('GP-', '')}`,
          invoice_date: row.invoice_date || null,
          billed_amount: Number(row.invoice_amount || row.billed_amount) || 0,
          amount_received: Number(row.customer_posted_amount || row.billed_amount) || 0,
          payment_status: 'Paid',
          issued_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          issued_by: 'Accounts Desk · Dealership',
          branch: row.branch || 'Sitapura Workshop',
          qr_token: `GP_AUTH_${gpNo}_${row.reg_number}_SECURE`,
        })
        openBodyshopGatepass(row)
        flash(`✅ Gate Pass #${gpNo} generated & released to Customer App for ${row.reg_number}!`)
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to issue gatepass', false)
    } finally {
      setIssuingGatepass(false)
      setGatepassConfirmTarget(null)
    }
  }

  function exportExcel() {
    if (section === 'mechanical') {
      const sheet = XLSX.utils.json_to_sheet(searchedMech.map((r) => ({
        'Mark Done': fmtWhen(r.invoice_done_at),
        JC: r.jc_number,
        VRN: r.reg_number ?? '',
        Model: r.model ?? '',
        'Service type': r.service_type ?? '',
        SA: r.sa_display_name || r.sa_name || '',
        Branch: r.branch ?? '',
        Owner: r.owner_name ?? '',
        'Invoice number': r.invoice_number ?? '',
        'Invoice date': r.invoice_date ?? '',
        'Billed amount': r.billed_amount ?? '',
        'Amount received': r.amount_received ?? '',
        Remaining: mechanicalRemaining(r) ?? '',
        'Payment status': r.payment_status ?? 'pending',
        'Invoice file': r.invoice_file_name ?? '',
        Notes: r.payment_notes ?? '',
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, sheet, 'Mechanical')
      XLSX.writeFile(wb, `accounts-mechanical.xlsx`)
      return
    }
    const sheet = XLSX.utils.json_to_sheet(searchedBs.map((r) => ({
      JC: r.job_card_no,
      VRN: r.reg_number ?? '',
      Customer: r.customer_name ?? '',
      Branch: r.branch ?? '',
      SA: r.sa_name ?? '',
      'Invoice number': r.invoice_number ?? '',
      'Invoice date': r.invoice_date ?? '',
      'Billed amount': r.invoice_amount ?? r.billed_amount ?? '',
      'DO Amount (₹)': r.do_amount ?? '',
      'DO received': r.do_released_amount ?? '',
      'DO remaining': r.insurance_due_amount ?? '',
      'DO payment status': r.do_payment_status ?? '',
      'Customer diff': r.customer_diff_amount ?? '',
      Kind: r.customer_settlement_kind ?? '',
      'Customer remaining': r.customer_remaining_amount ?? '',
      'Customer received': r.customer_posted_amount ?? 0,
      'Customer payment status': r.customer_payment_status ?? '',
      Outstanding: r.outstanding_amount ?? '',
      'Overall payment status': r.derived_payment_status ?? '',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Bodyshop')
    XLSX.writeFile(wb, `accounts-bodyshop.xlsx`)
  }

  const visibleCount = section === 'mechanical' ? searchedMech.length : searchedBs.length

  return (
    <div className="page acct-page">
      <div className="pagehead">
        <h1>Accounts desk</h1>
        <div className="acct-pagehead-actions">
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn--primary" onClick={exportExcel} disabled={visibleCount === 0}>
            Export Excel
          </button>
        </div>
      </div>

      {error && <div className="brx-settle-banner" style={{ marginBottom: 14 }}>{error}</div>}
      {toast && (
        <div className={`brx-settle-banner ${toast.ok ? '' : 'is-error'}`} style={{ marginBottom: 14 }}>
          {toast.msg}
        </div>
      )}

      <div className="acct-filter-strip">
        <div className="brx-pipeline">
          <button
            type="button"
            className={`brx-pipe-pill ${section === 'mechanical' ? 'is-active' : ''}`}
            onClick={() => { setSection('mechanical'); setYear('all'); setMonth('all'); setSearch(''); setMechStatusFilter('all') }}
          >
            <span className="brx-pipe-pill__n">{mechRows.length}</span>
            <span className="brx-pipe-pill__l">Mechanical<small>Mark Done</small></span>
          </button>
          <button
            type="button"
            className={`brx-pipe-pill ${section === 'bodyshop' ? 'is-active' : ''}`}
            onClick={() => { setSection('bodyshop'); setYear('all'); setMonth('all'); setSearch(''); setMechStatusFilter('all') }}
          >
            <span className="brx-pipe-pill__n">{bsRows.length}</span>
            <span className="brx-pipe-pill__l">Bodyshop<small>Invoice + billed</small></span>
          </button>
        </div>
        <div className="acct-filters">
          <button
            type="button"
            className={`brx-pipe-pill ${year === 'all' ? 'is-active' : ''}`}
            onClick={() => { setYear('all'); setMonth('all') }}
          >
            <span className="brx-pipe-pill__n">{section === 'mechanical' ? mechRows.length : bsRows.length}</span>
            <span className="brx-pipe-pill__l">All years<small>{section === 'mechanical' ? 'Mark Done date' : 'invoice date'}</small></span>
          </button>
          {years.map((y) => (
            <button
              key={y.year}
              type="button"
              className={`brx-pipe-pill ${year === y.year ? 'is-active' : ''}`}
              onClick={() => { setYear(y.year); setMonth('all') }}
            >
              <span className="brx-pipe-pill__n">{y.count}</span>
              <span className="brx-pipe-pill__l">{y.year === 0 ? 'No date' : String(y.year)}<small>{y.count} JC</small></span>
            </button>
          ))}
          {year !== 'all' && (
            <>
              <button type="button" className={`brx-pipe-pill ${month === 'all' ? 'is-active' : ''}`} onClick={() => setMonth('all')}>
                <span className="brx-pipe-pill__n">{section === 'mechanical' ? yearScopedMech.length : yearScopedBs.length}</span>
                <span className="brx-pipe-pill__l">All months<small>{year === 0 ? 'no date' : String(year)}</small></span>
              </button>
              {months.map((m) => (
                <button
                  key={m.month}
                  type="button"
                  className={`brx-pipe-pill ${month === m.month ? 'is-active' : ''}`}
                  onClick={() => setMonth(m.month)}
                >
                  <span className="brx-pipe-pill__n">{m.count}</span>
                  <span className="brx-pipe-pill__l">{monthLabel(year === 0 ? 0 : year, m.month)}<small>{m.count} JC</small></span>
                </button>
              ))}
            </>
          )}
        </div>
        <input
          className="inp"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search JC / VRN / invoice / name"
        />
      </div>

      {section === 'mechanical' ? (
        <div className="brx-recov-kpis acct-kpis">
          <KpiTile
            label="Mark Done"
            value={mechKpis.count}
            active={mechStatusFilter === 'all'}
            onClick={() => setMechStatusFilter('all')}
          />
          <KpiTile
            label="Pending"
            value={mechKpis.pending}
            active={mechStatusFilter === 'pending'}
            onClick={() => setMechStatusFilter('pending')}
          />
          <KpiTile
            label="Received"
            value={mechKpis.received}
            active={mechStatusFilter === 'received'}
            onClick={() => setMechStatusFilter('received')}
          />
          <KpiTile label="Billed" value={inrKpi(mechKpis.billed)} />
          <KpiTile label="Customer Remaining" value={inrKpi(mechKpis.remaining)} />
          <KpiTile label="Cash" value={inrKpi(mechKpis.cash)} />
          <KpiTile label="UPI" value={inrKpi(mechKpis.upi)} />
          <KpiTile label="Credit Card" value={inrKpi(mechKpis.card)} title="Stored payment mode: card" />
        </div>
      ) : (
        <div className="brx-recov-kpis acct-kpis">
          <KpiTile
            label="Mark Done"
            value={bsKpis.billedCount}
            active={bsFilter === 'all'}
            onClick={() => setBsFilter('all')}
          />
          <KpiTile
            label="Pending"
            value={bsKpis.pending}
            active={bsFilter === 'pending'}
            onClick={() => setBsFilter('pending')}
          />
          <KpiTile
            label="Received"
            value={bsKpis.received}
            active={bsFilter === 'received'}
            onClick={() => setBsFilter('received')}
          />
          <KpiTile label="Billed" value={inrKpi(bsKpis.billed)} />
          <KpiTile
            label="Customer Remaining"
            value={inrKpi(bsKpis.remaining)}
            active={bsFilter === 'remaining'}
            onClick={() => setBsFilter('remaining')}
          />
          <KpiTile
            label="Cash"
            value="—"
            title="Bodyshop settlement lines do not store payment mode"
          />
          <KpiTile
            label="UPI"
            value="—"
            title="Bodyshop settlement lines do not store payment mode"
          />
          <KpiTile
            label="Credit Card"
            value="—"
            title="Bodyshop settlement lines do not store payment mode"
          />
        </div>
      )}

      {section === 'mechanical' ? (
        <div className="brx-panel acct-table-panel">
          <div className="brx-panel-h">
            {mechStatusFilter === 'pending' && 'Mechanical · Pending'}
            {mechStatusFilter === 'received' && 'Mechanical · Received'}
            {mechStatusFilter === 'all' && 'Mechanical · Mark Done'}
          </div>
          {loading && mechRows.length === 0 ? (
            <div className="brx-settle-status">Loading Mark Done cases…</div>
          ) : searchedMech.length === 0 ? (
            <div className="brx-settle-status">No Mark Done mechanical cases in this view.</div>
          ) : (
            <div className="acct-table-scroll">
            <table className="brx-settle-table">
              <thead>
                <tr>
                  <th>Mark Done</th>
                  <th>JC / VRN</th>
                  <th>Service</th>
                  <th>SA / Branch</th>
                  <th>Owner</th>
                  <th>Invoice</th>
                  <th>Billed</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {searchedMech.map((r) => (
                  <tr key={r.reception_entry_id}>
                    <td>{fmtWhen(r.invoice_done_at)}</td>
                    <td>
                      <div>{r.jc_number}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.reg_number || '—'} · {r.model || '—'}</div>
                    </td>
                    <td>{r.service_type || '—'}</td>
                    <td>
                      <div>{r.sa_display_name || r.sa_name || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.branch || '—'}</div>
                    </td>
                    <td>{r.owner_name || '—'}</td>
                    <td>
                      <div>{r.invoice_number || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(r.invoice_date)}</div>
                      {(r.invoice_storage_path || r.invoice_drive_url) && (
                        <button
                          type="button"
                          className="linkbtn linkbtn--sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11.5 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            void openMechanicalInvoiceFile(r).catch((err) => flash(err instanceof Error ? err.message : 'Could not open invoice', false))
                          }}
                          title={r.invoice_file_name || 'View invoice document'}
                        >
                          <span>👁</span> View Doc
                        </button>
                      )}
                    </td>
                    <td>{inr(r.billed_amount)}</td>
                    <td>{inr(mechanicalRemaining(r))}</td>
                    <td>
                      <span className={`brx-settle-pill is-${String(r.payment_status ?? 'pending').toLowerCase()}`}>
                        {settlementStatusLabel(r.payment_status)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn--sm btn--primary" onClick={() => void openCapture(r)}>
                          {r.invoice_number ? 'Payments' : 'Capture'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={!isMechanicalPaymentClosed(r)}
                          title={isMechanicalPaymentClosed(r) ? 'Print gatepass copy' : 'Available after remaining is ₹0'}
                          onClick={() => openMechanicalGatepass(r)}
                        >
                          🖨️ Print
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          disabled={!isMechanicalPaymentClosed(r)}
                          title={isMechanicalPaymentClosed(r) ? 'Create and release gatepass to customer' : 'Available after remaining is ₹0'}
                          onClick={() => printMechGatepass(r)}
                        >
                          Create Gatepass
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      ) : (
        <div className="brx-panel acct-table-panel">
          <div className="brx-panel-h">
            {bsFilter === 'remaining' && 'Bodyshop · Customer remaining'}
            {bsFilter === 'all' && 'Bodyshop · Mark Done'}
            {bsFilter === 'received' && 'Bodyshop · Received'}
            {bsFilter === 'pending' && 'Bodyshop · Pending'}
          </div>
          {loading && bsRows.length === 0 ? (
            <div className="brx-settle-status">Loading billed bodyshop cases…</div>
          ) : searchedBs.length === 0 ? (
            <div className="brx-settle-status">No billed bodyshop cases in this view.</div>
          ) : (
            <div className="acct-table-scroll">
            <table className="brx-settle-table">
              <thead>
                <tr>
                  <th>JC / VRN</th>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th>Billed</th>
                  <th>DO Amount</th>
                  <th>DO Remaining</th>
                  <th>Diff / Kind</th>
                  <th>Customer Remaining</th>
                  <th>Customer Received</th>
                  <th>Outstanding</th>
                  <th>Overall Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {searchedBs.map((r) => (
                  <tr key={r.repair_card_id}>
                    <td>
                      <div>{r.job_card_no}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.reg_number || '—'} · {r.branch || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.customer_name || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.sa_name || '—'}</div>
                    </td>
                    <td>
                      <div>{r.invoice_number || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(r.invoice_date)}</div>
                    </td>
                    <td>{inr(r.invoice_amount ?? r.billed_amount)}</td>
                    <td>{inr(r.do_amount)}</td>
                    <td>{inr(r.insurance_due_amount)}</td>
                    <td>
                      <div>{inr(r.customer_diff_amount)}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{kindLabel(r.customer_settlement_kind)}</div>
                    </td>
                    <td>{inr(r.customer_remaining_amount)}</td>
                    <td style={Number(r.customer_posted_amount) > 0 ? { fontWeight: 600 } : undefined}>
                      {inr(r.customer_posted_amount ?? 0)}
                    </td>
                    <td>{inr(bodyshopOutstanding(r))}</td>
                    <td>
                      <span className={`brx-settle-pill is-${bodyshopOverallStatus(r)}`}>
                        {settlementStatusLabel(r.derived_payment_status)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn--sm btn--primary" onClick={() => openPost(r)}>
                          Post Payment
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={!isCustomerPaymentClosed(r)}
                          title={isCustomerPaymentClosed(r) ? 'Print gatepass copy' : 'Available after customer payment is completed'}
                          onClick={() => openBodyshopGatepass(r)}
                        >
                          🖨️ Print
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          disabled={!isCustomerPaymentClosed(r)}
                          title={isCustomerPaymentClosed(r) ? 'Create and release gatepass to customer' : 'Available after customer payment is completed'}
                          onClick={() => printGatepass(r)}
                        >
                          Create Gatepass
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {editRow && (() => {
        const isInvoiceLocked = Boolean((editRow.invoice_number && editRow.billed_amount != null) || payLines.length > 0)
        const isFieldDisabled = !isAdmin && isInvoiceLocked
        return (
          <div className="modal-back" role="presentation" onClick={() => setEditRow(null)}>
            <div className="modal modal--md" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="modal__head">
                <h3 style={{ wordBreak: 'break-word' }}>{editRow.invoice_number ? 'Mechanical payment' : 'Capture invoice'} · {editRow.jc_number}</h3>
                <button type="button" className="modal__x" onClick={() => setEditRow(null)} aria-label="Close">×</button>
              </div>
              <div className="modal__body">
                <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13 }}>
                  {editRow.reg_number || '—'} · {editRow.service_type || '—'} · Mark Done {fmtWhen(editRow.invoice_done_at)}
                </p>

                <div className="acct-modal-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <p className="acct-modal-kicker" style={{ margin: 0 }}>
                      Invoice details
                    </p>
                    {isAdmin ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 999 }}>
                        <span>👑</span> Admin (Editable)
                      </span>
                    ) : isInvoiceLocked ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 999 }}>
                        <span>🔒</span> Locked (Editable once)
                      </span>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        Enter details once & save
                      </span>
                    )}
                  </div>

                  <div className="brx-form-grid-2">
                    <label className="brx-field">
                      <span className="brx-field-label">Invoice number</span>
                      <input
                        className="inp"
                        value={invoiceNumber}
                        disabled={isFieldDisabled}
                        placeholder="e.g. INV-1002"
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        style={isFieldDisabled ? { background: 'var(--canvas)', cursor: 'not-allowed', opacity: 0.85 } : undefined}
                      />
                    </label>
                    <label className="brx-field">
                      <span className="brx-field-label">Invoice date</span>
                      <input
                        className="inp"
                        type="date"
                        value={invoiceDate}
                        disabled={isFieldDisabled}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        style={isFieldDisabled ? { background: 'var(--canvas)', cursor: 'not-allowed', opacity: 0.85 } : undefined}
                      />
                    </label>
                    <label className="brx-field">
                      <span className="brx-field-label">Invoice / Billed Amount (₹)</span>
                      <input
                        className="inp"
                        type="number"
                        value={billedAmount}
                        disabled={isFieldDisabled}
                        placeholder="e.g. 2500"
                        onChange={(e) => setBilledAmount(e.target.value)}
                        style={isFieldDisabled ? { background: 'var(--canvas)', cursor: 'not-allowed', opacity: 0.85 } : undefined}
                      />
                    </label>
                    <label className="brx-field">
                      <span className="brx-field-label">Invoice file</span>
                      {editRow.invoice_storage_path || editRow.invoice_drive_url ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn--sm btn--primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                            onClick={() => void openMechanicalInvoiceFile(editRow).catch((e) => flash(e instanceof Error ? e.message : 'Could not open invoice', false))}
                            title={editRow.invoice_file_name || 'View uploaded invoice document'}
                          >
                            <span>👁</span> View Document
                          </button>
                          {(!isInvoiceLocked || isAdmin) && (
                            <label className="btn btn--sm" style={{ cursor: uploadingInvoice || deletingInvoice ? 'wait' : 'pointer' }}>
                              {uploadingInvoice ? 'Uploading…' : 'Replace'}
                              <input
                                type="file"
                                accept="application/pdf,image/*"
                                hidden
                                disabled={uploadingInvoice || deletingInvoice}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  e.target.value = ''
                                  if (file) void uploadMechanicalInvoice(file)
                                }}
                              />
                            </label>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn btn--sm"
                              style={{ color: '#b91c1c', borderColor: '#fca5a5', background: '#fff5f5' }}
                              disabled={uploadingInvoice || deletingInvoice}
                              onClick={() => void removeMechanicalInvoice()}
                              title="Admin only: Delete uploaded invoice document"
                            >
                              {deletingInvoice ? 'Deleting…' : '🗑 Delete (Admin)'}
                            </button>
                          )}
                        </div>
                      ) : (!isInvoiceLocked || isAdmin) ? (
                        <label className="btn btn--sm" style={{ cursor: uploadingInvoice ? 'wait' : 'pointer', width: 'fit-content' }}>
                          {uploadingInvoice ? 'Uploading…' : 'Upload invoice'}
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            hidden
                            disabled={uploadingInvoice}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              e.target.value = ''
                              if (file) void uploadMechanicalInvoice(file)
                            }}
                          />
                        </label>
                      ) : (
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '6px 0' }}>
                          No document uploaded
                        </div>
                      )}
                    </label>
                  </div>

                  {(!isInvoiceLocked || isAdmin) && (
                    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={saving || !invoiceNumber.trim() || !billedAmount.trim()}
                        onClick={() => void saveCapture()}
                      >
                        {saving ? 'Saving…' : (isInvoiceLocked ? 'Update invoice (Admin)' : 'Save invoice (Lock details)')}
                      </button>
                      {loadingDms ? (
                        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Looking up DMS…</span>
                      ) : dmsLookup?.unique ? (
                        <button type="button" className="btn btn--sm" onClick={applyDmsToForm}>
                          Fetch from DMS
                          {dmsLookup.invoice_number ? ` · ${dmsLookup.invoice_number}` : ''}
                          {dmsLookup.total_invoice_amount != null ? ` · ${inr(dmsLookup.total_invoice_amount)}` : ''}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 13 }}>No unique DMS invoice</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="acct-modal-section">
                  <p className="acct-modal-kicker">Payment status (automatic)</p>
                  <div className="acct-modal-summary">
                    <div>
                      <span>Received</span>
                      <strong>{inr(editRow.amount_received)}</strong>
                    </div>
                    <div>
                      <span>Remaining</span>
                      <strong>{inr(mechanicalRemaining(editRow))}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{settlementStatusLabel(editRow.payment_status)}</strong>
                    </div>
                  </div>
                  {payError && (
                    <div className="brx-settle-banner is-error" style={{ marginBottom: 12 }}>{payError}</div>
                  )}
                  {isMechanicalPaymentClosed(editRow) ? (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="btn" onClick={() => openMechanicalGatepass(editRow)}>
                        🖨️ Print Gatepass
                      </button>
                      <button type="button" className="btn btn--primary" onClick={() => printMechGatepass(editRow)}>
                        Create Gatepass
                      </button>
                    </div>
                  ) : (
                    <div>
                      {paymentDrafts.map((draft, index) => {
                        const billedRemaining = Number(mechanicalRemaining(editRow) ?? 0)
                        const rowRemaining = mechanicalDraftRowRemaining(
                          billedRemaining,
                          paymentDrafts.filter((_, i) => i !== index).map((other) => numOrNull(other.amount)),
                        )
                        return (
                          <div key={draft.key} className="acct-pay-draft">
                            <div className="acct-pay-draft__title">
                              <span>Payment {index + 1}</span>
                              <div className="acct-pay-draft__actions">
                                {index === 0 && (
                                  <button
                                    type="button"
                                    className="btn btn--sm acct-pay-add"
                                    onClick={addPaymentDraft}
                                    disabled={postingPay}
                                    title="Add another payment"
                                    aria-label="Add another payment"
                                  >
                                    +
                                  </button>
                                )}
                                {index > 0 && (
                                  <button
                                    type="button"
                                    className="modal__x acct-pay-remove"
                                    onClick={() => removePaymentDraft(draft.key)}
                                    disabled={postingPay}
                                    title="Remove this payment"
                                    aria-label={`Remove payment ${index + 1}`}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="brx-form-grid-2">
                              <label className="brx-field">
                                <span className="brx-field-label">{index === 0 ? 'This receipt (₹)' : 'Amount (₹)'}</span>
                                <input
                                  className="inp"
                                  type="number"
                                  value={draft.amount}
                                  onChange={(e) => updatePaymentDraft(draft.key, { amount: e.target.value })}
                                  placeholder="Additional amount"
                                />
                                {rowRemaining > 0 && (
                                  <button
                                    type="button"
                                    className="linkbtn linkbtn--sm"
                                    onClick={() => updatePaymentDraft(draft.key, { amount: String(rowRemaining) })}
                                  >
                                    Use remaining {inr(rowRemaining)}
                                  </button>
                                )}
                              </label>
                              <label className="brx-field">
                                <span className="brx-field-label">Payment mode</span>
                                <select
                                  className="sel"
                                  value={draft.paymentMode}
                                  onChange={(e) => updatePaymentDraft(draft.key, { paymentMode: e.target.value as AccountsPaymentMode })}
                                >
                                  {ACCOUNTS_PAYMENT_MODES.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="brx-field">
                                <span className="brx-field-label">Payment received date</span>
                                <input
                                  className="inp"
                                  type="date"
                                  value={draft.paymentReceivedDate}
                                  required
                                  onChange={(e) => updatePaymentDraft(draft.key, { paymentReceivedDate: e.target.value })}
                                />
                              </label>
                              <label className="brx-field">
                                <span className="brx-field-label">Reference</span>
                                <input
                                  className="inp"
                                  value={draft.paymentReference}
                                  onChange={(e) => updatePaymentDraft(draft.key, { paymentReference: e.target.value })}
                                  placeholder="UTR, cheque no, or note"
                                />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                      <div className="brx-field">
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={postingPay || editRow.billed_amount == null}
                          onClick={() => void postMechanicalReceipt()}
                        >
                          {postingPay ? 'Posting…' : 'Post payment'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {payLines.length > 0 && (
                  <div className="acct-modal-section">
                    <p className="acct-modal-kicker">Receipts</p>
                    <table className="acct-pay-hist">
                      <thead>
                        <tr>
                          <th>Received Date</th>
                          <th>Mode</th>
                          <th>Amount</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payLines.map((l) => (
                          <tr key={l.id}>
                            <td>{fmtDate(mechanicalPaymentReceivedDate(l))}</td>
                            <td>{paymentModeLabel(l.payment_mode)}</td>
                            <td>{inr(l.amount)}</td>
                            <td>{l.reference || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal__foot">
                <button type="button" className="btn" onClick={() => setEditRow(null)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {postRow && postCard && (
        <div className="modal-back" role="presentation" onClick={() => { setPostRow(null); setPostCard(null); void load() }}>
          <div className="modal modal--xl" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Stage 18 · Settlement Receipt · {postRow.job_card_no}</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isCustomerPaymentClosed({
                  customer_payment_status: postCard.customer_payment_status,
                  customer_settlement_kind: postCard.customer_settlement_kind,
                }) && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => openBodyshopGatepass({
                        ...postRow,
                        customer_payment_status: postCard.customer_payment_status,
                        customer_settlement_kind: postCard.customer_settlement_kind,
                        do_amount: postCard.do_amount ?? postRow.do_amount,
                      })}
                    >
                      🖨️ Print Gatepass
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      onClick={() => printGatepass({
                        ...postRow,
                        customer_payment_status: postCard.customer_payment_status,
                        customer_settlement_kind: postCard.customer_settlement_kind,
                        do_amount: postCard.do_amount ?? postRow.do_amount,
                      })}
                    >
                      Create Gatepass
                    </button>
                  </div>
                )}
                <button type="button" className="modal__x" onClick={() => { setPostRow(null); setPostCard(null); void load() }} aria-label="Close">×</button>
              </div>
            </div>
            <div className="modal__body">
              <p style={{ margin: '0 0 12px', color: 'var(--muted)' }}>
                {postRow.reg_number || '—'} · {postRow.customer_name || '—'}
              </p>
              <BodyshopSettlementPanel
                card={postCard}
                onCardChange={setPostCard}
                toast={flash}
                variant="accounts_receipt"
              />
            </div>
            <div className="modal__foot">
              <button type="button" className="btn" onClick={() => { setPostRow(null); setPostCard(null); void load() }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {gatepassConfirmTarget && (
        <div className="modal-back" role="presentation" onClick={() => setGatepassConfirmTarget(null)}>
          <div
            className="modal modal--sm"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480, borderRadius: 16, overflow: 'hidden' }}
          >
            <div
              className="modal__head"
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                color: 'white',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🚗</span>
                <div>
                  <h3 style={{ margin: 0, color: 'white', fontSize: 16, fontWeight: 800 }}>
                    Issue Customer Gate Pass?
                  </h3>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#cbd5e1' }}>
                    Confirm release of official vehicle departure pass
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal__x"
                style={{ color: 'white', opacity: 0.8 }}
                onClick={() => setGatepassConfirmTarget(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="modal__body" style={{ padding: '20px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '14px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Vehicle Reg:</span>
                  <strong className="mono" style={{ fontSize: '14px', color: '#0369a1' }}>
                    {gatepassConfirmTarget.mechRow?.reg_number || gatepassConfirmTarget.bsRow?.reg_number}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Customer Name:</span>
                  <strong>
                    {gatepassConfirmTarget.mechRow?.owner_name || gatepassConfirmTarget.bsRow?.customer_name || 'Customer'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Job Card:</span>
                  <span className="mono font-bold">
                    {gatepassConfirmTarget.mechRow?.jc_number || gatepassConfirmTarget.bsRow?.job_card_no}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Settled Amount:</span>
                  <span className="mono font-bold text-emerald-700" style={{ color: '#15803d', fontWeight: 800 }}>
                    {inr(gatepassConfirmTarget.mechRow?.billed_amount || gatepassConfirmTarget.bsRow?.billed_amount)} (✓ Full Payment Received)
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#065f46',
                  lineHeight: 1.4,
                  marginBottom: '16px',
                }}
              >
                <strong>📢 Confirmation Notice:</strong>
                <div style={{ marginTop: 2 }}>
                  Are you sure you want to release this Gate Pass? Once confirmed, the Gate Pass will be <strong>instantly unlocked and downloadable</strong> in the Customer App.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setGatepassConfirmTarget(null)}
                  disabled={issuingGatepass}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (gatepassConfirmTarget.type === 'mechanical' && gatepassConfirmTarget.mechRow) {
                      openMechanicalGatepass(gatepassConfirmTarget.mechRow)
                    } else if (gatepassConfirmTarget.type === 'bodyshop' && gatepassConfirmTarget.bsRow) {
                      openBodyshopGatepass(gatepassConfirmTarget.bsRow)
                    }
                  }}
                  disabled={issuingGatepass}
                >
                  🖨️ Print Copy
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ background: '#16a34a', borderColor: '#15803d' }}
                  onClick={() => void handleConfirmIssueGatepass()}
                  disabled={issuingGatepass}
                >
                  {issuingGatepass ? 'Issuing…' : '✅ Confirm & Release Gate Pass'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
