import { Alert, Linking } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import type { InsuranceProvider } from '../../config/insuranceProviders'
import { getTpAffidavitPdfUrl, TP_AFFIDAVIT_FORM } from '../../config/customerFormDownloads'

function safeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, '_').slice(0, 80)
}

async function downloadPdfToDevice(url: string, fileName: string, missingMessage: string): Promise<void> {
  const cacheDir = FileSystem.cacheDirectory
  if (!cacheDir) {
    Alert.alert('Download failed', 'Unable to save the file on this device.')
    return
  }

  const fileUri = `${cacheDir}${safeFileName(fileName)}`

  try {
    const { uri, status } = await FileSystem.downloadAsync(url, fileUri)
    if (status < 200 || status >= 400) {
      throw new Error(`HTTP ${status}`)
    }

    const canShare = await Sharing.isAvailableAsync()
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save or open document',
        UTI: 'com.adobe.pdf',
      })
      return
    }

    Alert.alert('Saved', 'Document downloaded to app cache.')
  } catch {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url)
        return
      }
    } catch {
      // fall through
    }
    Alert.alert('Download failed', missingMessage)
  }
}

/** Download insurer motor claim PDF to cache and open the system share / save sheet. */
export async function downloadInsuranceClaimForm(provider: InsuranceProvider): Promise<void> {
  if (provider.isPaperless) {
    Alert.alert(
      `${provider.name}`,
      `${provider.name} is paperless. Techwheels will process your claim digitally — no printed claim form is required.`
    )
    return
  }

  const url = String(provider.claimFormUrl || '').trim()
  if (!url) {
    Alert.alert(
      `${provider.name}`,
      'We do not have a direct download link for this insurer yet. Your service advisor can share the official claim form, or visit the insurer website.'
    )
    return
  }

  await downloadPdfToDevice(
    url,
    `${safeFileName(provider.name)}_Motor_Claim_Form.pdf`,
    'Could not download the form. Check your connection or ask your service advisor for a copy.'
  )
}

export async function downloadTpAffidavitForm(): Promise<void> {
  const url = getTpAffidavitPdfUrl()
  if (!url) {
    Alert.alert(
      TP_AFFIDAVIT_FORM.title,
      'The affidavit template is not hosted in the app yet. Your service advisor can share the notarized T/P affidavit format.'
    )
    return
  }

  await downloadPdfToDevice(
    url,
    TP_AFFIDAVIT_FORM.fileName,
    'Could not download the T/P affidavit. Ask your service advisor for a copy.'
  )
}
