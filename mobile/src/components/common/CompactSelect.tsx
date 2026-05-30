import { useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

type CompactSelectProps = {
  label: string
  value: string
  placeholder: string
  options: string[]
  onChange: (value: string) => void
}

export default function CompactSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: CompactSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const normalizedOptions = useMemo(() => {
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
  }, [options])

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return normalizedOptions
    return normalizedOptions.filter((option) => option.toLowerCase().includes(needle))
  }, [normalizedOptions, query])

  const selectedLabel = value.trim() || placeholder

  return (
    <>
      <TouchableOpacity
        className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text className={value.trim() ? 'text-gray-900' : 'text-gray-400'}>{selectedLabel}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/30" onPress={() => setOpen(false)}>
          <Pressable className="mt-auto rounded-t-2xl bg-white px-4 pt-4 pb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-semibold text-gray-900">{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text className="text-sm font-semibold text-blue-600">Done</Text>
              </TouchableOpacity>
            </View>

            {normalizedOptions.length > 8 ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search..."
                className="border border-gray-300 rounded-lg px-3 py-2 bg-white mb-3"
              />
            ) : null}

            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                className={`rounded-lg px-3 py-3 mb-2 border ${value.trim() ? 'border-gray-200 bg-white' : 'border-blue-200 bg-blue-50'}`}
                onPress={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                <Text className={`text-sm ${value.trim() ? 'text-gray-700' : 'text-blue-700 font-semibold'}`}>{placeholder}</Text>
              </TouchableOpacity>

              {filteredOptions.map((option) => {
                const active = value === option
                return (
                  <TouchableOpacity
                    key={option}
                    className={`rounded-lg px-3 py-3 mb-2 border ${active ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}
                    onPress={() => {
                      onChange(option)
                      setOpen(false)
                    }}
                  >
                    <Text className={`text-sm ${active ? 'text-blue-700 font-semibold' : 'text-gray-800'}`}>{option}</Text>
                  </TouchableOpacity>
                )
              })}

              {filteredOptions.length === 0 ? (
                <Text className="text-sm text-gray-500 py-3">No options found</Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}