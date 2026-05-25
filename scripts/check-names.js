#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jmdndcphkmaljhwgzqxq.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const searchNames = ['SHARMA, KEDAR', 'SINGH, BHANWAR', 'SEN, YUGANTER', 'SINGH, PANKAJ', 'SHASHANK, SHASHANK', 'SHAMA, SUNIL']

async function checkNames() {
  const { data: employees } = await supabase.from('employee_master').select('*')
  
  console.log('Checking for missing names in employee master:\n')
  searchNames.forEach(name => {
    const found = employees?.find(e => e.employee_name.toLowerCase().trim() === name.toLowerCase().trim())
    console.log(`"${name}" -> ${found ? `${found.employee_code}: ${found.employee_name}` : 'NOT FOUND'}`)
  })
}

checkNames()
