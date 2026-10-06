import { Text, TouchableOpacity, View } from 'react-native'

type Props = {
  message: string
  onRetry: () => void
  onDismiss?: () => void
}

/** Compact sticky banner for failed optimistic actions (staff screens). */
export function OptimisticActionErrorBar({ message, onRetry, onDismiss }: Props) {
  return (
    <View
      style={{
        backgroundColor: '#fef2f2',
        borderWidth: 1,
        borderColor: '#fecaca',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 12,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Text style={{ flex: 1, color: '#991b1b', fontSize: 12, fontWeight: '600' }} numberOfLines={3}>
        {message}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          backgroundColor: '#dc2626',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Retry</Text>
      </TouchableOpacity>
      {onDismiss ? (
        <TouchableOpacity onPress={onDismiss} hitSlop={8}>
          <Text style={{ color: '#b91c1c', fontSize: 16, fontWeight: '700' }}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}
