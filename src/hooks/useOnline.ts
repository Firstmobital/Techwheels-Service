import { useEffect, useState } from 'react'

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const go  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  go)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online',  go)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
