import { asNumber, asText } from '../../components/customer/customerUi'

export type EstimateLine = {
  id: string
  type: string
  description: string
  quantity: number | null
  unit_price: number | null
  total: number | null
}

export type EstimateView = {
  estimate_id: string
  estimate_no: string
  status: string
  items: EstimateLine[]
  subtotal: number | null
  discount: number | null
  gst_tax: number | null
  grand_total: number | null
  rejection_reason: string | null
  estimate_drive_url: string | null
  jc_number: string | null
}

function moneyIfPresent(row: Record<string, unknown>, key: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return null
  return asNumber(row[key])
}

export function parseEstimateItems(raw: unknown): EstimateLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry, index) => {
      const item = (entry || {}) as Record<string, unknown>
      const quantity = asNumber(item.quantity)
      const unitPrice = asNumber(item.unit_price ?? item.rate ?? item.unitPrice)
      const explicitTotal = asNumber(item.total ?? item.amount)
      const computed =
        quantity != null && unitPrice != null ? quantity * unitPrice : null
      return {
        id: String(item.id ?? index),
        type: asText(item.type) || 'labour',
        description: asText(item.description ?? item.name ?? item.service_name) || '',
        quantity,
        unit_price: unitPrice,
        total: explicitTotal ?? computed,
      }
    })
    .filter((item) => item.description.length > 0)
}

export function parseEstimate(row: Record<string, unknown>): EstimateView {
  const items = parseEstimateItems(row.items)
  const itemSum = items.reduce((sum, item) => sum + (item.total || 0), 0)
  const hasItemMoney = items.some((item) => item.total != null)
  const subtotal = moneyIfPresent(row, 'subtotal') ?? (hasItemMoney ? itemSum : null)
  return {
    estimate_id: String(row.estimate_id || row.estimate_no || row.id || ''),
    estimate_no: String(row.estimate_no || row.estimate_id || row.id || 'Estimate'),
    status: String(row.status || 'issued'),
    items,
    subtotal,
    discount: moneyIfPresent(row, 'discount'),
    gst_tax: moneyIfPresent(row, 'gst_tax') ?? moneyIfPresent(row, 'gst'),
    grand_total: moneyIfPresent(row, 'grand_total') ?? moneyIfPresent(row, 'total'),
    rejection_reason: asText(row.rejection_reason),
    estimate_drive_url: asText(row.estimate_drive_url),
    jc_number: asText(row.jc_number),
  }
}

export function estimateStatusKind(status: string): 'approved' | 'rejected' | 'pending' {
  const value = status.toLowerCase()
  if (value.includes('approv')) return 'approved'
  if (value.includes('reject')) return 'rejected'
  return 'pending'
}

export function computeSettlement(input: {
  billed?: unknown
  received?: unknown
  estimateTotal?: number | null
}): {
  billed: number | null
  received: number | null
  remaining: number | null
  status: 'paid' | 'partial' | 'due' | 'quoted' | 'empty'
} {
  const billedFromRecord = asNumber(input.billed)
  const received = asNumber(input.received)
  const billed =
    billedFromRecord != null && billedFromRecord > 0
      ? billedFromRecord
      : input.estimateTotal != null && input.estimateTotal > 0
        ? input.estimateTotal
        : billedFromRecord
  if (billed == null || billed <= 0) {
    return { billed: null, received: null, remaining: null, status: 'empty' }
  }
  if (received == null) {
    return {
      billed,
      received: null,
      remaining: null,
      status: billedFromRecord != null ? 'due' : 'quoted',
    }
  }
  const remaining = Math.max(0, billed - received)
  if (remaining === 0) return { billed, received, remaining, status: 'paid' }
  if (received > 0) return { billed, received, remaining, status: 'partial' }
  return { billed, received, remaining, status: 'due' }
}
