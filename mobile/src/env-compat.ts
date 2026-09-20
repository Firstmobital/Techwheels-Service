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

// Note: darkMode is configured via tailwind.config.js (darkMode: 'class').
// Do NOT call StyleSheet.setFlag at runtime — it throws in SDK 57 nativewind
// because the media-query strategy is already initialized before this runs.

export {}
