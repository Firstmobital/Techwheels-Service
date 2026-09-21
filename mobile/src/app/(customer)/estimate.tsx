import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import {
  CustomerCard,
  CustomerToast,
  PrimaryButton,
  dash,
  formatInr,
} from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerListEstimates, customerSetEstimateDecision } from '../../lib/api/customerPortal'
import { estimateStatusKind, parseEstimate, type EstimateView } from '../../lib/customer/math'

export default function CustomerEstimateScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [rows, setRows] = useState<EstimateView[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const list = (await customerListEstimates(token, selectedReg)).map(parseEstimate)
      setRows(list)
      setSelectedIdx((prev) => (prev < list.length ? prev : 0))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load estimates.')
    } finally {
      setLoading(false)
    }
  }, [token, selectedReg])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const estimate = rows[selectedIdx]
  const kind = estimate ? estimateStatusKind(estimate.status) : 'pending'

  const decide = async (decision: 'approve' | 'reject') => {
    if (!token || !estimate?.estimate_id) return
    const reasonText = rejectReason.trim()
    if (decision === 'reject' && !reasonText) return

    // ── Optimistic Update Snapshot ─────────────────────────────────────────
    const prevRows = [...rows]
    const updatedStatus = decision === 'approve' ? 'Approved' : 'Rejected'
    const optimisticRows = rows.map((r, i) =>
      i === selectedIdx
        ? {
            ...r,
            status: updatedStatus,
            rejection_reason: decision === 'reject' ? reasonText : r.rejection_reason,
          }
        : r
    )

    // Apply optimistic state instantly
    setRows(optimisticRows)
    setShowReject(false)
    setRejectReason('')
    setToast({
      ok: decision === 'approve',
      msg:
        decision === 'approve'
          ? `Estimate #${estimate.estimate_no} Approved! Assigned Technician has been notified to commence repairs.`
          : `Estimate #${estimate.estimate_no} has been rejected. Service Advisor will connect with a revised estimate.`,
    })

    setBusy(true)
    setError(null)

    try {
      await customerSetEstimateDecision(
        token,
        estimate.estimate_id,
        decision,
        decision === 'reject' ? reasonText : undefined
      )
      // Background sync fresh data
      const list = (await customerListEstimates(token, selectedReg)).map(parseEstimate)
      if (list.length > 0) setRows(list)
    } catch (err) {
      // Rollback to previous state on failure
      setRows(prevRows)
      setError(err instanceof Error ? err.message : 'Unable to update estimate. Changes rolled back.')
      setToast(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CustomerScreen
      title="Digital Service Estimate"
      subtitle="Transparent parts & labour quotation with instant approval"
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-slate-500 text-xs font-bold">
          {rows.length > 0 ? `${rows.length} quotation(s) from workshop` : 'Waiting for workshop quotation'}
        </Text>
        <TouchableOpacity onPress={() => void load()} className="border border-slate-200 bg-white px-3 py-1.5 rounded-lg">
          <Text className="text-[12px] font-bold">{loading ? 'Checking…' : '🔄 Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}
      {error ? <CustomerToast ok={false} message={error} /> : null}

      {loading ? (
        <ActivityIndicator color="#2563eb" />
      ) : !estimate ? (
        <CustomerCard>
          <Text className="text-slate-700">
            No estimate has been issued for this vehicle yet. Line items and totals appear only after the workshop sends a quotation.
          </Text>
        </CustomerCard>
      ) : (
        <>
          {rows.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              {rows.map((row, idx) => {
                const state = estimateStatusKind(row.status)
                const selectedChip = idx === selectedIdx
                return (
                  <TouchableOpacity
                    key={row.estimate_id || idx}
                    onPress={() => setSelectedIdx(idx)}
                    className={`mr-2 px-3 py-2 rounded-xl border ${
                      selectedChip ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <Text className="text-xs font-bold">
                      {state === 'approved' ? '✅' : state === 'rejected' ? '❌' : '⏳'} Quotation #{idx + 1}
                    </Text>
                    {row.grand_total != null ? (
                      <Text className="text-[11px] font-extrabold text-emerald-700 mt-0.5">
                        {formatInr(row.grand_total)}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          ) : null}

          <CustomerCard>
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-1 pr-2">
                <Text className="text-slate-900 text-[16px] font-bold">Quotation #{estimate.estimate_no}</Text>
                <Text className="text-slate-500 text-[12px]">Job Card #{dash(estimate.jc_number || selected?.jc_number)}</Text>
              </View>
              <View
                className={`px-2 py-1 rounded-full ${
                  kind === 'approved' ? 'bg-green-100' : kind === 'rejected' ? 'bg-red-100' : 'bg-blue-100'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${
                    kind === 'approved' ? 'text-green-800' : kind === 'rejected' ? 'text-red-800' : 'text-blue-800'
                  }`}
                >
                  {kind === 'approved' ? '✅ Approved' : kind === 'rejected' ? '❌ Rejected' : '⏳ Action Required'}
                </Text>
              </View>
            </View>

            {estimate.items.length > 0 ? (
              <View className="mb-3">
                <View className="flex-row border-b border-slate-200 pb-2 mb-1">
                  <Text className="flex-1 text-[11px] font-bold text-slate-500">Item / Description</Text>
                  <Text className="w-16 text-[11px] font-bold text-slate-500 text-center">Type</Text>
                  <Text className="w-20 text-[11px] font-bold text-slate-500 text-right">Amount</Text>
                </View>
                {estimate.items.map((item) => (
                  <View key={item.id} className="flex-row py-2 border-b border-slate-100">
                    <View className="flex-1 pr-2">
                      <Text className="text-[12.5px] font-semibold text-slate-900">{item.description}</Text>
                      {item.quantity != null && item.unit_price != null ? (
                        <Text className="text-[11px] text-slate-500">
                          Qty: {item.quantity} × {formatInr(item.unit_price)}
                        </Text>
                      ) : null}
                    </View>
                    <View className="w-16 items-center">
                      <Text
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          item.type.toLowerCase() === 'part' ? 'bg-sky-100 text-sky-800' : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {item.type.toUpperCase()}
                      </Text>
                    </View>
                    <Text className="w-20 text-right text-[12.5px] font-bold">
                      {item.total != null ? formatInr(item.total) : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-slate-600 text-[13px] mb-3">
                Line items have not been issued with this quotation yet.
              </Text>
            )}

            {estimate.subtotal != null || estimate.discount != null || estimate.gst_tax != null || estimate.grand_total != null ? (
              <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
                {estimate.subtotal != null ? (
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-slate-500 text-[12.5px]">Parts & Labour Subtotal</Text>
                    <Text className="font-semibold">{formatInr(estimate.subtotal)}</Text>
                  </View>
                ) : null}
                {estimate.discount != null && estimate.discount > 0 ? (
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-emerald-700 text-[12.5px]">Special Discount</Text>
                    <Text className="text-emerald-700 font-semibold">- {formatInr(estimate.discount)}</Text>
                  </View>
                ) : null}
                {estimate.gst_tax != null ? (
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-slate-500 text-[12.5px]">GST</Text>
                    <Text className="font-semibold">{formatInr(estimate.gst_tax)}</Text>
                  </View>
                ) : null}
                {estimate.grand_total != null ? (
                  <View className="flex-row justify-between pt-2 mt-1 border-t border-dashed border-slate-300">
                    <Text className="font-extrabold">Grand Total (Net Payable)</Text>
                    <Text className="font-extrabold text-blue-700">{formatInr(estimate.grand_total)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {estimate.estimate_drive_url ? (
              <TouchableOpacity className="mb-3" onPress={() => void Linking.openURL(estimate.estimate_drive_url!)}>
                <Text className="text-blue-700 font-bold">📥 Open estimate document</Text>
              </TouchableOpacity>
            ) : null}

            {kind === 'rejected' && estimate.rejection_reason ? (
              <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                <Text className="text-red-800 text-xs">
                  <Text className="font-bold">Rejection Reason: </Text>
                  {estimate.rejection_reason}
                </Text>
              </View>
            ) : null}

            {kind === 'approved' ? (
              <View className="bg-emerald-50 border border-emerald-200 rounded-xl py-3 items-center">
                <Text className="text-emerald-800 font-extrabold">✅ You Have Approved This Quotation (Repair Authorized)</Text>
              </View>
            ) : kind === 'rejected' ? (
              <View className="bg-rose-50 border border-rose-200 rounded-xl py-3 items-center">
                <Text className="text-rose-800 font-bold text-center">
                  ❌ Quotation Rejected. Service Advisor will contact you with a revised quotation.
                </Text>
              </View>
            ) : (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <PrimaryButton
                    label="✅ Approve Estimate"
                    onPress={() => void decide('approve')}
                    loading={busy}
                    color="#16a34a"
                  />
                </View>
                <TouchableOpacity
                  className="flex-1 border border-red-300 rounded-[10px] py-3 items-center"
                  onPress={() => setShowReject(true)}
                  disabled={busy}
                >
                  <Text className="text-red-600 font-extrabold">❌ Reject / Need Revision</Text>
                </TouchableOpacity>
              </View>
            )}
          </CustomerCard>
        </>
      )}

      <Modal visible={showReject} transparent animationType="fade" onRequestClose={() => setShowReject(false)}>
        <View className="flex-1 bg-black/60 items-center justify-center px-4">
          <View className="bg-white rounded-2xl p-5 w-full max-w-md">
            <Text className="text-slate-900 text-[16px] font-extrabold mb-1">Reason for Estimate Rejection</Text>
            <Text className="text-slate-500 text-xs mb-3">
              Please let your Service Advisor know why you are rejecting this quotation (e.g. price high, part not needed).
            </Text>
            <TextInput
              className="border border-slate-300 rounded-xl px-3 py-3 min-h-[90px] mb-4"
              placeholder="Enter reason for rejection…"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              textAlignVertical="top"
            />
            <View className="flex-row justify-end gap-2">
              <TouchableOpacity className="px-4 py-2" onPress={() => setShowReject(false)}>
                <Text className="text-slate-600 font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-red-600 px-4 py-2 rounded-lg"
                onPress={() => void decide('reject')}
                disabled={!rejectReason.trim() || busy}
              >
                <Text className="text-white font-bold">Submit Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </CustomerScreen>
  )
}
