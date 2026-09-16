import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetActiveJob } from '../../lib/api/customerPortal'

export default function CustomerDashboardScreen() {
  const { token, phone, vehicles, selectedReg } = useCustomerSession()
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]

  useFocusEffect(
    useCallback(() => {
      let active = true
      const load = async () => {
        if (!token) return
        setLoading(true)
        setError(null)
        try {
          const result = await customerGetActiveJob(token, selected?.reg_number)
          if (!active) return
          setJob(result.job)
        } catch (err) {
          if (!active) return
          setError(err instanceof Error ? err.message : 'Unable to load job.')
        } finally {
          if (active) setLoading(false)
        }
      }
      void load()
      return () => {
        active = false
      }
    }, [token, selected?.reg_number])
  )

  const status = String(job?.status || (selected?.invoice_done_at ? 'delivered' : selected ? 'in_service' : 'pending'))
  const km = job?.km_reading ?? selected?.km_reading
  const advisor = job?.sa_display_name || job?.sa_name || selected?.sa_display_name || selected?.sa_name

  return (
    <CustomerScreen title="My vehicle" subtitle={phone ? `Mobile ${phone}` : undefined}>
      {loading ? (
        <ActivityIndicator color="#0284c7" />
      ) : error ? (
        <Text className="text-red-600">{error}</Text>
      ) : !selected ? (
        <Text className="text-slate-600">No vehicle found for this mobile number.</Text>
      ) : (
        <View className="bg-white border border-slate-200 rounded-2xl p-4">
          <Text className="text-slate-900 text-2xl font-bold">{selected.reg_number}</Text>
          <Text className="text-slate-600 mt-1">{String(job?.model || selected.model || 'Vehicle')}</Text>
          <Text className="text-sky-700 font-semibold mt-3">
            {status === 'delivered' ? 'Delivered' : status === 'in_service' ? 'In service' : 'Pending'}
          </Text>
          <Text className="text-slate-700 mt-3">Service: {String(job?.service_type || selected.service_type || '—')}</Text>
          <Text className="text-slate-700 mt-1">Advisor: {advisor ? String(advisor) : '—'}</Text>
          <Text className="text-slate-700 mt-1">Job card: {String(job?.jc_number || selected.jc_number || '—')}</Text>
          <Text className="text-slate-700 mt-1">KM: {km == null || km === '' ? 'Pending' : String(km)}</Text>
        </View>
      )}
    </CustomerScreen>
  )
}
