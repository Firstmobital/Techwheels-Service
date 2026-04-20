const SYSTEM_COLS = new Set(['id', 'created_at', 'updated_at', 'branch'])

export function matchColumns(
  parsedRows: Record<string, unknown>[],
  supabaseColumns: string[],
  branch: string,
): Record<string, unknown>[] {
  const insertableCols = supabaseColumns.filter((c) => !SYSTEM_COLS.has(c.toLowerCase()))

  return parsedRows.map((row) => {
    const excelHeaders = Object.keys(row)
    const out: Record<string, unknown> = { branch }

    for (const col of insertableCols) {
      const match = excelHeaders.find(
        (h) => h.trim().toLowerCase() === col.toLowerCase(),
      )
      if (match !== undefined) {
        out[col] = row[match] != null ? String(row[match]).trim() : ''
      }
    }

    return out
  })
}
