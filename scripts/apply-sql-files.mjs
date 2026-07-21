#!/usr/bin/env node
/**
 * Apply P1-12 / SUPABASE-003 migrations via Supabase Management API.
 * Usage: node scripts/apply-sql-files.mjs path/to/file.sql [more...]
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function parseDotenv(content) {
  const out = {}
  for (const line of String(content ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

async function loadEnv() {
  const merged = { ...process.env }
  for (const rel of ['.env.local', '.env']) {
    try {
      const text = await fs.readFile(path.join(repoRoot, rel), 'utf8')
      Object.assign(merged, parseDotenv(text))
    } catch {
      /* ignore */
    }
  }
  return merged
}

async function runSql(projectRef, token, sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    console.error(`\n❌ ${label} failed (${res.status})`)
    console.error(JSON.stringify(data, null, 2))
    process.exit(1)
  }
  console.log(`✓ ${label}`)
  if (Array.isArray(data) && data.length > 0 && data.length <= 20) {
    console.log(JSON.stringify(data, null, 2))
  } else if (data && typeof data === 'object' && !Array.isArray(data)) {
    console.log(JSON.stringify(data, null, 2))
  }
}

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('Usage: node scripts/apply-sql-files.mjs <file.sql> ...')
    process.exit(1)
  }

  const env = await loadEnv()
  const projectRef = (env.SUPABASE_PROJECT_REF || 'jmdndcphkmaljhwgzqxq').replace(
    /.*\/project\//,
    '',
  )
  const token = env.SUPABASE_MANAGEMENT_TOKEN
  if (!token) {
    console.error('Missing SUPABASE_MANAGEMENT_TOKEN in .env.local')
    process.exit(1)
  }

  for (const rel of files) {
    const abs = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel)
    const sql = await fs.readFile(abs, 'utf8')
    await runSql(projectRef, token, sql, path.basename(abs))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
