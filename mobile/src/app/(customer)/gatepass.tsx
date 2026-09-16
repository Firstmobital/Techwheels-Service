import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerGetGatePass } from '../../lib/api/customerPortal'

export default function CustomerGatePassScreen() {
  const { token, selectedReg } = useCustomerSession()
  const [pass, setPass] = useState<Record<string, unknown> | null>(null)
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
          const row = await customerGetGatePass(token, selectedReg)
          if (!active) return
          setPass(row)
        } catch (err) {
          if (!active) return
          setError(err instanceof Error ? err.message : 'Unable to load gate pass.')
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

  return (
    <CustomerScreen title="Gate pass" subtitle="Shown only after the workshop issues it">
      {loading ? (
        <ActivityIndicator color="#0284c7" />
      ) : !pass ? (
        <View className="bg-white border border-slate-200 rounded-2xl p-4">
          <Text className="text-slate-700">No gate pass issued yet. The app will not create a QR here.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-2xl p-4">
          <Text className="text-slate-900 text-xl font-bold">{String(pass.gate_pass_no)}</Text>
          <Text className="text-slate-600 mt-2">{String(pass.reg_number || selectedReg || '')}</Text>
          {pass.issued_at ? <Text className="text-slate-600 mt-1">Issued {String(pass.issued_at)}</Text> : null}
        </View>
      )}
      {error ? <Text className="text-red-600 mt-3">{error}</Text> : null}
    </CustomerScreen>
  )
}
