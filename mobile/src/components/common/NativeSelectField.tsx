import { ActionSheetIOS, Alert, Platform, Text, TouchableOpacity, View } from 'react-native'
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

export default function NativeSelectField({ value, placeholder, options, onChange }: NativeSelectFieldProps) {
  const list = uniqueOptions(options)

  if (Platform.OS === 'android') {
    return (
      <View className="border border-gray-300 rounded-lg bg-white overflow-hidden">
        <Picker
          selectedValue={value}
          mode="dropdown"
          onValueChange={(selected) => onChange(String(selected ?? ''))}
          style={{ height: 42 }}
        >
          <Picker.Item label={placeholder} value="" />
          {list.map((option) => (
            <Picker.Item key={option} label={option} value={option} />
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
    <TouchableOpacity className="border border-gray-300 rounded-lg px-3 py-3 bg-white" onPress={openSheet} activeOpacity={0.8}>
      <Text className={value.trim() ? 'text-gray-900' : 'text-gray-400'}>{value.trim() || placeholder}</Text>
    </TouchableOpacity>
  )
}