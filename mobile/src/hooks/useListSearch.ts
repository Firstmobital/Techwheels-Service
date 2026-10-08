import { useCallback, useMemo, useState } from 'react'

/**
 * List search: type freely in `draft`, filter/load only after `apply()` (Search button or keyboard submit).
 * Prevents server reloads and list jumping on every keystroke while entering a reg / phone number.
 */
export function useListSearch() {
  const [draft, setDraft] = useState('')
  const [applied, setApplied] = useState('')

  const apply = useCallback(() => {
    setApplied(draft.trim())
  }, [draft])

  const clear = useCallback(() => {
    setDraft('')
    setApplied('')
  }, [])

  const appliedNorm = useMemo(() => applied.trim().toLowerCase(), [applied])

  return {
    draft,
    setDraft,
    applied: applied.trim(),
    appliedNorm,
    apply,
    clear,
    hasApplied: applied.trim().length > 0,
  }
}
