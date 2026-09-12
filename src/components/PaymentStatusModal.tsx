import { useState, useEffect } from 'react'
import {
  fetchVehiclePayment,
  saveVehiclePayment,
  type VehiclePaymentRecord,
} from '../lib/payments'
import { fetchEstimatesForVehicle } from '../lib/estimates'

interface PaymentStatusModalProps {
  isOpen: boolean
  onClose: () => void
  regNumber: string
  customerName?: string
  customerPhone?: string
  jcNumber?: string
  initialInvoiceAmount?: number
  onPaymentSaved?: (updated: VehiclePaymentRecord) => void
}

export function PaymentStatusModal({
  isOpen,
  onClose,
  regNumber,
  customerName = 'Customer',
  customerPhone = '',
  jcNumber = '',
  initialInvoiceAmount = 0,
  onPaymentSaved,
}: PaymentStatusModalProps) {
  const [totalBilled, setTotalBilled] = useState<number>(initialInvoiceAmount || 0)
  const [amountReceived, setAmountReceived] = useState<number>(0)
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'Cash' | 'Card' | 'Net Banking' | 'Mixed'>('UPI')
  const [transactionRef, setTransactionRef] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const remaining = Math.max(0, totalBilled - amountReceived)
  const isFullyPaid = totalBilled > 0 && remaining === 0
  const isPartiallyPaid = amountReceived > 0 && remaining > 0

  useEffect(() => {
    if (!isOpen || !regNumber) return

    async function loadData() {
      setIsLoading(true)
      try {
        // 1. Fetch existing payment record
        const payment = await fetchVehiclePayment(regNumber)
        // 2. Fetch estimates to verify total bill
        const estimates = await fetchEstimatesForVehicle(regNumber)
        const estimateTotal = estimates.reduce((sum, e) => sum + (e.grand_total || 0), 0)

        const effectiveTotal =
          (payment && payment.total_billed > 0 ? payment.total_billed : 0) ||
          (initialInvoiceAmount > 0 ? initialInvoiceAmount : 0) ||
          estimateTotal ||
          0

        setTotalBilled(effectiveTotal)

        if (payment) {
          setAmountReceived(payment.amount_received || 0)
          setPaymentMode(payment.payment_mode || 'UPI')
          setTransactionRef(payment.transaction_ref || '')
          setNotes(payment.notes || '')
        } else {
          setAmountReceived(0)
          setTransactionRef('')
          setNotes('')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [isOpen, regNumber, initialInvoiceAmount])

  if (!isOpen) return null

  function handleQuickSet(type: 'pending' | 'full' | 'half') {
    if (type === 'pending') {
      setAmountReceived(0)
    } else if (type === 'full') {
      setAmountReceived(totalBilled)
    } else if (type === 'half') {
      setAmountReceived(Math.round(totalBilled / 2))
    }
  }

  async function handleSave() {
    if (totalBilled < 0 || amountReceived < 0) {
      alert('Amounts cannot be negative.')
      return
    }

    setIsSaving(true)
    try {
      const record: VehiclePaymentRecord = {
        reg_number: regNumber.trim().toUpperCase(),
        jc_number: jcNumber || null,
        customer_name: customerName,
        customer_phone: customerPhone,
        total_billed: totalBilled,
        amount_received: amountReceived,
        remaining_amount: remaining,
        status: isFullyPaid ? 'Fully Paid' : isPartiallyPaid ? 'Partially Paid' : 'Pending',
        payment_mode: paymentMode,
        transaction_ref: transactionRef.trim() || undefined,
        notes: notes.trim() || undefined,
        updated_at: new Date().toISOString(),
      }

      const saved = await saveVehiclePayment(record)
      if (onPaymentSaved) onPaymentSaved(saved)
      onClose()
    } catch (e) {
      console.error('Error saving payment record:', e)
      alert('Failed to save payment status.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-slate-900 to-indigo-950 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold shadow-md">
              💳
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Workshop Payment Settlement</h2>
                <span className="font-mono rounded-md bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300 border border-blue-400/30">
                  {regNumber}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Update billing & payment status for invoice settlement & gatepass clearance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Body Form */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Customer & Job Card Info */}
          <div className="rounded-xl border border-gray-200 bg-slate-50 p-3.5 text-xs flex justify-between items-center">
            <div>
              <div className="font-bold text-gray-900">{customerName}</div>
              <div className="text-gray-500">{customerPhone || '—'}</div>
            </div>
            <div className="text-right">
              <div className="text-gray-500 font-medium">Job Card</div>
              <div className="font-mono font-bold text-blue-700">{jcNumber || '—'}</div>
            </div>
          </div>

          {/* Quick Status Selection */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-2">
              Payment Status Quick Action
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickSet('pending')}
                className={`rounded-xl border p-2.5 text-center text-xs font-bold transition flex flex-col items-center gap-1 ${
                  amountReceived === 0
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-xs ring-2 ring-amber-400'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>⏳ Pending</span>
                <span className="font-mono text-[11px] font-normal text-amber-700">₹0 Received</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickSet('half')}
                className={`rounded-xl border p-2.5 text-center text-xs font-bold transition flex flex-col items-center gap-1 ${
                  isPartiallyPaid
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-xs ring-2 ring-indigo-400'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>⚡ Partial</span>
                <span className="font-mono text-[11px] font-normal text-indigo-700">Custom ₹</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickSet('full')}
                className={`rounded-xl border p-2.5 text-center text-xs font-bold transition flex flex-col items-center gap-1 ${
                  isFullyPaid
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-xs ring-2 ring-emerald-400'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>✅ Fully Paid</span>
                <span className="font-mono text-[11px] font-normal text-emerald-700">100% Cleared</span>
              </button>
            </div>
          </div>

          {/* Amount Inputs Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Total Billed / Estimate (₹)
              </label>
              <input
                type="number"
                min="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono font-bold text-gray-900 focus:border-blue-500 focus:outline-hidden"
                value={totalBilled}
                onChange={(e) => setTotalBilled(Math.max(0, Number(e.target.value)))}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Amount Received (₹)
              </label>
              <input
                type="number"
                min="0"
                max={totalBilled}
                className="w-full rounded-lg border border-emerald-300 bg-emerald-50/40 px-3 py-2 text-sm font-mono font-bold text-emerald-900 focus:border-emerald-500 focus:outline-hidden"
                value={amountReceived}
                onChange={(e) => setAmountReceived(Math.max(0, Number(e.target.value)))}
              />
            </div>
          </div>

          {/* Settlement Summary Pill */}
          <div className="rounded-xl border border-gray-200 bg-slate-100/70 p-3 flex justify-between items-center text-xs font-semibold">
            <span className="text-gray-600">Remaining Balance Due:</span>
            <span
              className={`font-mono text-sm font-extrabold ${
                remaining > 0 ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              {remaining > 0 ? `₹${remaining.toLocaleString()} Pending` : '₹0 (Fully Paid)'}
            </span>
          </div>

          {/* Payment Mode & Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Payment Mode
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
              >
                <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                <option value="Cash">Cash at Counter</option>
                <option value="Card">Credit / Debit Card</option>
                <option value="Net Banking">Net Banking / NEFT</option>
                <option value="Mixed">Mixed / Split Payment</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Transaction Ref / UTR (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. UPI-202609-8472"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-800 font-mono"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
              />
            </div>
          </div>

          {/* Gate Pass Clearance Notice */}
          <div
            className={`rounded-xl border p-3 text-xs flex items-start gap-2.5 ${
              isFullyPaid
                ? 'border-emerald-300 bg-emerald-50/80 text-emerald-900'
                : 'border-amber-300 bg-amber-50/80 text-amber-900'
            }`}
          >
            <span className="text-base">{isFullyPaid ? '🔓' : '🔒'}</span>
            <div>
              <div className="font-bold">
                {isFullyPaid
                  ? 'Digital Gate Pass will UNLOCK for Customer'
                  : 'Digital Gate Pass remains LOCKED'}
              </div>
              <div className="text-[11px] mt-0.5 opacity-90 leading-tight">
                {isFullyPaid
                  ? 'Customer will immediately see the Valid QR Gate Pass in the Bodyshop & Customer Services App for departure authorization.'
                  : 'Customer Gate Pass requires 100% payment settlement. Once full payment is recorded here, Gate Pass unlocks automatically.'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSaving ? '⏳ Saving…' : '💾 Save Payment Status'}
          </button>
        </div>
      </div>
    </div>
  )
}
