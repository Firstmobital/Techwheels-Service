import { Text, TouchableOpacity, View, StyleSheet } from 'react-native'

type Props = {
  message: string
  onRetry?: () => void
}

export function StaffListLoadErrorBanner({ message, onRetry }: Props) {
  if (!message.trim()) return null
  return (
    <View style={S.banner}>
      <Text style={S.text} numberOfLines={5}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={S.retry} accessibilityRole="button" accessibilityLabel="Retry loading list">
          <Text style={S.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const S = StyleSheet.create({
  banner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  text: { flex: 1, fontSize: 12, color: '#b91c1c', fontWeight: '600' },
  retry: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#dc2626',
  },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
})
