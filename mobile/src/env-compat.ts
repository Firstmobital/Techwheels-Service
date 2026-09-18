// Mobile environment compatibility layer
// Converts process.env (Expo) to import.meta.env (Vite web app expects)

declare global {
  interface ImportMeta {
    env: {
      [key: string]: string | undefined
    }
  }
}

// Polyfill import.meta.env for mobile
try {
  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {}
  if (!g.import) {
    g.import = { meta: { env: typeof process !== 'undefined' ? process.env : {} } }
  }
} catch {
  // Ignore in environments where strict object sealing prevents modification
}

export {}
