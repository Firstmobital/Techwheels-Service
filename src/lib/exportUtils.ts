/**
 * Utility functions for exporting report data to CSV and Excel formats
 */

/**
 * Convert array of objects to CSV content
 */
export function convertToCSV(data: Array<Record<string, any>>, headers?: string[]): string {
  if (data.length === 0) {
    return ''
  }

  // Use provided headers or extract from first object
  const keys = headers || Object.keys(data[0])

  // Create header row
  const headerRow = keys
    .map((key) => {
      const headerText = String(key).replace(/"/g, '""')
      return `"${headerText}"`
    })
    .join(',')

  // Create data rows
  const dataRows = data.map((obj) => {
    return keys
      .map((key) => {
        const value = obj[key]
        if (value === null || value === undefined) {
          return ''
        }
        const stringValue = String(value).replace(/"/g, '""')
        // Quote if contains comma, newline, or quote
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
          return `"${stringValue}"`
        }
        return stringValue
      })
      .join(',')
  })

  return [headerRow, ...dataRows].join('\n')
}

/**
 * Trigger download of CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Export data to CSV and trigger download
 */
export function exportToCSV(data: Array<Record<string, any>>, filename: string, headers?: string[]): void {
  const csv = convertToCSV(data, headers)
  downloadCSV(csv, `${filename}.csv`)
}

/**
 * Format currency value for export
 */
export function formatCurrencyForExport(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

/**
 * Format percentage value for export
 */
export function formatPercentageForExport(value: number | null): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`
}

/**
 * Generate filename with timestamp
 */
export function generateExportFilename(reportName: string): string {
  const now = new Date()
  const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-')
  return `${reportName}-${timestamp}`
}
