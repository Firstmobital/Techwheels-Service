import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, PrimaryButton, asText, dash, formatWhen } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerListEstimates, customerGetServiceHistory, customerSubmitComplaint } from '../../lib/api/customerPortal'

export default function CustomerComplaintScreen() {
  const router = useRouter()
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [kmReading, setKmReading] = useState('')
  const [problems, setProblems] = useState<string[]>([''])
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [estimates, setEstimates] = useState<Record<string, unknown>[]>([])
  const [loadingPast, setLoadingPast] = useState(false)

  const loadPastData = useCallback(async () => {
    if (!token || !selectedReg) return
    setLoadingPast(true)
    try {
      const [hist, ests] = await Promise.all([
        customerGetServiceHistory(token, selectedReg).catch(() => []),
        customerListEstimates(token, selectedReg).catch(() => []),
      ])
      setHistory(hist)
      setEstimates(ests)
    } catch {
      // ignore
    } finally {
      setLoadingPast(false)
    }
  }, [token, selectedReg])

  useEffect(() => {
    void loadPastData()
    const km = selected?.km_reading
    setKmReading(km != null && Number(km) > 0 ? String(km) : '')
  }, [selected?.reg_number, selected?.km_reading, loadPastData])

  const submit = async () => {
    const validProblems = problems.map((item) => item.trim()).filter(Boolean)
    if (!token || !selected?.reg_number) {
      setToast({ ok: false, msg: 'Session expired.' })
      return
    }
    if (validProblems.length === 0) {
      setToast({ ok: false, msg: 'Please describe at least one problem with your vehicle.' })
      return
    }
    setSubmitting(true)
    setToast(null)
    try {
      const km = Number(kmReading)
      await customerSubmitComplaint(token, selected.reg_number, {
        problems: validProblems,
        notes: comments.trim() || undefined,
        current_km: Number.isFinite(km) && km > 0 ? km : undefined,
        owner_name: selected.owner_name,
        service_type: selected.service_type,
        sa_name: selected.sa_display_name || selected.sa_name,
        branch: selected.branch,
        model: selected.model,
      })
      setToast({
        ok: true,
        msg: `✅ ${validProblems.length} Problem(s) registered successfully! Your Service Advisor (${
          selected.sa_display_name || selected.sa_name || 'Advisor'
        }) has been notified to inspect and prepare the estimate.`,
      })
      setProblems([''])
      setComments('')
      void loadPastData()
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to submit problem.' })
    } finally {
      setSubmitting(false)
    }
  }

  const latestEstimate = estimates[0]

  return (
    <CustomerScreen
      title="Tell Us Your Problem"
      subtitle="Enter current odometer and add all vehicle problems to share directly with your Service Advisor."
    >
      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}

      {/* ── SECTION 1: SERVICE ADVISOR ESTIMATE & INSPECTION STATUS ── */}
      {latestEstimate && (
        <CustomerCard style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac', borderLeftWidth: 4, borderLeftColor: '#16a34a' }}>
          <View className="flex-row justify-between items-start mb-2">
            <View className="flex-1 pr-2">
              <Text className="text-[11px] font-black uppercase text-emerald-800 tracking-wider">
                SERVICE ADVISOR INSPECTION & ESTIMATE
              </Text>
              <Text className="text-slate-900 font-extrabold text-[15px] mt-0.5">
                Quotation #{asText(latestEstimate.estimate_no) || 'Active'} ({asText(latestEstimate.status)})
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(customer)/estimate')}
              className="bg-emerald-600 px-3 py-1.5 rounded-xl shadow-xs"
            >
              <Text className="text-white text-xs font-black">View Estimate ➔</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-slate-600 text-[12px] leading-5">
            Your Service Advisor has reviewed your reported issues and prepared an itemized estimate for necessary parts & labor.
          </Text>
        </CustomerCard>
      )}

      {/* ── SECTION 2: ADD NEW PROBLEMS FORM ── */}
      <CustomerCard>
        <Text className="text-slate-800 text-[14px] font-black mb-1">Current Odometer (KM Reading)</Text>
        <Text className="text-slate-400 text-[11px] mb-2">From dashboard instrument cluster</Text>
        <TextInput
          className="border border-slate-300 rounded-xl px-4 py-3 text-[16px] font-bold bg-slate-50/50"
          keyboardType="number-pad"
          placeholder="e.g. 32825"
          value={kmReading}
          onChangeText={setKmReading}
          editable={!submitting}
        />

        <View className="flex-row items-center justify-between mt-5 mb-2">
          <Text className="text-slate-900 text-[14px] font-black">
            Vehicle Problems & Concerns <Text className="text-red-600">*</Text>
          </Text>
          <Text className="text-blue-700 text-[11.5px] font-extrabold">
            {problems.length} Problem{problems.length > 1 ? 's' : ''}
          </Text>
        </View>

        {problems.map((problem, index) => (
          <View key={index} className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-[11px] font-extrabold uppercase tracking-wide bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                Problem #{index + 1}
              </Text>
              {problems.length > 1 ? (
                <TouchableOpacity onPress={() => setProblems((prev) => prev.filter((_, i) => i !== index))}>
                  <Text className="text-red-500 text-xs font-bold">🗑️ Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TextInput
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-[14px] min-h-[64px]"
              placeholder={`Describe Problem #${index + 1} (e.g. AC cooling is slow, noise on rough roads, wheel alignment issue...)`}
              value={problem}
              onChangeText={(value) =>
                setProblems((prev) => prev.map((item, i) => (i === index ? value : item)))
              }
              multiline
              textAlignVertical="top"
              editable={!submitting}
            />
          </View>
        ))}

        <TouchableOpacity
          onPress={() => setProblems((prev) => [...prev, ''])}
          className="border border-dashed border-blue-400 bg-blue-50/70 rounded-xl py-3 items-center mb-4 active:bg-blue-100"
        >
          <Text className="text-blue-700 font-extrabold text-xs">➕ Add Another Problem</Text>
        </TouchableOpacity>

        <Text className="text-slate-800 text-[13px] font-bold mb-1.5">Special Instruction / Additional Notes</Text>
        <TextInput
          className="border border-slate-300 rounded-xl px-4 py-3 text-[14px] mb-4 bg-slate-50/50 min-h-[50px]"
          placeholder="e.g. Please clean air filter, check brake oil level, need car by 5 PM"
          value={comments}
          onChangeText={setComments}
          multiline
          editable={!submitting}
        />

        <PrimaryButton
          label={submitting ? 'Submitting to Advisor…' : '🚀 Submit Problems to Service Advisor'}
          onPress={() => void submit()}
          loading={submitting}
          disabled={problems.every((item) => !item.trim())}
        />
      </CustomerCard>
    </CustomerScreen>
  )
}
