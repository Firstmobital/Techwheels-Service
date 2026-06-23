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
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
  },
  valueText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
    flex: 1,
  },
  placeholderText: {
    fontSize: 15,
    color: '#6b7280',
    flex: 1,
  },
  chevron: {
    fontSize: 11,
    color: '#374151',
    marginLeft: 8,
  },
  // Modal / bottom-sheet styles
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 32,
    maxHeight: '72%',
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cancelBtn: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  optionRow: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 15,
    color: '#111827',
    flex: 1,
  },
  optionTextSelected: {
    fontSize: 15,
    color: '#1d4ed8',
    fontWeight: '700',
    flex: 1,
  },
  checkMark: {
    fontSize: 16,
    color: '#1d4ed8',
    fontWeight: '700',
    marginLeft: 8,
  },
  clearRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fafafa',
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

    // Android: open Modal bottom-sheet (avoids native Picker auto-open bug)
    setOpen(true)
  }

  const select = (option: string) => {
    setOpen(false)
    onChange(option)
  }

  return (
    <>
      <TouchableOpacity style={styles.touchable} onPress={openPicker} activeOpacity={0.7}>
        <Text style={value.trim() ? styles.valueText : styles.placeholderText} numberOfLines={1}>
          {value.trim() || placeholder}
        </Text>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      {/* Android bottom-sheet modal */}
      {Platform.OS === 'android' && (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              {/* Header */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{placeholder}</Text>
                <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.cancelBtn}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={list}
                keyExtractor={(item) => item}
                ListHeaderComponent={
                  value.trim() ? (
                    <TouchableOpacity style={styles.clearRow} onPress={() => select('')}>
                      <Text style={styles.clearText}>Clear selection</Text>
                    </TouchableOpacity>
                  ) : null
                }
                renderItem={({ item }) => {
                  const selected = item === value
                  return (
                    <TouchableOpacity
                      style={styles.optionRow}
                      onPress={() => select(item)}
                      activeOpacity={0.5}
                    >
                      <Text style={selected ? styles.optionTextSelected : styles.optionText}>
                        {item}
                      </Text>
                      {selected ? <Text style={styles.checkMark}>✓</Text> : null}
                    </TouchableOpacity>
                  )
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  )
}
