#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jmdndcphkmaljhwgzqxq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0',
)

const names = [
  'CHAUDHARY, RAHENDRA',
  'CHAUDHARY, RAJENDRA',
  'JAREDA, VISHAL KUMAR',
  'KANWAR, BARKHA',
  'MAMODIA, PRATEEK',
  'PANDEY, SHASHANK',
  'PRAKASH, BUDDI',
  'SAIN, HEMANTKUMAR',
  'SHARMA, NALINI',
  'SHARMA, SUNIL',
  'SHEWANI, DINESH',
  'SINGH, NARENDRA',
  'VAISHNAV, BHUWANESH KUMAR',
]

const rows = names.map((name, i) => ({
  employee_code: `AUTO_${String(i + 1).padStart(3, '0')}_500A840`,
  employee_name: name,
  location: 'Sitapura EV',
  department: null,
}))

const { error } = await supabase.from('employee_master').insert(rows)

if (error) {
  console.error(error.message)
  process.exit(1)
}

console.log(`Inserted ${rows.length} employees`)
