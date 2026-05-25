#!/usr/bin/env node
/**
 * Check current state of employees and unmapped issues
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jmdndcphkmaljhwgzqxq.supabase.co'
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkStatus() {
  try {
    // Fetch all employees
    const { data: employees } = await supabase.from('employee_master').select('*')

    // Fetch all open issues
    const { data: issues } = await supabase
      .from('import_employee_mapping_issues')
      .select('*')
      .eq('status', 'open')

    // Fetch all issues regardless of status
    const { data: allIssues } = await supabase.from('import_employee_mapping_issues').select('*')

    const employeeCodeSet = new Set(employees?.map((e) => e.employee_code.toLowerCase().trim()) || [])

    // Find missing SR codes
    const missingSrCodes = new Set()
    issues?.forEach((issue) => {
      if (issue.sr_assigned_to && !employeeCodeSet.has(issue.sr_assigned_to.toLowerCase().trim())) {
        missingSrCodes.add(issue.sr_assigned_to)
      }
    })

    console.log('\n📊 Current Status:\n')
    console.log(`Total Employees in Master: ${employees?.length || 0}`)
    console.log(`Open Unmapped Issues: ${issues?.length || 0}`)
    console.log(`Total Issues (all statuses): ${allIssues?.length || 0}`)
    console.log(`Missing SR Codes: ${missingSrCodes.size}`)

    console.log('\n👥 Employees in Master:')
    employees?.forEach((emp) => {
      console.log(`   - ${emp.employee_code}: ${emp.employee_name}`)
    })

    console.log('\n❌ Missing SR Codes (top 50):')
    Array.from(missingSrCodes)
      .slice(0, 50)
      .forEach((code) => {
        console.log(`   - ${code}`)
      })

    if (missingSrCodes.size > 50) {
      console.log(`   ... and ${missingSrCodes.size - 50} more`)
    }

    // Show branches involved
    const branchSet = new Set(issues?.map((i) => i.branch) || [])
    console.log('\n🏢 Branches with Unmapped Issues:')
    branchSet.forEach((branch) => {
      const count = issues?.filter((i) => i.branch === branch).length || 0
      console.log(`   - ${branch}: ${count} issues`)
    })
  } catch (err) {
    console.error('Error:', err.message)
  }
}

checkStatus()
