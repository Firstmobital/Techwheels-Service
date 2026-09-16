import { useState } from 'react'
import { Text, TextInput, TouchableOpacity, View } from 'react-native'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, PrimaryButton } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerSubmitFeedback } from '../../lib/api/customerPortal'

const FEEDBACK_TAGS = [
  'Prompt & courteous service',
  'Transparent estimation',
  'Timely car delivery',
  'Excellent paint & dent finish',
  'Neat interior washing',
  'Service advisor explained work clearly',
]

export default function CustomerFeedbackScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const ratingLabel =
    rating === 5
      ? '⭐⭐⭐⭐⭐ Outstanding Experience'
      : rating === 4
        ? '⭐⭐⭐⭐ Very Good'
        : rating === 3
          ? '⭐⭐⭐ Average'
          : 'Needs Improvement'

  const submit = async () => {
    if (!token || !selected?.reg_number) {
      setToast({ ok: false, msg: 'Session expired.' })
      return
    }
    if (!text.trim()) {
      setToast({ ok: false, msg: 'Please share a brief comment about your service experience.' })
      return
    }
    setSubmitting(true)
    setToast(null)
    try {
      await customerSubmitFeedback(token, selected.reg_number, {
        text: text.trim(),
        feedback_text: text.trim(),
        rating,
        owner_name: selected.owner_name,
        service_type: selected.service_type,
        sa_name: selected.sa_display_name || selected.sa_name,
        branch: selected.branch,
        model: selected.model,
      })
      setToast({ ok: true, msg: 'Thank you! Your feedback has been recorded.' })
      setText('')
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to submit feedback' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CustomerScreen
      title="Service Feedback"
      subtitle="Help us improve your after-purchase service experience"
    >
      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}
      <CustomerCard>
        <View className="items-center py-2 mb-3">
          <Text className="text-[13px] font-bold mb-2">How satisfied are you with the service?</Text>
          <View className="flex-row">
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} className="px-1">
                <Text style={{ fontSize: 32, color: star <= rating ? '#f59e0b' : '#cbd5e1' }}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text
            className="text-xs font-bold mt-1"
            style={{ color: rating >= 4 ? '#16a34a' : rating === 3 ? '#d97706' : '#dc2626' }}
          >
            {ratingLabel}
          </Text>
        </View>

        <Text className="text-[13px] font-bold mb-2">
          Your Feedback Remarks <Text className="text-red-600">*</Text>
        </Text>
        <TextInput
          className="border border-slate-300 rounded-xl px-4 py-3 text-[15px] min-h-[110px]"
          placeholder="Tell us what you liked or any areas where we can improve…"
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          editable={!submitting}
        />
        <View className="flex-row flex-wrap mt-3 mb-4">
          {FEEDBACK_TAGS.map((tag) => (
            <TouchableOpacity
              key={tag}
              onPress={() => setText((prev) => (prev.trim() ? `${prev.trim()}, ${tag}` : tag))}
              className="border border-slate-200 rounded-full px-3 py-1.5 mr-2 mb-2 bg-slate-50"
            >
              <Text className="text-[11px] text-slate-700">+ {tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <PrimaryButton
          label={submitting ? 'Submitting Feedback…' : '⭐ Submit Customer Feedback'}
          onPress={() => void submit()}
          loading={submitting}
          disabled={!text.trim()}
        />
      </CustomerCard>
      <Text className="text-center text-[11.5px] text-slate-400 mt-1">
        Feedback is securely stored and reviewed by workshop management.
      </Text>
    </CustomerScreen>
  )
}
