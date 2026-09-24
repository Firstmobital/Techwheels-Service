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
  noPadding,
}: {
  children: ReactNode
  style?: object
  noPadding?: boolean
}) {
  return (
    <View
      style={[
        {
          backgroundColor: '#0F1A28',
          borderWidth: 1.2,
          borderColor: 'rgba(0, 210, 196, 0.22)',
          borderRadius: 20,
          padding: noPadding ? 0 : 18,
          marginBottom: 14,
          shadowColor: '#002B49',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
          elevation: 4,
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
        backgroundColor: ok ? 'rgba(0, 210, 196, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        borderColor: ok ? 'rgba(0, 210, 196, 0.4)' : '#f87171',
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: ok ? '#00D2C4' : '#dc2626',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: ok ? '#00D2C4' : '#ef4444',
          marginRight: 10,
        }}
      />
      <Text style={{ color: ok ? '#00D2C4' : '#fca5a5', fontSize: 13.5, fontWeight: '700', flex: 1 }}>
        {message}
      </Text>
    </View>
  )
}

export function StatusBadge({
  status,
  variant = 'default',
}: {
  status: string
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default'
}) {
  const stylesByVariant = {
    success: { bg: 'rgba(0, 210, 196, 0.15)', text: '#00D2C4', border: 'rgba(0, 210, 196, 0.4)', dot: '#00D2C4' },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)', dot: '#f59e0b' },
    error: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.4)', dot: '#ef4444' },
    info: { bg: 'rgba(0, 51, 102, 0.35)', text: '#00D2C4', border: 'rgba(0, 210, 196, 0.35)', dot: '#00D2C4' },
    default: { bg: '#071524', text: '#94a3b8', border: 'rgba(255, 255, 255, 0.12)', dot: '#94a3b8' },
  }

  const s = stylesByVariant[variant] || stylesByVariant.default

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: s.bg,
        borderColor: s.border,
        borderWidth: 1,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.dot, marginRight: 5 }} />
      <Text style={{ color: s.text, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 }}>{status}</Text>
    </View>
  )
}

export function RecordRow({
  label,
  value,
  last,
  highlight,
}: {
  label: string
  value: string
  last?: boolean
  highlight?: boolean
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: last ? 0 : 10,
        marginBottom: last ? 0 : 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: 'rgba(0, 210, 196, 0.12)',
        gap: 12,
      }}
    >
      <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '500' }}>{label}</Text>
      <Text
        style={{
          color: highlight ? '#00D2C4' : '#ffffff',
          fontSize: 13.5,
          fontWeight: highlight ? '800' : '700',
          flexShrink: 1,
          textAlign: 'right',
        }}
      >
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
  color = '#00D2C4',
  icon,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  color?: string
  icon?: ReactNode
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={{
        backgroundColor: disabled || loading ? '#93c5fd' : color,
        borderRadius: 16,
        paddingVertical: 15,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: color,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: disabled || loading ? 0 : 0.28,
        shadowRadius: 10,
        elevation: disabled || loading ? 0 : 4,
        gap: 8,
      }}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <>
          {icon}
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 }}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  )
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  icon?: ReactNode
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={{
        backgroundColor: '#ffffff',
        borderWidth: 1.5,
        borderColor: '#cbd5e1',
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {loading ? (
        <ActivityIndicator color="#475569" size="small" />
      ) : (
        <>
          {icon}
          <Text style={{ color: '#1e293b', fontSize: 14.5, fontWeight: '700' }}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  )
}

export function SkeletonCard() {
  return (
    <CustomerCard>
      <View style={{ height: 18, width: '45%', backgroundColor: '#f1f5f9', borderRadius: 8, marginBottom: 14 }} />
      <View style={{ height: 14, width: '85%', backgroundColor: '#f8fafc', borderRadius: 6, marginBottom: 8 }} />
      <View style={{ height: 14, width: '65%', backgroundColor: '#f8fafc', borderRadius: 6, marginBottom: 16 }} />
      <View style={{ height: 44, width: '100%', backgroundColor: '#f1f5f9', borderRadius: 12 }} />
    </CustomerCard>
  )
}

export function ModernEmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <CustomerCard style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, textAlign: 'center' }}>
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: '#eff6ff',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <Text style={{ fontSize: 24 }}>✨</Text>
      </View>
      <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '800', marginBottom: 6, textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ color: '#64748b', fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginBottom: actionLabel ? 20 : 0 }}>
        {message}
      </Text>
      {actionLabel && onAction && (
        <View style={{ width: '100%', maxWidth: 220 }}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      )}
    </CustomerCard>
  )
}

export function ModernErrorCard({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <CustomerCard
      style={{
        backgroundColor: '#fef2f2',
        borderColor: '#fecaca',
        alignItems: 'center',
        paddingVertical: 24,
      }}
    >
      <Text style={{ color: '#991b1b', fontSize: 15, fontWeight: '800', marginBottom: 4 }}>
        Something went wrong
      </Text>
      <Text style={{ color: '#b91c1c', fontSize: 13, textAlign: 'center', marginBottom: onRetry ? 14 : 0 }}>
        {message}
      </Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={{
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#f87171',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: '#dc2626', fontSize: 12.5, fontWeight: '700' }}>Try Again</Text>
        </TouchableOpacity>
      )}
    </CustomerCard>
  )
}
