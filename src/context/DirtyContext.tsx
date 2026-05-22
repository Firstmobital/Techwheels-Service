import { createContext, useContext, useState } from 'react'

interface Ctx { isDirty: boolean; setDirty: (v: boolean) => void }
const DirtyCtx = createContext<Ctx>({ isDirty: false, setDirty: () => {} })

export function DirtyProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setDirty] = useState(false)
  return <DirtyCtx.Provider value={{ isDirty, setDirty }}>{children}</DirtyCtx.Provider>
}

export const useDirty = () => useContext(DirtyCtx)
