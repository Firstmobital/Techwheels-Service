import { Alert } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'

export function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0])
  const headerLine = headers.join(',')
  const bodyLines = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header]
        const raw = value == null ? '' : String(value)
        return `"${raw.replace(/"/g, '""')}"`
      })
      .join(','),
  )

  return [headerLine, ...bodyLines].join('\n')
}

export async function shareCsv(content: string, fileStem: string): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  const fileName = `${fileStem}-${timestamp}.csv`
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`

  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  })

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) {
    Alert.alert('Export Ready', `CSV saved at: ${fileUri}`)
    return
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
  })
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}
