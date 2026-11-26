import { useCallback, useState } from 'react'

/** Runs one save at a time and reports its outcome. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const run = useCallback(async (action: () => Promise<void>, done: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(done)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  const clear = useCallback(() => { setError(null); setMessage(null) }, [])
  return { busy, error, message, run, setError, clear }
}
