import { ReactNode } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'

export function dash(value: unknown): string {
  if (value == null) return '—'
  const text = String(value).trim()
  return text.length > 0 ? text : '—'
}

export function asText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

export function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export function formatKm(value: unknown): string | null {
  const num = asNumber(value)
  if (num == null || num <= 0) return null
  return `${num.toLocaleString('en-IN')} KM`
}

export function formatInr(value: unknown): string | null {
  const num = asNumber(value)
  if (num == null) return null
  return `₹${num.toLocaleString('en-IN')}`
}

export function formatWhen(value: unknown): string | null {
  const text = asText(value)
  if (!text) return null
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export function pickAdvisorPhone(record: Record<string, unknown> | null | undefined): string | null {
  if (!record) return null
  const raw =
    record.sa_phone ??
    record.advisor_phone ??
    record.service_advisor_phone ??
    record.sa_mobile ??
    record.phone
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  return null
}

export function getDirectAdvisorOrWorkshopPhone(record: Record<string, unknown> | null | undefined): string {
  const phone = pickAdvisorPhone(record)
  return phone || '9116667274'
}

export function CustomerCard({
  children,
  style,
}: {
  children: ReactNode
  style?: object
}) {
  return (
    <View
      style={[
        {
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function CustomerToast({ ok, message }: { ok: boolean; message: string }) {
  return (
    <View
      style={{
        backgroundColor: ok ? '#ecfdf5' : '#fef2f2',
        borderColor: ok ? '#a7f3d0' : '#fecaca',
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: ok ? '#065f46' : '#991b1b', fontSize: 13, fontWeight: '600' }}>{message}</Text>
    </View>
  )
}

export function RecordRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingBottom: last ? 0 : 8,
        marginBottom: last ? 0 : 8,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: '#e2e8f0',
        gap: 12,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  )
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  color = '#2563eb',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  color?: string
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        backgroundColor: disabled || loading ? '#93c5fd' : color,
        borderRadius: 10,
        paddingVertical: 13,
        alignItems: 'center',
      }}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}>{label}</Text>
      )}
    </TouchableOpacity>
  )
}
