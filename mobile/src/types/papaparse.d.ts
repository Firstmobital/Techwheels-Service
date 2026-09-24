declare module 'papaparse' {
  export interface ParseError {
    type: string
    code: string
    message: string
    row?: number
  }

  export interface ParseResult<T> {
    data: T[]
    errors: ParseError[]
    meta: Record<string, unknown>
  }

  export interface ParseConfig<T = unknown> {
    header?: boolean
    skipEmptyLines?: boolean | 'greedy'
    transformHeader?: (header: string, index: number) => string
    transform?: (value: string, field: string | number) => unknown
    dynamicTyping?: boolean | Record<string, boolean> | ((field: string | number) => boolean)
    complete?: (results: ParseResult<T>) => void
    error?: (error: Error) => void
  }

  interface PapaStatic {
    parse<T = unknown>(input: string, config?: ParseConfig<T>): ParseResult<T>
    unparse(data: unknown, config?: Record<string, unknown>): string
  }

  const Papa: PapaStatic
  export default Papa
}
