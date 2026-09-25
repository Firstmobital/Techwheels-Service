import { ReactNode } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { CustomerTheme } from '../../lib/customer/customerTheme'

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
          backgroundColor: CustomerTheme.card,
          borderWidth: 1,
          borderColor: CustomerTheme.border,
          borderRadius: CustomerTheme.radiusCard,
          padding: noPadding ? 0 : 16,
          marginBottom: 14,
          shadowColor: CustomerTheme.navy,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 2,
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
        backgroundColor: ok ? '#ECFDF5' : '#FEF2F2',
        borderColor: ok ? '#A7F3D0' : '#FECACA',
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: ok ? CustomerTheme.success : '#EF4444',
          marginRight: 10,
        }}
      />
      <Text
        style={{
          color: ok ? '#065F46' : '#991B1B',
          fontSize: 13.5,
          fontWeight: '700',
          flex: 1,
        }}
      >
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
    success: { bg: '#DCFCE7', text: '#166534', border: '#BBF7D0', dot: '#16A34A' },
    warning: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A', dot: '#D97706' },
    error: { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA', dot: '#DC2626' },
    info: { bg: CustomerTheme.tabActiveBg, text: CustomerTheme.teal, border: '#BAE6FD', dot: CustomerTheme.teal },
    default: { bg: '#F1F5F9', text: CustomerTheme.inkMuted, border: CustomerTheme.border, dot: CustomerTheme.inkSoft },
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
  mono,
}: {
  label: string
  value: string
  last?: boolean
  highlight?: boolean
  mono?: boolean
}) {
  return (
    <View
      style={{
        paddingBottom: last ? 0 : 12,
        marginBottom: last ? 0 : 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: CustomerTheme.border,
      }}
    >
      <Text
        style={{
          color: CustomerTheme.inkMuted,
          fontSize: 11,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: highlight ? CustomerTheme.teal : CustomerTheme.ink,
          fontSize: 15,
          fontWeight: '800',
          marginTop: 4,
          lineHeight: 21,
          fontFamily: mono ? 'monospace' : undefined,
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
  color = CustomerTheme.primary,
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
        borderRadius: CustomerTheme.radiusButton,
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
        borderColor: CustomerTheme.primary,
        borderRadius: CustomerTheme.radiusButton,
        paddingVertical: 14,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {loading ? (
        <ActivityIndicator color={CustomerTheme.primary} size="small" />
      ) : (
        <>
          {icon}
          <Text style={{ color: CustomerTheme.primary, fontSize: 14.5, fontWeight: '700' }}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  )
}

export type PhaseStepStatus = 'complete' | 'active' | 'upcoming'

export function HorizontalPhaseStepper({
  steps,
}: {
  steps: { label: string; status: PhaseStepStatus }[]
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 4, gap: 0, minWidth: '100%' }}
    >
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1
        const dotColor =
          step.status === 'complete'
            ? CustomerTheme.success
            : step.status === 'active'
              ? CustomerTheme.primary
              : CustomerTheme.border
        const labelColor =
          step.status === 'active' ? CustomerTheme.primary : step.status === 'complete' ? CustomerTheme.ink : CustomerTheme.inkSoft

        return (
          <View key={`${step.label}-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
            <View style={{ alignItems: 'center', minWidth: 72, maxWidth: 88 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: step.status === 'active' ? CustomerTheme.primaryLight : '#FFFFFF',
                  borderWidth: 2,
                  borderColor: dotColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {step.status === 'complete' ? (
                  <Text style={{ color: CustomerTheme.success, fontSize: 14, fontWeight: '900' }}>✓</Text>
                ) : (
                  <Text style={{ color: labelColor, fontSize: 12, fontWeight: '800' }}>{idx + 1}</Text>
                )}
              </View>
              <Text
                numberOfLines={2}
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  fontWeight: step.status === 'active' ? '800' : '600',
                  color: labelColor,
                  textAlign: 'center',
                  lineHeight: 13,
                }}
              >
                {step.label}
              </Text>
            </View>
            {!isLast ? (
              <View
                style={{
                  width: 24,
                  height: 2,
                  backgroundColor: step.status === 'complete' ? CustomerTheme.success : CustomerTheme.border,
                  marginTop: -18,
                  marginHorizontal: 2,
                }}
              />
            ) : null}
          </View>
        )
      })}
    </ScrollView>
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
