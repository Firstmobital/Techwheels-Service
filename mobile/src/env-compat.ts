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
if (typeof import.meta === 'undefined') {
  (globalThis as any).import = {
    meta: {
      env: process.env,
    },
  }
} else if (typeof import.meta.env === 'undefined') {
  import.meta.env = process.env as any
}

export {}
