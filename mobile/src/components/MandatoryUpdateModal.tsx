import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type MandatoryUpdateModalProps = {
  visible: boolean
  isApplyingUpdate: boolean
  isCheckingUpdate?: boolean
  errorMessage: string | null
  onUpdateNow: () => void
}

export default function MandatoryUpdateModal({
  visible,
  isApplyingUpdate,
  isCheckingUpdate = false,
  errorMessage,
  onUpdateNow,
}: MandatoryUpdateModalProps) {
  if (!visible) return null

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Update Required</Text>
          <Text style={styles.description}>
            A new app update is available. Please update now to continue using Techwheels Service.
          </Text>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <TouchableOpacity
            style={[styles.updateButton, (isApplyingUpdate || isCheckingUpdate) ? styles.updateButtonDisabled : null]}
            onPress={onUpdateNow}
            disabled={isApplyingUpdate || isCheckingUpdate}
            activeOpacity={0.85}
          >
            {isApplyingUpdate || isCheckingUpdate ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.buttonText}>{isApplyingUpdate ? 'Updating...' : 'Checking...'}</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>{errorMessage ? 'Retry Update' : 'Update Now'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2937',
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#b91c1c',
    marginBottom: 14,
  },
  updateButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  updateButtonDisabled: {
    opacity: 0.8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
})
