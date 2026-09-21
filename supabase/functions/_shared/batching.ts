/**
 * Reusable utility for chunking arrays and performing high-performance bulk database writes.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function chunkArray<T>(items: T[], chunkSize = 200): T[][] {
  if (!items || items.length === 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

export interface BatchWriteOptions {
  chunkSize?: number
  onConflict?: string
  ignoreDuplicates?: boolean
}

export async function bulkUpsert<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  records: T[],
  options?: BatchWriteOptions,
): Promise<{ success: boolean; insertedCount: number; errors: string[] }> {
  if (!records || records.length === 0) {
    return { success: true, insertedCount: 0, errors: [] }
  }

  const chunkSize = options?.chunkSize ?? 250
  const chunks = chunkArray(records, chunkSize)
  const errors: string[] = []
  let insertedCount = 0

  for (const chunk of chunks) {
    let query = supabase.from(table).upsert(chunk, {
      onConflict: options?.onConflict,
      ignoreDuplicates: options?.ignoreDuplicates,
    })

    const { data, error } = await query.select()
    if (error) {
      errors.push(`Table ${table} batch upsert failed: ${error.message}`)
    } else {
      insertedCount += data?.length ?? chunk.length
    }
  }

  return {
    success: errors.length === 0,
    insertedCount,
    errors,
  }
}

export async function bulkInsert<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  records: T[],
  chunkSize = 250,
): Promise<{ success: boolean; insertedCount: number; errors: string[] }> {
  if (!records || records.length === 0) {
    return { success: true, insertedCount: 0, errors: [] }
  }

  const chunks = chunkArray(records, chunkSize)
  const errors: string[] = []
  let insertedCount = 0

  for (const chunk of chunks) {
    const { data, error } = await supabase.from(table).insert(chunk).select()
    if (error) {
      errors.push(`Table ${table} batch insert failed: ${error.message}`)
    } else {
      insertedCount += data?.length ?? chunk.length
    }
  }

  return {
    success: errors.length === 0,
    insertedCount,
    errors,
  }
}
