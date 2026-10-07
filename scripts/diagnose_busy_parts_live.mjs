#!/usr/bin/env node
/**
 * Live BUSY Parts load diagnostic for an authenticated user.
 * Usage:
 *   BUSY_DIAG_EMAIL=... BUSY_DIAG_PASSWORD=... node scripts/diagnose_busy_parts_live.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { formatSupabaseError } from '../src/lib/supabaseError.ts'

function loadEnvLocal() {
  try {
    return readFileSync('.env.local', 'utf8')
  } catch {
    return ''
  }
}

const env = loadEnvLocal()
const url = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim()
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim()
const email = process.env.BUSY_DIAG_EMAIL?.trim()
const password = process.env.BUSY_DIAG_PASSWORD?.trim()

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}
if (!email || !password) {
  console.error('Set BUSY_DIAG_EMAIL and BUSY_DIAG_PASSWORD to run live diagnostic')
  process.exit(2)
}

const supabase = createClient(url, anonKey)

function logError(label, error) {
  if (!error) {
    console.log(`${label}: ok`)
    return
  }
  console.log(`${label}: FAILED`)
  console.log('  message:', error.message)
  console.log('  code:', error.code)
  console.log('  details:', error.details)
  console.log('  hint:', error.hint)
  console.log('  formatSupabaseError:', formatSupabaseError(error))
  console.log('  String(error):', String(error))
}

const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
if (signInError) {
  console.error('Sign-in failed:', signInError.message)
  process.exit(1)
}
console.log('Signed in as', signIn.user?.email, 'uid', signIn.user?.id)

const [{ data: isAdmin }, { data: perms }] = await Promise.all([
  supabase.rpc('is_admin'),
  supabase.rpc('get_all_my_permissions'),
])
console.log('is_admin RPC:', isAdmin)
console.log(
  'modules:',
  ((perms ?? []) ).filter((p) => p.module_name === 'busy' || p.module_name === 'admin'),
)

const rpcRes = await supabase.rpc('get_busy_parts_source_status')
logError('rpc get_busy_parts_source_status', rpcRes.error)
if (rpcRes.data) console.log('rpc data sample pv count:', rpcRes.data?.pv?.count)

const selectWithUploaded =
  'source_type, job_card_no, invoice_no, invoice_date, gst_rate, net_amount, source_row_key, source_file_name, uploaded_at, account_name, account_code'

const fetchRes = await supabase
  .from('busy_parts')
  .select(selectWithUploaded)
  .order('source_type', { ascending: true })
  .order('job_card_no', { ascending: true })
  .range(0, 999)

logError('fetchBusyPartsLines page 0 (with uploaded_at)', fetchRes.error)
console.log('page 0 rows:', fetchRes.data?.length ?? 0)

if (fetchRes.error) {
  const withoutUploaded = selectWithUploaded.replace(', uploaded_at', '')
  const retry = await supabase
    .from('busy_parts')
    .select(withoutUploaded)
    .order('source_type', { ascending: true })
    .order('job_card_no', { ascending: true })
    .range(0, 999)
  logError('fetch page 0 WITHOUT uploaded_at', retry.error)
  console.log('retry rows:', retry.data?.length ?? 0)
}

await supabase.auth.signOut()
