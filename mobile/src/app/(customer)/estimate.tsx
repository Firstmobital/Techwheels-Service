import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerListEstimates, customerSetEstimateDecision } from '../../lib/api/customerPortal'

export default function CustomerEstimateScreen() {
  const { token, selectedReg } = useCustomerSession()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      setRows(await customerListEstimates(token, selectedReg))
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

  const decide = async (estimateId: string, decision: 'approve' | 'reject') => {
    if (!token) return
    if (decision === 'reject' && !reason.trim()) {
      setError('Enter a reason to reject.')
      return
    }
    setBusyId(estimateId)
    setError(null)
    try {
      await customerSetEstimateDecision(token, estimateId, decision, reason.trim() || undefined)
      setReason('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update estimate.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <CustomerScreen title="Estimate" subtitle="Approve only if the workshop issued one">
      {loading ? (
        <ActivityIndicator color="#0284c7" />
      ) : rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-2xl p-4">
          <Text className="text-slate-700">No estimate issued yet. Nothing is invented here.</Text>
        </View>
      ) : (
        rows.map((row) => {
          const id = String(row.estimate_id || row.estimate_no || '')
          return (
            <View key={id} className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
              <Text className="text-slate-900 font-bold">{id}</Text>
              <Text className="text-slate-600 mt-1">Status: {String(row.status || 'issued')}</Text>
              {row.grand_total != null ? (
                <Text className="text-slate-700 mt-1">Amount: ₹{String(row.grand_total)}</Text>
              ) : null}
              <TextInput
                className="border border-slate-300 rounded-xl px-3 py-2 mt-3"
                placeholder="Reject reason"
                value={reason}
                onChangeText={setReason}
              />
              <View className="flex-row gap-2 mt-3">
                <TouchableOpacity
                  className="flex-1 bg-green-600 rounded-xl py-3 items-center"
                  onPress={() => void decide(id, 'approve')}
                  disabled={busyId === id}
                >
                  <Text className="text-white font-semibold">Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-red-600 rounded-xl py-3 items-center"
                  onPress={() => void decide(id, 'reject')}
                  disabled={busyId === id}
                >
                  <Text className="text-white font-semibold">Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        })
      )}
      {error ? <Text className="text-red-600 mt-3">{error}</Text> : null}
    </CustomerScreen>
  )
}
