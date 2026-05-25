#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jmdndcphkmaljhwgzqxq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0',
)

const { count, error } = await supabase
  .from('import_employee_mapping_issues')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'open')

if (error) {
  console.error(error.message)
  process.exit(1)
}

console.log(count)
