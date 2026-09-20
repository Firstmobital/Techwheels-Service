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

// Ensure CSS interop dark mode allows manual setting
try {
  const { StyleSheet } = require('react-native-css-interop')
  if (StyleSheet && typeof StyleSheet.setFlag === 'function') {
    StyleSheet.setFlag('darkMode', 'class')
  }
} catch {
  // Ignore
}

export {}
