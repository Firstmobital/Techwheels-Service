import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetServiceHistory } from '../../lib/api/customerPortal'

export default function CustomerInvoicesScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      let active = true
      const load = async () => {
        if (!token) return
        setLoading(true)
        setError(null)
        try {
          const history = await customerGetServiceHistory(token, selectedReg)
          if (!active) return
          setRows(history.filter((row) => row.invoice_drive_url || row.invoice_storage_path || row.invoice_done_at))
        } catch (err) {
          if (!active) return
          setError(err instanceof Error ? err.message : 'Unable to load bills.')
        } finally {
          if (active) setLoading(false)
        }
      }
      void load()
      return () => {
        active = false
      }
    }, [token, selectedReg])
  )

  const invoiceUrl = selected?.invoice_drive_url

  return (
    <CustomerScreen title="Bills" subtitle="Only workshop-issued invoices">
      {loading ? (
        <ActivityIndicator color="#0284c7" />
      ) : rows.length === 0 && !invoiceUrl ? (
        <View className="bg-white border border-slate-200 rounded-2xl p-4">
          <Text className="text-slate-700">No bill uploaded yet.</Text>
        </View>
      ) : (
        <>
          {invoiceUrl ? (
            <TouchableOpacity
              className="bg-white border border-slate-200 rounded-2xl p-4 mb-3"
              onPress={() => void Linking.openURL(String(invoiceUrl))}
            >
              <Text className="text-sky-700 font-semibold">Open latest invoice</Text>
              <Text className="text-slate-500 text-sm mt-1">{selected?.reg_number}</Text>
            </TouchableOpacity>
          ) : null}
          {rows.map((row) => (
            <View key={String(row.id)} className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
              <Text className="text-slate-900 font-bold">{String(row.jc_number || 'Job')}</Text>
              <Text className="text-slate-600 mt-1">{String(row.service_type || 'Service')}</Text>
              <Text className="text-slate-600 mt-1">{row.service_date ? String(row.service_date) : ''}</Text>
              {row.invoice_drive_url ? (
                <Text
                  className="text-sky-700 mt-2 font-semibold"
                  onPress={() => void Linking.openURL(String(row.invoice_drive_url))}
                >
                  Open invoice
                </Text>
              ) : null}
            </View>
          ))}
        </>
      )}
      {error ? <Text className="text-red-600 mt-3">{error}</Text> : null}
    </CustomerScreen>
  )
}
