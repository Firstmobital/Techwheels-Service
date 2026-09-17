import { Linking, Text, TouchableOpacity, View } from 'react-native'

export const PRIVACY_URL = 'https://www.techwheels.in/privacy'
export const SUPPORT_URL = 'https://www.techwheels.in'
export const DELETION_MAILTO =
  'mailto:service@techwheels.in?subject=Techwheels%20Service%20data%20deletion%20request'

async function openUrl(url: string) {
  try {
    await Linking.openURL(url)
  } catch {
    // Ignore; user can copy the URL from the store listing if the device has no handler.
  }
}

export function LegalLinks({ compact = false }: { compact?: boolean }) {
  const textClass = compact
    ? 'text-slate-500 text-[12px] font-semibold'
    : 'text-slate-600 text-[13px] font-semibold'

  return (
    <View className={compact ? 'items-center' : undefined}>
      <View className="flex-row flex-wrap items-center justify-center">
        <TouchableOpacity onPress={() => void openUrl(PRIVACY_URL)} hitSlop={8}>
          <Text className={textClass}>Privacy Policy</Text>
        </TouchableOpacity>
        <Text className={`${textClass} mx-2`}>·</Text>
        <TouchableOpacity onPress={() => void openUrl(SUPPORT_URL)} hitSlop={8}>
          <Text className={textClass}>Support</Text>
        </TouchableOpacity>
        <Text className={`${textClass} mx-2`}>·</Text>
        <TouchableOpacity onPress={() => void openUrl(DELETION_MAILTO)} hitSlop={8}>
          <Text className={textClass}>Request data deletion</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
