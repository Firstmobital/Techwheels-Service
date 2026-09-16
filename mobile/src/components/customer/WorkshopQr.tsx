import { Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

export function WorkshopQr({ value }: { value: string }) {
  return (
    <View className="bg-white border-2 border-slate-900 rounded-xl p-3 items-center">
      <QRCode value={value} size={140} />
      <Text className="text-[10px] text-slate-500 mt-2 text-center">Workshop exit token</Text>
    </View>
  )
}
