import { FlatList, Text, TouchableOpacity, View } from 'react-native'
import type { PanelRow } from '../../lib/api'

interface PanelSelectorProps {
  panels: PanelRow[]
  selectedPanelId: string | null
  onSelectPanel: (panelId: string) => void
}

export function PanelSelector({ panels, selectedPanelId, onSelectPanel }: PanelSelectorProps) {
  return (
    <View className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <Text className="text-xs uppercase tracking-wide text-gray-500 px-4 pt-3 pb-1">
        Select Panel
      </Text>
      <FlatList
        data={panels}
        horizontal
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            className={`flex-1 px-3 py-3 mx-1 rounded-lg ${
              selectedPanelId === item.id ? 'bg-blue-600' : 'bg-gray-100'
            }`}
            onPress={() => onSelectPanel(item.id)}
          >
            <Text
              className={`text-sm font-semibold text-center ${
                selectedPanelId === item.id ? 'text-white' : 'text-gray-800'
              }`}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
        scrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
      />
    </View>
  )
}
