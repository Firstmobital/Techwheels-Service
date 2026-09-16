import { useEffect, useState } from 'react'
import { Text, TextInput, TouchableOpacity, View } from 'react-native'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, PrimaryButton } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerSubmitComplaint } from '../../lib/api/customerPortal'

export default function CustomerComplaintScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [kmReading, setKmReading] = useState('')
  const [problems, setProblems] = useState<string[]>([''])
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    const km = selected?.km_reading
    setKmReading(km != null && Number(km) > 0 ? String(km) : '')
  }, [selected?.reg_number, selected?.km_reading])

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
        }) has been notified.`,
      })
      setProblems([''])
      setComments('')
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to submit problem.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CustomerScreen
      title="Tell Us Your Problem"
      subtitle="Enter current odometer and add all vehicle problems to share directly with your Service Advisor."
    >
      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}
      <CustomerCard>
        <Text className="text-slate-700 text-[13px] font-bold mb-1">Current Odometer (KM Reading)</Text>
        <Text className="text-slate-400 text-[11px] mb-2">From dashboard odometer</Text>
        <TextInput
          className="border border-slate-300 rounded-xl px-4 py-3 text-[16px] font-bold"
          keyboardType="number-pad"
          placeholder="e.g. 32825"
          value={kmReading}
          onChangeText={setKmReading}
          editable={!submitting}
        />

        <View className="flex-row items-center justify-between mt-5 mb-2">
          <Text className="text-slate-800 text-[13px] font-bold">
            Vehicle Problems & Complaints <Text className="text-red-600">*</Text>
          </Text>
          <Text className="text-blue-600 text-[11.5px] font-semibold">
            {problems.length} Problem{problems.length > 1 ? 's' : ''} Listed
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
              placeholder={`Describe Problem #${index + 1} (e.g. AC cooling is slow, strange noise on rough roads, wheel vibrating...)`}
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
          className="border border-dashed border-blue-400 bg-blue-50 rounded-lg py-3 items-center mb-4"
        >
          <Text className="text-blue-700 font-bold">➕ Add Another Problem</Text>
        </TouchableOpacity>

        <Text className="text-slate-700 text-[13px] font-bold mb-2">Special Request / Additional Comments (Optional)</Text>
        <TextInput
          className="border border-slate-300 rounded-xl px-4 py-3 text-[15px] mb-4"
          placeholder="e.g. Need vehicle by 5 PM, please check tyre pressure as well"
          value={comments}
          onChangeText={setComments}
          editable={!submitting}
        />

        <PrimaryButton
          label={submitting ? 'Submitting to Workshop…' : '🚀 Submit Problems to Workshop'}
          onPress={() => void submit()}
          loading={submitting}
          disabled={problems.every((item) => !item.trim())}
        />
      </CustomerCard>
    </CustomerScreen>
  )
}
