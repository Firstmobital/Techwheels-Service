import { supabase } from '../supabase'

type EstimateExportRow = Record<string, unknown>

type EstimateExportPayload = {
  jc?: Record<string, unknown>
  rows?: EstimateExportRow[]
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function toCsv(payload: EstimateExportPayload): string {
  const jobCard = payload.jc ?? {}
  const rows = Array.isArray(payload.rows) ? payload.rows : []

  const lines: string[] = []
  lines.push('section,key,value')

  for (const [key, value] of Object.entries(jobCard)) {
    lines.push(`job_card,${csvEscape(key)},${csvEscape(value)}`)
  }

  lines.push('')
  lines.push('estimate_rows')

  if (rows.length === 0) {
    lines.push('No rows')
    return lines.join('\n')
  }

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key))
      return set
    }, new Set<string>()),
  )

  lines.push(headers.map(csvEscape).join(','))

  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','))
  }

  return lines.join('\n')
}

export async function generateEstimateCsv(jobCardId: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('estimate-export-data', {
    body: { jobCardId },
  })

  if (error) {
    throw new Error(error.message || 'Estimate export failed')
  }

  const payload = (data ?? {}) as EstimateExportPayload
  const csv = toCsv(payload)
  return new Blob([csv], { type: 'text/csv;charset=utf-8' })
}
