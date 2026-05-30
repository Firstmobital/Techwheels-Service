import { useMemo } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

type ModelChipSelectorProps = {
  value: string
  options: string[]
  onChange: (value: string) => void
}

export default function ModelChipSelector({ value, options, onChange }: ModelChipSelectorProps) {
  const chips = useMemo(() => {
    const seen = new Set<string>()
    const normalized: string[] = []

    for (const option of options) {
      const trimmed = option.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(trimmed)
    }

    return normalized
  }, [options])

  const toDisplayLabel = (raw: string) => raw
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')

  return (
    <View>
      <View className="flex-row flex-wrap -mr-2">
        {chips.map((item) => {
          const active = value === item
          return (
            <TouchableOpacity
              key={item}
              className={`mr-2 mb-2 rounded-full border px-4 flex-row items-center ${active ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-300'}`}
              style={{ height: 32 }}
              onPress={() => onChange(item)}
            >
              <Text className={`text-[13px] font-medium ${active ? 'text-blue-900' : 'text-gray-700'}`}>{toDisplayLabel(item)}</Text>
              {active ? (
                <View className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5">
                  <Text className="text-[10px] font-semibold text-blue-700">✓</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}