const envBucket = (import.meta.env.VITE_SUPABASE_AUTODOC_BUCKET as string | undefined)?.trim()

export const AUTODOC_BUCKET = envBucket && envBucket.length > 0 ? envBucket : 'autodoc'
