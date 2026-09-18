type EnvBag = Record<string, string | undefined>

function readFromBag(env: EnvBag, key: string): string | undefined {
  const value = env[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function getViteEnv(): EnvBag {
  try {
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {}
    if (g.import?.meta?.env) return g.import.meta.env as EnvBag
  } catch {
    // Ignore
  }
  return {}
}

function getProcessEnv(): EnvBag {
  if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
    return process.env as EnvBag
  }
  return {}
}

export function readEnv(preferredKey: string, fallbackKeys: string[] = []): string | undefined {
  const keys = [preferredKey, ...fallbackKeys]
  const viteEnv = getViteEnv()
  const processEnv = getProcessEnv()

  for (const key of keys) {
    const fromVite = readFromBag(viteEnv, key)
    if (fromVite) return fromVite

    const fromProcess = readFromBag(processEnv, key)
    if (fromProcess) return fromProcess
  }

  return undefined
}

export function getSupabaseBaseUrl(): string {
  const value = readEnv('EXPO_PUBLIC_SUPABASE_URL', ['VITE_SUPABASE_URL'])
  return value ? value.replace(/\/$/, '') : ''
}

export function getAutodocBucketEnv(): string {
  return readEnv('EXPO_PUBLIC_SUPABASE_AUTODOC_BUCKET', ['VITE_SUPABASE_AUTODOC_BUCKET']) ?? 'autodoc'
}

export function getRcLookupFunctionEnv(): string {
  return readEnv('EXPO_PUBLIC_RC_LOOKUP_FUNCTION_NAME', ['VITE_RC_LOOKUP_FUNCTION_NAME']) ?? 'invoke-ocean025'
}
