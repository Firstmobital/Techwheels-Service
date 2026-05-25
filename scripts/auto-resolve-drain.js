#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jmdndcphkmaljhwgzqxq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0',
)

const FETCH_SIZE = 2000
const PARALLEL = 100

const { data: employees, error: empErr } = await supabase.from('employee_master').select('*')
if (empErr) throw new Error(empErr.message)

const byCode = new Map()
const byName = new Map()
for (const e of employees ?? []) {
  byCode.set(String(e.employee_code ?? '').toLowerCase().trim(), e)
  byName.set(String(e.employee_name ?? '').toLowerCase().trim(), e)
}

let cycle = 0
let totalResolved = 0
let totalFailed = 0
const failedCodes = new Set()

while (true) {
  cycle += 1
  const { data: batch, error } = await supabase
    .from('import_employee_mapping_issues')
    .select('id,sr_assigned_to,status')
    .eq('status', 'open')
    .limit(FETCH_SIZE)

  if (error) throw new Error(error.message)
  if (!batch || batch.length === 0) break

  let cycleResolved = 0
  let cycleFailed = 0
  const queue = []

  for (const issue of batch) {
    const raw = String(issue.sr_assigned_to ?? '').trim()
    if (!raw) {
      cycleFailed += 1
      failedCodes.add('UNKNOWN')
      continue
    }

    const key = raw.toLowerCase()
    const m = byCode.get(key) ?? byName.get(key)
    if (!m) {
      cycleFailed += 1
      failedCodes.add(raw)
      continue
    }

    queue.push(
      supabase
        .from('import_employee_mapping_issues')
        .update({ status: 'resolved', resolved_employee_code: m.employee_code })
        .eq('id', issue.id)
    )

    if (queue.length >= PARALLEL) {
      const res = await Promise.all(queue)
      for (const r of res) {
        if (r.error) cycleFailed += 1
        else cycleResolved += 1
      }
      queue.length = 0
    }
  }

  if (queue.length > 0) {
    const res = await Promise.all(queue)
    for (const r of res) {
      if (r.error) cycleFailed += 1
      else cycleResolved += 1
    }
  }

  totalResolved += cycleResolved
  totalFailed += cycleFailed

  const { count } = await supabase
    .from('import_employee_mapping_issues')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open')

  console.log(`Cycle ${cycle}: resolved=${cycleResolved}, failed=${cycleFailed}, open_remaining=${count}`)

  if (cycleResolved === 0) {
    // nothing else can be matched
    break
  }
}

console.log(`DONE resolved=${totalResolved} failed=${totalFailed}`)
if (failedCodes.size > 0) {
  console.log('UNMATCHED CODES:')
  for (const c of Array.from(failedCodes).sort()) console.log(`- ${c}`)
}
