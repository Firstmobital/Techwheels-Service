export const rupees = (paise: number) => `${paise < 0 ? '− ' : ''}Rs. ${Math.abs(Math.round(paise / 100)).toLocaleString('en-IN')}`

/** Whole or two-decimal rupees, commas allowed. Returns null for anything else, including blank and negative. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim()
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(cleaned)) return null
  return Number(cleaned)
}

export const EXPENSE_CATEGORIES = ['People', 'Premises', 'Operations', 'Admin', 'Finance']

export const currentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export const monthName = (month: string) =>
  new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

export const inputClass = 'rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100'
export const primaryButton = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
export const secondaryButton = 'rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'
export const cardClass = 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm'
