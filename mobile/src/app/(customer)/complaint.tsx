import { useState } from 'react'
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerSubmitComplaint } from '../../lib/api/customerPortal'

export default function CustomerComplaintScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [text, setText] = useState('')
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
      setError('Describe the problem.')
      return
    }
    setLoading(true)
    try {
      await customerSubmitComplaint(token, selected.reg_number, {
        text: text.trim(),
        owner_name: selected.owner_name,
        service_type: selected.service_type,
        sa_name: selected.sa_name,
        branch: selected.branch,
        model: selected.model,
      })
      setText('')
      setMessage('Problem sent to the workshop.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit complaint.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CustomerScreen title="Problem" subtitle="Tell the workshop what is wrong">
      <View className="bg-white border border-slate-200 rounded-2xl p-4">
        <Text className="text-slate-700 mb-2">Vehicle: {selected?.reg_number || '—'}</Text>
        <TextInput
          className="border border-slate-300 rounded-xl px-4 py-3 text-[16px] min-h-[120px]"
          placeholder="Describe the issue"
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
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">Submit problem</Text>}
        </TouchableOpacity>
      </View>
    </CustomerScreen>
  )
}
