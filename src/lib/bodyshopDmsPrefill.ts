/** Map DMS product_line / model hints to a configured reception model name. */
export function matchModelFromDmsHint(hint: string | null | undefined, models: string[]): string {
  const raw = String(hint ?? '').trim()
  if (!raw || models.length === 0) return ''

  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!key) return ''

  const exact = models.find((m) => m.toUpperCase().replace(/[^A-Z0-9]/g, '') === key)
  if (exact) return exact

  const contained = models.find((m) => {
    const mk = m.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return mk.length >= 3 && (key.includes(mk) || mk.includes(key))
  })
  return contained ?? ''
}

export function portalToFuel(portal: string | null | undefined): 'EV' | 'PV' | '' {
  const p = String(portal ?? '').trim().toUpperCase()
  if (p === 'EV') return 'EV'
  if (p === 'PV') return 'PV'
  return ''
}