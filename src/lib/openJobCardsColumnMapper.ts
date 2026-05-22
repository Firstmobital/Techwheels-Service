import {
  mapCancelJobCardHeaders,
  buildCancelJobCardInsertRow,
  formatCancelJobCardParseErrors,
  type CancelJobCardParseError,
} from './cancelJobCardColumnMapper'

export type OpenJobCardsParseError = CancelJobCardParseError

export const mapOpenJobCardsHeaders = mapCancelJobCardHeaders
export const buildOpenJobCardsInsertRow = buildCancelJobCardInsertRow
export const formatOpenJobCardsParseErrors = formatCancelJobCardParseErrors
