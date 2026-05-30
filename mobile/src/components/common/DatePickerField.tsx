import { useMemo, useState } from 'react'
import { Modal, Platform, Pressable, Text, TouchableOpacity, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker'

type DatePickerFieldProps = {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

function toDateValue(raw: string): Date {
  const value = raw.trim()
  if (!value) return new Date()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date()
  return parsed
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function DatePickerField({ value, placeholder = 'YYYY-MM-DD', onChange }: DatePickerFieldProps) {
  const [showIosPicker, setShowIosPicker] = useState(false)
  const [iosDraftDate, setIosDraftDate] = useState<Date>(toDateValue(value))
  const selectedDate = useMemo(() => toDateValue(value), [value])

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'date',
        value: selectedDate,
        onChange: (event, date) => {
          if (event.type !== 'set' || !date) return
          onChange(formatDate(date))
        },
      })
      return
    }

    setIosDraftDate(selectedDate)
    setShowIosPicker(true)
  }

  const onIosPickerChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (!date) return
    setIosDraftDate(date)
  }

  return (
    <>
      <TouchableOpacity className="border border-gray-300 rounded-lg px-3 py-3 bg-white" onPress={openPicker} activeOpacity={0.8}>
        <Text className={value.trim() ? 'text-gray-900' : 'text-gray-400'}>{value.trim() || placeholder}</Text>
      </TouchableOpacity>

      <Modal visible={showIosPicker} transparent animationType="fade" onRequestClose={() => setShowIosPicker(false)}>
        <Pressable className="flex-1 bg-black/30 items-center justify-center" onPress={() => setShowIosPicker(false)}>
          <Pressable className="w-[88%] rounded-xl bg-white p-4">
            <Text className="text-base font-semibold text-gray-900 mb-3">Select date</Text>
            <DateTimePicker
              mode="date"
              display="inline"
              value={iosDraftDate}
              onChange={onIosPickerChange}
            />
            <View className="flex-row justify-end mt-3">
              <TouchableOpacity className="px-3 py-2 mr-2" onPress={() => setShowIosPicker(false)}>
                <Text className="text-sm font-semibold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-3 py-2"
                onPress={() => {
                  onChange(formatDate(iosDraftDate))
                  setShowIosPicker(false)
                }}
              >
                <Text className="text-sm font-semibold text-blue-600">Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}