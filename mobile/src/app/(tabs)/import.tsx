import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { PORTAL_BRANCHES, type PortalBranch } from '../../lib/branches'
import { supabase } from '../../lib/supabase'
import { mapVasHeaders, buildVasInsertRow, formatParseErrors, type ParseError } from '../../lib/vasColumnMapper'
import {
  mapInvoiceHeaders,
  buildInvoiceInsertRow,
  formatInvoiceParseErrors,
  type InvoiceParseError,
} from '../../lib/invoiceColumnMapper'
import {
  mapJcClosedHeaders,
  buildJcClosedInsertRow,
  formatJcClosedParseErrors,
  type JcClosedParseError,
} from '../../lib/jcClosedColumnMapper'
import {
  mapPartsConsumptionHeaders,
  buildPartsConsumptionInsertRow,
  formatPartsConsumptionParseErrors,
  type PartsConsumptionParseError,
} from '../../lib/partsConsumptionColumnMapper'
import {
  mapPartsOrderHeaders,
  buildPartsOrderInsertRow,
  formatPartsOrderParseErrors,
  type PartsOrderParseError,
} from '../../lib/partsOrderColumnMapper'
import {
  mapPartsStockHeaders,
  buildPartsStockInsertRow,
  formatPartsStockParseErrors,
  type PartsStockParseError,
} from '../../lib/partsStockColumnMapper'
import { getTableColumns } from '../../lib/getTableColumns'

type CardStatus = 'idle' | 'uploading' | 'success' | 'error'

type SlotState = {
  fileName: string | null
  fileUri: string | null
  rowCount: number | null
  parseError: string | null
}

type CardState = {
  slots: Record<PortalBranch, SlotState>
  status: CardStatus
  uploadError: string | null
  insertedCount: number
}

type CardConfig = {
  tableName: string
  title: string
  description: string
}

const CARDS: CardConfig[] = [
  {
    tableName: 'job_card_closed_data',
    title: 'PSF Revenue Report',
    description: 'Closed job card records across all branches.',
  },
  {
    tableName: 'service_invoice_data',
    title: 'Invoice Data',
    description: 'Service invoice records across all branches.',
  },
  {
    tableName: 'service_vas_jc_data',
    title: 'VAS Data',
    description: 'Value-added service job card data across all branches.',
  },
  {
    tableName: 'service_parts_consumption_data',
    title: 'Parts Consumption',
    description: 'Parts consumption transactions across all branches.',
  },
  {
    tableName: 'service_parts_order_data',
    title: 'Parts Order',
    description: 'Parts ordering, in-transit, and backorder lines across all branches.',
  },
  {
    tableName: 'service_parts_stock_snapshot_data',
    title: 'Parts In Stock',
    description: 'On-hand inventory snapshot by part number across all branches.',
  },
]

function emptySlot(): SlotState {
  return {
    fileName: null,
    fileUri: null,
    rowCount: null,
    parseError: null,
  }
}

function emptyCard(): CardState {
  return {
    slots: {
      'Ajmer Road': emptySlot(),
      'Sitapura PV': emptySlot(),
      'Sitapura EV': emptySlot(),
    },
    status: 'idle',
    uploadError: null,
    insertedCount: 0,
  }
}

async function parseWorkbook(uri: string, name: string): Promise<Record<string, unknown>[]> {
  const lower = name.toLowerCase()
  if (lower.endsWith('.csv')) {
    const csvText = await FileSystem.readAsStringAsync(uri)
    const parsed = Papa.parse<Record<string, unknown>>(csvText, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
    })

    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0]?.message || 'Failed to parse CSV file')
    }

    return parsed.data
  }

  if (!lower.endsWith('.xlsx')) {
    throw new Error('Only .xlsx and .csv files are supported.')
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const workbook = XLSX.read(base64, { type: 'base64', raw: true, dense: true })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })
  return rows
}

function buildPartsSourceRowHash(
  tableName: string,
  branch: PortalBranch,
  row: Record<string, unknown>,
  rowNumber: number,
): string {
  const partNumber = row.part_number == null ? '' : String(row.part_number).trim().toUpperCase()
  const dateKey =
    tableName === 'service_parts_consumption_data'
      ? row.transaction_date
      : tableName === 'service_parts_order_data'
      ? row.order_date
      : row.snapshot_date
  const qtyKey =
    tableName === 'service_parts_consumption_data'
      ? row.quantity_consumed
      : tableName === 'service_parts_order_data'
      ? row.ordered_quantity
      : row.on_hand_quantity

  const raw = `${tableName}|${branch}|${partNumber}|${String(dateKey ?? '')}|${String(qtyKey ?? '')}|${rowNumber}`
  return raw.replace(/\s+/g, ' ').trim()
}

function isDuplicateViolation(error: { code?: string; message?: string }): boolean {
  const message = (error.message ?? '').toLowerCase()
  return error.code === '23505' || message.includes('duplicate key value violates unique constraint')
}

async function insertRowsWithDuplicateSkip(
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0

  const chunkSize = 2000

  const insertChunk = async (chunkRows: Record<string, unknown>[]): Promise<number> => {
    if (chunkRows.length === 0) return 0

    const { error: insertError } = await supabase.from(tableName).insert(chunkRows)

    if (!insertError) return chunkRows.length

    if (!isDuplicateViolation(insertError)) {
      throw new Error(insertError.message ?? `Insert failed for table ${tableName}`)
    }

    if (chunkRows.length === 1) {
      return 0
    }

    const mid = Math.floor(chunkRows.length / 2)
    const leftInserted = await insertChunk(chunkRows.slice(0, mid))
    const rightInserted = await insertChunk(chunkRows.slice(mid))
    return leftInserted + rightInserted
  }

  let inserted = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    inserted += await insertChunk(rows.slice(i, i + chunkSize))
  }
  return inserted
}

async function upsertOrInsertRows(
  tableName: string,
  rows: Record<string, unknown>[],
  onConflictCandidates: string[],
): Promise<number> {
  if (rows.length === 0) return 0

  if (onConflictCandidates.length === 0) {
    return insertRowsWithDuplicateSkip(tableName, rows)
  }

  const chunkSize = 2000
  let inserted = 0

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunkRows = rows.slice(i, i + chunkSize)
    let upsertHandled = false

    for (const onConflict of onConflictCandidates) {
      const { error: upsertError } = await supabase.from(tableName).upsert(chunkRows, {
        onConflict,
      })

      if (!upsertError) {
        upsertHandled = true
        inserted += chunkRows.length
        break
      }

      const message = upsertError.message ?? ''
      const lower = message.toLowerCase()
      const missingConflictConstraint = lower.includes(
        'no unique or exclusion constraint matching the on conflict specification',
      )

      if (missingConflictConstraint) {
        continue
      }

      throw new Error(message)
    }

    if (upsertHandled) continue

    inserted += await insertRowsWithDuplicateSkip(tableName, chunkRows)
  }

  return inserted
}

export default function ImportScreen() {
  const [cards, setCards] = useState<Record<string, CardState>>(() =>
    Object.fromEntries(CARDS.map((card) => [card.tableName, emptyCard()])),
  )
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = () => {
    setRefreshing(true)
    // Import screen state is local; refresh gesture provides native reload affordance.
    setTimeout(() => {
      setRefreshing(false)
    }, 300)
  }

  const handleSlotFile = async (tableName: string, branch: PortalBranch) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      })

      if (result.canceled || result.assets.length === 0) {
        return
      }

      const selected = result.assets[0]
      const fileName = selected.name || 'import-file'
      const uri = selected.uri

      setBusyKey(`${tableName}-${branch}`)
      const rows = await parseWorkbook(uri, fileName)

      setCards((prev) => ({
        ...prev,
        [tableName]: {
          ...prev[tableName],
          status: 'idle',
          uploadError: null,
          slots: {
            ...prev[tableName].slots,
            [branch]: {
              fileName,
              fileUri: uri,
              rowCount: rows.length,
              parseError: null,
            },
          },
        },
      }))
    } catch (error: any) {
      setCards((prev) => ({
        ...prev,
        [tableName]: {
          ...prev[tableName],
          status: 'idle',
          uploadError: null,
          slots: {
            ...prev[tableName].slots,
            [branch]: {
              ...prev[tableName].slots[branch],
              parseError: error?.message || 'Unable to parse selected file',
            },
          },
        },
      }))
    } finally {
      setBusyKey(null)
    }
  }

  const handleSlotClear = (tableName: string, branch: PortalBranch) => {
    setCards((prev) => ({
      ...prev,
      [tableName]: {
        ...prev[tableName],
        status: 'idle',
        uploadError: null,
        slots: {
          ...prev[tableName].slots,
          [branch]: emptySlot(),
        },
      },
    }))
  }

  const handleUpload = async (tableName: string) => {
    const card = cards[tableName]
    const hasReadyFiles = PORTAL_BRANCHES.some(
      (branch) => card.slots[branch].fileUri && !card.slots[branch].parseError,
    )

    if (!hasReadyFiles) {
      Alert.alert('No Files Ready', 'Pick at least one valid file before uploading.')
      return
    }

    try {
      setCards((prev) => ({
        ...prev,
        [tableName]: {
          ...prev[tableName],
          status: 'uploading',
          uploadError: null,
          insertedCount: 0,
        },
      }))

      const isVasTable = tableName === 'service_vas_jc_data'
      const isInvoiceTable = tableName === 'service_invoice_data'
      const isJcClosedTable = tableName === 'job_card_closed_data'
      const isPartsConsumptionTable = tableName === 'service_parts_consumption_data'
      const isPartsOrderTable = tableName === 'service_parts_order_data'
      const isPartsStockTable = tableName === 'service_parts_stock_snapshot_data'

      let totalInserted = 0
      const allVasErrors: ParseError[] = []
      const allInvoiceErrors: InvoiceParseError[] = []
      const allJcErrors: JcClosedParseError[] = []
      const allPartsConsumptionErrors: PartsConsumptionParseError[] = []
      const allPartsOrderErrors: PartsOrderParseError[] = []
      const allPartsStockErrors: PartsStockParseError[] = []

      const partsOrderColumns = isPartsOrderTable ? await getTableColumns(tableName) : []
      const partsOrderColumnSet = new Set(partsOrderColumns)
      const partsOrderHasDealerCode = partsOrderColumns.includes('dealer_code')
      const partsOrderHasDealerName = partsOrderColumns.includes('dealer_name')
      const partsOrderIncludesAll = (columns: string[]): boolean =>
        columns.every((columnName) => partsOrderColumnSet.has(columnName))
      const partsOrderOnConflictCandidates = isPartsOrderTable
        ? [
            'part_number,branch,order_date,source_row_hash',
            'part_number,branch,portal,order_date,source_row_hash',
            'part_number,branch,portal,order_date',
            'part_number,branch,order_date',
          ].filter((candidate) => partsOrderIncludesAll(candidate.split(',')))
        : []

      for (const branch of PORTAL_BRANCHES) {
        const slot = cards[tableName].slots[branch]
        if (!slot.fileUri || !slot.fileName || slot.parseError) continue

        const rawRows = await parseWorkbook(slot.fileUri, slot.fileName)
        if (rawRows.length === 0) continue

        const headers = Object.keys(rawRows[0])

        if (isVasTable) {
          const mapping = mapVasHeaders(headers)
          const rowsToInsert: Record<string, unknown>[] = []
          rawRows.forEach((raw, idx) => {
            const parsed = buildVasInsertRow(raw, branch, mapping, idx + 2)
            if (parsed.row) rowsToInsert.push(parsed.row)
            if (parsed.errors.length > 0) allVasErrors.push(...parsed.errors)
          })
          totalInserted += await insertRowsWithDuplicateSkip(tableName, rowsToInsert)
          continue
        }

        if (isInvoiceTable) {
          const mapping = mapInvoiceHeaders(headers)
          const rowsToInsert: Record<string, unknown>[] = []
          rawRows.forEach((raw, idx) => {
            const parsed = buildInvoiceInsertRow(raw, branch, mapping, idx + 2)
            if (parsed.row) rowsToInsert.push(parsed.row)
            if (parsed.errors.length > 0) allInvoiceErrors.push(...parsed.errors)
          })
          totalInserted += await insertRowsWithDuplicateSkip(tableName, rowsToInsert)
          continue
        }

        if (isJcClosedTable) {
          const mapping = mapJcClosedHeaders(headers)
          const rowsToInsert: Record<string, unknown>[] = []
          rawRows.forEach((raw, idx) => {
            const parsed = buildJcClosedInsertRow(raw, branch, mapping, idx + 2)
            if (parsed.row) rowsToInsert.push(parsed.row)
            if (parsed.errors.length > 0) allJcErrors.push(...parsed.errors)
          })
          totalInserted += await insertRowsWithDuplicateSkip(tableName, rowsToInsert)
          continue
        }

        if (isPartsConsumptionTable) {
          const mapping = mapPartsConsumptionHeaders(headers)
          const rowsToInsert: Record<string, unknown>[] = []

          rawRows.forEach((raw, idx) => {
            const sourceRowHash = buildPartsSourceRowHash(tableName, branch, raw, idx + 2)
            const parsed = buildPartsConsumptionInsertRow(raw, branch, 'EV', mapping, idx + 2, sourceRowHash)
            if (parsed.row) rowsToInsert.push(parsed.row)
            if (parsed.errors.length > 0) allPartsConsumptionErrors.push(...parsed.errors)
          })

          totalInserted += await upsertOrInsertRows(tableName, rowsToInsert, [
            'part_number,branch,transaction_date,source_row_hash',
            'part_number,branch,portal,transaction_date,source_row_hash',
            'part_number,branch,portal,fiscal_year,month_name,source_row_hash',
            'part_number,branch,portal,fiscal_year,month_name',
          ])
          continue
        }

        if (isPartsOrderTable) {
          const mapping = mapPartsOrderHeaders(headers)
          const rowsToInsert: Record<string, unknown>[] = []

          rawRows.forEach((raw, idx) => {
            const sourceRowHash = buildPartsSourceRowHash(tableName, branch, raw, idx + 2)
            const parsed = buildPartsOrderInsertRow(raw, branch, 'EV', mapping, idx + 2, sourceRowHash)
            if (parsed.row) {
              delete parsed.row.net_order_qty

              if (partsOrderColumns.length > 0) {
                for (const key of Object.keys(parsed.row)) {
                  if (key === 'source_row_hash') continue
                  if (!partsOrderColumnSet.has(key)) {
                    delete parsed.row[key]
                  }
                }

                if (!partsOrderHasDealerCode) {
                  const dealerCode = parsed.row.dealer_code
                  if (partsOrderHasDealerName && parsed.row.dealer_name == null && dealerCode != null) {
                    parsed.row.dealer_name = dealerCode
                  }
                  delete parsed.row.dealer_code
                }
              }

              const rowSourceHash =
                parsed.row.source_row_hash == null ? '' : String(parsed.row.source_row_hash).trim()
              if (!rowSourceHash) {
                const fallbackSourceHash = `${tableName}|${branch}|${String(
                  parsed.row.part_number ?? '',
                )
                  .trim()
                  .toUpperCase()}|${String(parsed.row.order_date ?? '')}|${String(
                  parsed.row.ordered_quantity ?? '',
                )}|${idx + 2}`
                parsed.row.source_row_hash = fallbackSourceHash.replace(/\s+/g, ' ').trim()
              }

              rowsToInsert.push(parsed.row)
            }
            if (parsed.errors.length > 0) allPartsOrderErrors.push(...parsed.errors)
          })

          totalInserted += await upsertOrInsertRows(
            tableName,
            rowsToInsert,
            partsOrderOnConflictCandidates.length > 0
              ? partsOrderOnConflictCandidates
              : ['part_number,branch,order_date'],
          )
          continue
        }

        if (isPartsStockTable) {
          const mapping = mapPartsStockHeaders(headers)
          const rowsToInsert: Record<string, unknown>[] = []

          rawRows.forEach((raw, idx) => {
            const sourceRowHash = buildPartsSourceRowHash(tableName, branch, raw, idx + 2)
            const parsed = buildPartsStockInsertRow(raw, branch, 'EV', mapping, idx + 2, sourceRowHash)
            if (parsed.row) rowsToInsert.push(parsed.row)
            if (parsed.errors.length > 0) allPartsStockErrors.push(...parsed.errors)
          })

          totalInserted += await upsertOrInsertRows(tableName, rowsToInsert, [
            'part_number,branch,snapshot_date,source_row_hash',
            'part_number,branch,portal,snapshot_date,source_row_hash',
            'part_number,branch,portal,snapshot_date',
          ])
          continue
        }

        throw new Error(
          `Upload logic for table ${tableName} is queued for the next increment. Use the first three import cards for now.`,
        )
      }

      const hasParseWarnings =
        allVasErrors.length > 0 ||
        allInvoiceErrors.length > 0 ||
        allJcErrors.length > 0 ||
        allPartsConsumptionErrors.length > 0 ||
        allPartsOrderErrors.length > 0 ||
        allPartsStockErrors.length > 0

      if (hasParseWarnings) {
        const messages: string[] = []
        if (allVasErrors.length > 0) {
          messages.push(`VAS parse issues:\n${formatParseErrors(allVasErrors.slice(0, 3))}`)
        }
        if (allInvoiceErrors.length > 0) {
          messages.push(`Invoice parse issues:\n${formatInvoiceParseErrors(allInvoiceErrors.slice(0, 3))}`)
        }
        if (allJcErrors.length > 0) {
          messages.push(`JC Closed parse issues:\n${formatJcClosedParseErrors(allJcErrors.slice(0, 3))}`)
        }
        if (allPartsConsumptionErrors.length > 0) {
          messages.push(
            `Parts Consumption parse issues:\n${formatPartsConsumptionParseErrors(allPartsConsumptionErrors.slice(0, 3))}`,
          )
        }
        if (allPartsOrderErrors.length > 0) {
          messages.push(
            `Parts Order parse issues:\n${formatPartsOrderParseErrors(allPartsOrderErrors.slice(0, 3))}`,
          )
        }
        if (allPartsStockErrors.length > 0) {
          messages.push(
            `Parts In Stock parse issues:\n${formatPartsStockParseErrors(allPartsStockErrors.slice(0, 3))}`,
          )
        }

        Alert.alert('Upload Completed With Parse Warnings', messages.join('\n\n'))
      } else {
        Alert.alert('Upload Complete', `${totalInserted.toLocaleString()} rows inserted.`)
      }

      const now = new Date().toISOString()
      const { error: importMetadataError } = await supabase
        .from('import_metadata')
        .upsert({ table_name: tableName, last_updated_at: now }, { onConflict: 'table_name' })

      if (importMetadataError) {
        console.warn(`import_metadata upsert failed for ${tableName}: ${importMetadataError.message}`)
      }

      setCards((prev) => ({
        ...prev,
        [tableName]: {
          ...prev[tableName],
          status: 'success',
          uploadError: null,
          insertedCount: totalInserted,
        },
      }))
    } catch (error: any) {
      setCards((prev) => ({
        ...prev,
        [tableName]: {
          ...prev[tableName],
          status: 'error',
          uploadError: error?.message || 'Upload failed',
        },
      }))
      Alert.alert('Upload Failed', error?.message || 'Upload failed')
    }
  }

  const totalReadyRows = useMemo(() => {
    return Object.values(cards).reduce((sum, card) => {
      return (
        sum +
        PORTAL_BRANCHES.reduce((inner, branch) => inner + (card.slots[branch].rowCount ?? 0), 0)
      )
    }, 0)
  }, [cards])

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="mb-4">
        <Text className="text-2xl font-bold text-slate-900">Import Data</Text>
        <Text className="text-sm text-slate-600 mt-1">
          Upload .xlsx or .csv files for each portal branch. Mobile UI, same import business model as web.
        </Text>
      </View>

      <View className="mb-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <Text className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Parity Progress</Text>
        <Text className="text-sm text-blue-900 mt-1">
          Slot workflow ready. Parsed rows staged: {totalReadyRows.toLocaleString()}.
        </Text>
      </View>

      {CARDS.map((config) => {
        const card = cards[config.tableName]
        const hasReadyFiles = PORTAL_BRANCHES.some(
          (branch) => card.slots[branch].fileUri && !card.slots[branch].parseError,
        )
        const cardRows = PORTAL_BRANCHES.reduce((sum, branch) => sum + (card.slots[branch].rowCount ?? 0), 0)

        return (
          <View key={config.tableName} className="mb-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <View className="px-4 py-3 border-b border-slate-100">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-base font-semibold text-slate-900">{config.title}</Text>
                  <Text className="text-xs text-slate-500 mt-1">{config.description}</Text>
                </View>
                <View className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                  <Text className="text-[10px] text-slate-500">{config.tableName}</Text>
                </View>
              </View>
            </View>

            <View className="px-4 py-3">
              {PORTAL_BRANCHES.map((branch) => {
                const slot = card.slots[branch]
                const slotBusy = busyKey === `${config.tableName}-${branch}`

                return (
                  <View key={branch} className="mb-3 last:mb-0 rounded-xl border border-slate-200 p-3">
                    <Text className="text-xs text-slate-500 mb-2">{branch}</Text>

                    <TouchableOpacity
                      className="rounded-lg border border-dashed border-slate-300 px-3 py-3 bg-slate-50"
                      onPress={() => handleSlotFile(config.tableName, branch)}
                      disabled={slotBusy}
                    >
                      {slotBusy ? (
                        <View className="flex-row items-center">
                          <ActivityIndicator size="small" color="#2563eb" />
                          <Text className="text-sm text-slate-600 ml-2">Parsing...</Text>
                        </View>
                      ) : slot.fileName ? (
                        <>
                          <Text className="text-sm font-medium text-slate-800">{slot.fileName}</Text>
                          <Text className="text-xs text-slate-500 mt-1">
                            {slot.rowCount?.toLocaleString() ?? 0} rows detected
                          </Text>
                        </>
                      ) : (
                        <Text className="text-sm text-slate-500">Tap to select .xlsx/.csv file</Text>
                      )}
                    </TouchableOpacity>

                    {slot.parseError ? (
                      <Text className="text-xs text-red-600 mt-2">{slot.parseError}</Text>
                    ) : null}

                    {slot.fileName ? (
                      <TouchableOpacity onPress={() => handleSlotClear(config.tableName, branch)} className="mt-2">
                        <Text className="text-xs text-blue-600">Clear file</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )
              })}
            </View>

            <View className="border-t border-slate-100 px-4 py-3 flex-row items-center justify-between">
              <Text className="text-xs text-slate-500">
                {hasReadyFiles ? `${cardRows.toLocaleString()} rows ready` : 'No valid files selected'}
              </Text>
              <TouchableOpacity
                className={`px-4 py-2 rounded-lg ${hasReadyFiles ? 'bg-blue-600' : 'bg-slate-300'}`}
                onPress={() => handleUpload(config.tableName)}
                disabled={!hasReadyFiles || card.status === 'uploading'}
              >
                <Text className="text-xs font-semibold text-white">
                  {card.status === 'uploading'
                    ? 'Uploading...'
                    : card.status === 'success'
                    ? `Uploaded ${card.insertedCount}`
                    : 'Upload All'}
                </Text>
              </TouchableOpacity>
            </View>

            {card.status === 'error' && card.uploadError ? (
              <View className="px-4 pb-3">
                <Text className="text-xs text-red-600">{card.uploadError}</Text>
              </View>
            ) : null}
          </View>
        )
      })}
    </ScrollView>
  )
}
