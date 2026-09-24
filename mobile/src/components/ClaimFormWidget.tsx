import { useState } from 'react'
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { INSURANCE_PROVIDERS } from '../config/insuranceProviders'

interface ClaimFormWidgetProps {
  userInsurerId?: string
}

export function ClaimFormWidget({ userInsurerId }: ClaimFormWidgetProps) {
  const [selectedProvider, setSelectedProvider] = useState(userInsurerId || '')
  const [isDownloading, setIsDownloading] = useState(false)
  const provider = INSURANCE_PROVIDERS[selectedProvider]

  const handleDownloadAndShare = async () => {
    if (!provider?.claimFormUrl) return

    setIsDownloading(true)
    try {
      const cacheDir = FileSystem.cacheDirectory
      if (!cacheDir) {
        Alert.alert('Download failed', 'Unable to save the form on this device.')
        return
      }

      const fileName = `${provider.name.replace(/\s+/g, '_')}_Claim_Form.pdf`
      const fileUri = `${cacheDir}${fileName}`
      const { uri } = await FileSystem.downloadAsync(provider.claimFormUrl, fileUri)
      const canShare = await Sharing.isAvailableAsync()
      if (!canShare) {
        Alert.alert('Saved', 'The claim form was downloaded, but sharing is not available on this device.')
        return
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save or Share Claim Form',
        UTI: 'com.adobe.pdf',
      })
    } catch (error) {
      console.error('Error downloading claim form:', error)
      Alert.alert('Download failed', 'Unable to download the form. Please check your connection.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 border border-slate-200">
      <Text className="text-[18px] font-bold text-slate-900 mb-1">Insurance Claim Form</Text>
      <Text className="text-[14px] text-slate-500 mb-4">
        Get the official paperwork needed to start your repair approval.
      </Text>

      {!userInsurerId ? (
        <View className="border border-slate-200 rounded-lg mb-4 bg-slate-50 overflow-hidden">
          <Picker
            selectedValue={selectedProvider}
            onValueChange={(itemValue) => setSelectedProvider(String(itemValue))}
          >
            <Picker.Item label="Select Insurance Company..." value="" />
            {Object.values(INSURANCE_PROVIDERS).map((insurer) => (
              <Picker.Item key={insurer.id} label={insurer.name} value={insurer.id} />
            ))}
          </Picker>
        </View>
      ) : null}

      {provider?.isPaperless ? (
        <View className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <Text className="text-emerald-800 text-[14px] leading-5">
            <Text className="font-bold">{provider.name}</Text> is 100% paperless. No physical form required. We will process your claim digitally.
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          className={`rounded-lg py-3.5 items-center ${!selectedProvider || isDownloading ? 'bg-slate-400' : 'bg-blue-600'}`}
          disabled={!selectedProvider || isDownloading}
          onPress={() => void handleDownloadAndShare()}
        >
          {isDownloading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-[16px]">
              {selectedProvider && provider ? `Download ${provider.name} Form` : 'Select Provider First'}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  )
}
