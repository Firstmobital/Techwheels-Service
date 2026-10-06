import { TouchableOpacity } from 'react-native'
import { Icon } from '../ui/Icon'

export function StaffRefreshButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Refresh"
      className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 items-center justify-center"
    >
      <Icon name="rotate-cw" size={18} color="#2563eb" strokeWidth={2.2} />
    </TouchableOpacity>
  )
}
