/** How a bodyshop repair-card document was uploaded (customer app vs workshop). */
export function formatBodyshopDocumentUploadSource(
  doc: { uploaded_by?: string | null; storage_path?: string | null } | null | undefined,
): string | null {
  if (!doc) return null
  const by = String(doc.uploaded_by ?? '').trim()
  const path = String(doc.storage_path ?? '').trim()

  if (by.startsWith('customer:')) {
    const phone = by.slice('customer:'.length).trim()
    return phone ? `Customer app · ${phone}` : 'Customer app'
  }
  if (by === 'customer-app' || path.includes('/customer-portal/')) {
    return 'Customer app'
  }
  if (by.includes('@')) {
    return `Workshop · ${by}`
  }
  if (path.includes('service-advisor-bodyshop-docs')) {
    return 'Workshop upload'
  }
  if (by && by !== 'system') {
    return `Workshop · ${by}`
  }
  if (by === 'system') {
    return 'System'
  }
  return null
}
