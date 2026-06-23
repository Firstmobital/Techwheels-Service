import { useState } from 'react'
import {
  ActionSheetIOS,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

type NativeSelectFieldProps = {
  value: string
  placeholder: string
  options: string[]
  onChange: (value: string) => void
}

function uniqueOptions(options: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const option of options) {
    const trimmed = option.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

const styles = StyleSheet.create({
  touchable: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  valueText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  placeholderText: {
    fontSize: 14,
    color: '#9ca3af',
    flex: 1,
  },
  chevron: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8,
  },
  // Modal styles
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  cancelBtn: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  optionRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  optionText: {
    fontSize: 15,
    color: '#111827',
  },
  optionTextSelected: {
    fontSize: 15,
    color: '#2563eb',
    fontWeight: '700',
  },
  clearRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  clearText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
})

export default function NativeSelectField({ value, placeholder, options, onChange }: NativeSelectFieldProps) {
  const [open, setOpen] = useState(false)
  const list = uniqueOptions(options)

  const openPicker = () => {
    // iOS: use native ActionSheet
    if (Platform.OS === 'ios') {
      const sheetOptions = [placeholder, ...list, 'Cancel']
      const cancelButtonIndex = sheetOptions.length - 1
      ActionSheetIOS.showActionSheetWithOptions(
        { options: sheetOptions, cancelButtonIndex, title: placeholder },
        (index) => {
          if (index == null || index === cancelButtonIndex) return
          if (index === 0) { onChange(''); return }
          onChange(sheetOptions[index])
        },
      )
      return
    }

    // Android: open our own Modal (avoids the native Picker auto-open bug)
    setOpen(true)
  }

  const select = (option: string) => {
    setOpen(false)
    onChange(option)
  }

  return (
    <>
      <TouchableOpacity style={styles.touchable} onPress={openPicker} activeOpacity={0.75}>
        <Text style={value.trim() ? styles.valueText : styles.placeholderText}>
          {value.trim() || placeholder}
        </Text>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      {/* Android bottom-sheet modal — only rendered on Android */}
      {Platform.OS === 'android' && (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              {/* Header */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{placeholder}</Text>
                <TouchableOpacity onPress={() => setOpen(false)}>
                  <Text style={styles.cancelBtn}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={list}
                keyExtractor={(item) => item}
                ListHeaderComponent={
                  value.trim() ? (
                    <TouchableOpacity style={styles.clearRow} onPress={() => select('')}>
                      <Text style={styles.clearText}>— Clear selection —</Text>
                    </TouchableOpacity>
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.optionRow}
                    onPress={() => select(item)}
                    activeOpacity={0.6}
                  >
                    <Text style={item === value ? styles.optionTextSelected : styles.optionText}>
                      {item === value ? `✓  ${item}` : item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  )
}
