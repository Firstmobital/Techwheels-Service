import { ActionSheetIOS, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Picker } from '@react-native-picker/picker'

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
  androidWrapper: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    minHeight: 48,
    justifyContent: 'center',
  },
  picker: {
    height: 52,
    color: '#111827',
    fontSize: 14,
  },
  touchable: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  valueText: {
    fontSize: 14,
    color: '#111827',
  },
  placeholderText: {
    fontSize: 14,
    color: '#9ca3af',
  },
})

export default function NativeSelectField({ value, placeholder, options, onChange }: NativeSelectFieldProps) {
  const list = uniqueOptions(options)

  if (Platform.OS === 'android') {
    return (
      <View style={styles.androidWrapper}>
        <Picker
          selectedValue={value}
          mode="dropdown"
          onValueChange={(selected) => onChange(String(selected ?? ''))}
          style={styles.picker}
        >
          <Picker.Item label={placeholder} value="" color="#9ca3af" />
          {list.map((option) => (
            <Picker.Item key={option} label={option} value={option} color="#111827" />
          ))}
        </Picker>
      </View>
    )
  }

  const openSheet = () => {
    if (Platform.OS === 'ios') {
      const sheetOptions = [placeholder, ...list, 'Cancel']
      const cancelButtonIndex = sheetOptions.length - 1

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: sheetOptions,
          cancelButtonIndex,
          title: placeholder,
        },
        (index) => {
          if (index == null || index === cancelButtonIndex) return
          if (index === 0) {
            onChange('')
            return
          }
          onChange(sheetOptions[index])
        },
      )
      return
    }

    Alert.alert(
      placeholder,
      'Select an option',
      [
        { text: placeholder, onPress: () => onChange('') },
        ...list.map((option) => ({ text: option, onPress: () => onChange(option) })),
        { text: 'Cancel', style: 'cancel' },
      ],
    )
  }

  return (
    <TouchableOpacity style={styles.touchable} onPress={openSheet} activeOpacity={0.8}>
      <Text style={value.trim() ? styles.valueText : styles.placeholderText}>
        {value.trim() || placeholder}
      </Text>
    </TouchableOpacity>
  )
}
