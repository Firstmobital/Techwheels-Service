#!/usr/bin/env node
/**
 * Add missing employees to the master
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jmdndcphkmaljhwgzqxq.supabase.co'
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Missing employees to add
const missingEmployees = [
  {
    employee_code: 'MCM_3000840',
    employee_name: 'MEENA, CHHITAR MAL',
    location: 'Sitapura EV',
    department: null,
  },
]

async function addMissingEmployees() {
  try {
    console.log('📝 Adding missing employees...\n')

    const { data, error } = await supabase.from('employee_master').insert(missingEmployees).select()

    if (error) {
      console.error('❌ Error adding employees:', error.message)
      return
    }

    console.log(`✅ Successfully added ${data?.length || 0} employees:`)
    data?.forEach((emp) => {
      console.log(`   - ${emp.employee_code}: ${emp.employee_name}`)
    })
  } catch (err) {
    console.error('Error:', err.message)
  }
}

addMissingEmployees()
