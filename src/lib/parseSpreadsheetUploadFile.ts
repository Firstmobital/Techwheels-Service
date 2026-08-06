import { read, utils, type WorkBook } from 'xlsx'

export interface ParsedSpreadsheetFile {
  workbook: WorkBook
  sheetNames: string[]
}

function sheetRowCount(workbook: WorkBook, sheetName: string): number {
  const ws = workbook.Sheets[sheetName]
  if (!ws) return 0
  return utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' }).length
}

function nonEmptySheetNames(workbook: WorkBook): string[] {
  return (workbook.SheetNames ?? []).filter((name) => sheetRowCount(workbook, name) > 0)
}

function rowsFromWorkbook(workbook: WorkBook): Record<string, unknown>[] {
  const sheetName = nonEmptySheetNames(workbook)[0] ?? workbook.SheetNames?.[0]
  if (!sheetName) return []
  const ws = workbook.Sheets[sheetName]
  if (!ws) return []
  return utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
}

function parseFromText(data: Uint8Array): ParsedSpreadsheetFile | null {
  const hasUtf16LeBom = data.length >= 2 && data[0] === 0xff && data[1] === 0xfe
  const hasUtf16BeBom = data.length >= 2 && data[0] === 0xfe && data[1] === 0xff
  const decodeAttempts: Array<string | undefined> = hasUtf16LeBom
    ? ['utf-16le', 'utf-8', 'utf-16be', undefined]
    : hasUtf16BeBom
      ? ['utf-16be', 'utf-8', 'utf-16le', undefined]
      : [undefined, 'utf-8', 'utf-16le', 'utf-16be']

  for (const encoding of decodeAttempts) {
    try {
      const text = new TextDecoder(encoding).decode(data).replace(/^\uFEFF/, '')
      if (!text.trim()) continue
      if (text.includes('\u0000')) continue

      const workbook = read(text, {
        type: 'string',
        raw: true,
        dense: true,
        cellDates: true,
        FS: text.includes('\t') ? '\t' : ',',
      })
      if (rowsFromWorkbook(workbook).length > 0) {
        return {
          workbook,
          sheetNames: nonEmptySheetNames(workbook),
        }
      }
    } catch {
      // Try the next encoding.
    }
  }

  return null
}

export async function parseSpreadsheetUploadFile(file: File): Promise<ParsedSpreadsheetFile> {
  const data = new Uint8Array(await file.arrayBuffer())
  const isTextLike = /\.(csv|txt)$/i.test(file.name)

  if (isTextLike) {
    const parsed = parseFromText(data)
    if (parsed && parsed.sheetNames.length > 0) {
      return parsed
    }
  }

  let workbook: WorkBook
  try {
    workbook = read(data, { type: 'array', cellDates: true, raw: true, dense: true })
  } catch (error) {
    if (isTextLike) {
      const parsed = parseFromText(data)
      if (parsed && parsed.sheetNames.length > 0) {
        return parsed
      }
    }
    throw error
  }

  const sheetNames = nonEmptySheetNames(workbook)
  if (sheetNames.length > 0) {
    return { workbook, sheetNames }
  }

  if (isTextLike) {
    const parsed = parseFromText(data)
    if (parsed && parsed.sheetNames.length > 0) {
      return parsed
    }
  }

  return { workbook, sheetNames }
}

export function getSpreadsheetSheetRows(
  workbook: WorkBook,
  sheetName: string,
): Record<string, unknown>[] {
  const ws = workbook.Sheets[sheetName]
  if (!ws) return []
  return utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
}
