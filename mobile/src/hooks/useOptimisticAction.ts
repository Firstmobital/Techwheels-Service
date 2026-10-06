import { useCallback, useRef, useState } from 'react'
import { STAFF_PORTAL_SERVER_FIRST_ACTIONS } from '../lib/staff/staffPortalPerformanceRevoked'

export type OptimisticActionOptions = {
  apply: () => void
  rollback: () => void
  execute: () => Promise<void>
  onSuccess?: () => void
  errorMessage?: (err: unknown) => string
  /** When true, rethrows after rollback (e.g. silent batch saves). */
  rethrow?: boolean
}

export type OptimisticActionFailure = {
  message: string
}

function defaultErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

/**
 * Instant UI update + background request. Rolls back on failure and exposes retry().
 */
export function useOptimisticAction() {
  const [failure, setFailure] = useState<OptimisticActionFailure | null>(null)
  const [runningKey, setRunningKey] = useState<string | null>(null)
  const lastRunRef = useRef<{ key: string | null; opts: OptimisticActionOptions } | null>(null)

  const clearFailure = useCallback(() => setFailure(null), [])

  const run = useCallback(async (key: string | null, opts: OptimisticActionOptions) => {
    lastRunRef.current = { key, opts }
    setFailure(null)
    setRunningKey(key)
    try {
      if (!STAFF_PORTAL_SERVER_FIRST_ACTIONS) {
        opts.apply()
      }
      await opts.execute()
      opts.onSuccess?.()
      setFailure(null)
    } catch (err) {
      if (!STAFF_PORTAL_SERVER_FIRST_ACTIONS) {
        opts.rollback()
      }
      setFailure({
        message: opts.errorMessage?.(err) ?? defaultErrorMessage(err),
      })
      if (opts.rethrow) throw err
    } finally {
      setRunningKey(null)
    }
  }, [])

  const retry = useCallback(async () => {
    const last = lastRunRef.current
    if (!last) return
    await run(last.key, last.opts)
  }, [run])

  const isRunning = useCallback(
    (key?: string | null) => {
      if (runningKey === null) return false
      if (key === undefined || key === null) return true
      return runningKey === key
    },
    [runningKey],
  )

  return { run, retry, failure, clearFailure, isRunning, runningKey }
}

/** One-shot optimistic update without retry state (class components / simple toggles). */
export async function runWithOptimisticRollback(opts: OptimisticActionOptions): Promise<void> {
  if (!STAFF_PORTAL_SERVER_FIRST_ACTIONS) {
    opts.apply()
  }
  try {
    await opts.execute()
    opts.onSuccess?.()
  } catch (err) {
    if (!STAFF_PORTAL_SERVER_FIRST_ACTIONS) {
      opts.rollback()
    }
    if (opts.rethrow) throw err
    throw err
  }
}
