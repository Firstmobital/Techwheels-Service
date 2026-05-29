import {
  mapCancelJobCardHeaders,
  buildCancelJobCardInsertRow,
  formatCancelJobCardParseErrors,
  type CancelJobCardParseError,
} from './cancelJobCardColumnMapper'

export type ClosedButNotInvoicedParseError = CancelJobCardParseError

export const mapClosedButNotInvoicedHeaders = mapCancelJobCardHeaders
export const buildClosedButNotInvoicedInsertRow = buildCancelJobCardInsertRow
export const formatClosedButNotInvoicedParseErrors = formatCancelJobCardParseErrors
