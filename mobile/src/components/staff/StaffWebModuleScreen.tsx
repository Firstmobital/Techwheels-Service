import { Linking, Text, TouchableOpacity, View } from 'react-native'
import { StaffScreenShell } from './StaffScreenShell'
import { staffWebModuleUrl } from '../../lib/staffWebApp'

type Props = {
  title: string
  subtitle: string
  webPath: string
}

export function StaffWebModuleScreen({ title, subtitle, webPath }: Props) {
  const url = staffWebModuleUrl(webPath)

  const openWeb = async () => {
    const canOpen = await Linking.canOpenURL(url)
    if (canOpen) {
      await Linking.openURL(url)
    }
  }

  return (
    <StaffScreenShell title={title} subtitle={subtitle}>
      <View className="px-4 pt-4 gap-4">
        <View className="bg-white rounded-2xl border border-slate-200 p-4">
          <Text className="text-slate-800 text-[15px] leading-6">
            This workspace runs in the Techwheels web app. Sign in with the same staff account, then use the full
            {' '}
            {title}
            {' '}
            module (job cards, earnings drill-down, and saves).
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Open ${title} in browser`}
            className="mt-4 bg-blue-600 rounded-xl py-3 items-center"
            onPress={() => void openWeb()}
          >
            <Text className="text-white font-bold text-[15px]">Open {title}</Text>
          </TouchableOpacity>
          <Text className="text-slate-400 text-xs mt-3" selectable>
            {url}
          </Text>
        </View>
      </View>
    </StaffScreenShell>
  )
}
