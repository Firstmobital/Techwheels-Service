import { useEffect } from 'react'

/**
 * Prevents automatic page reload when the page regains focus or visibility.
 * This stops the "hard refresh" behavior when switching browser tabs/windows.
 */
export function usePreventAutoRefresh() {
  useEffect(() => {
    // Store original handlers
    const originalReload = window.location.reload.bind(window.location)

    // Override location.reload to log and prevent
    let reloadCount = 0
    const patchedReload = function () {
      reloadCount++
      console.warn(`[usePreventAutoRefresh] Blocked reload attempt #${reloadCount}`, {
        stack: new Error().stack,
      })
      // Don't call the original - this prevents the hard refresh
    }
    window.location.reload = patchedReload as any

    // Block programmatic navigation that might cause reload
    const originalReplace = window.location.replace.bind(window.location)
    window.location.replace = function (url: string) {
      if (url === window.location.href) {
        console.warn('[usePreventAutoRefresh] Blocked self-navigation', { url })
        return
      }
      originalReplace(url)
    } as any

    return () => {
      // Restore original functions on unmount
      window.location.reload = originalReload
      window.location.replace = originalReplace
    }
  }, [])
}
