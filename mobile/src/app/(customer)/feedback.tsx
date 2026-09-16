import { useState } from 'react'
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerSubmitFeedback } from '../../lib/api/customerPortal'

export default function CustomerFeedbackScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [text, setText] = useState('')
  const [rating, setRating] = useState(5)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    setMessage(null)
    if (!token || !selected?.reg_number) {
      setError('Session expired.')
      return
    }
    if (!text.trim()) {
      setError('Write a short review.')
      return
    }
    setLoading(true)
    try {
      await customerSubmitFeedback(token, selected.reg_number, {
        text: text.trim(),
        rating,
        owner_name: selected.owner_name,
        service_type: selected.service_type,
        sa_name: selected.sa_name,
        branch: selected.branch,
        model: selected.model,
      })
      setText('')
      setMessage('Thank you. Feedback sent.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit feedback.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CustomerScreen title="Feedback" subtitle="Rate this service">
      <View className="bg-white border border-slate-200 rounded-2xl p-4">
        <View className="flex-row gap-2 mb-4">
          {[1, 2, 3, 4, 5].map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => setRating(value)}
              className={`px-3 py-2 rounded-full border ${
                rating === value ? 'bg-amber-400 border-amber-400' : 'bg-white border-slate-200'
              }`}
            >
              <Text className="font-semibold">{value}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          className="border border-slate-300 rounded-xl px-4 py-3 text-[16px] min-h-[120px]"
          placeholder="How was the service?"
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          editable={!loading}
        />
        {error ? <Text className="text-red-600 mt-3">{error}</Text> : null}
        {message ? <Text className="text-green-700 mt-3">{message}</Text> : null}
        <TouchableOpacity
          className={`mt-4 rounded-xl py-3 items-center ${loading ? 'bg-sky-400' : 'bg-sky-600'}`}
          onPress={() => void submit()}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">Submit review</Text>}
        </TouchableOpacity>
      </View>
    </CustomerScreen>
  )
}
