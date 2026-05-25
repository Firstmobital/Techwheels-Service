import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jmdndcphkmaljhwgzqxq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0'

// Use service role key for DDL operations (if available)
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false
  }
})

async function applyMigration() {
  console.log('Applying fuel_type column migration...\n')

  try {
    // Execute the SQL migration
    const { data, error } = await supabase.rpc('execute_sql', {
      sql: `
alter table if exists public.employee_master
  add column if not exists fuel_type text;

comment on column public.employee_master.fuel_type is 'Fuel type for the service advisor (e.g., PV, EV)';
      `
    })

    if (error) {
      console.error('RPC approach failed, trying direct approach...')
      console.log('Note: Direct DDL execution via RPC may not be available.')
      console.log('\nPlease execute this SQL in Supabase Dashboard > SQL Editor:')
      console.log(`
-- Add fuel_type column to employee_master table
alter table if exists public.employee_master
  add column if not exists fuel_type text;

comment on column public.employee_master.fuel_type is 'Fuel type for the service advisor (e.g., PV, EV)';
      `)
      return
    }

    console.log('✓ Migration applied successfully!')
    console.log('fuel_type column has been added to employee_master table.')
  } catch (err) {
    console.error('Error:', err)
    console.log('\nManual Steps:')
    console.log('1. Go to https://app.supabase.com/project/jmdndcphkmaljhwgzqxq/sql')
    console.log('2. Click "New Query"')
    console.log('3. Paste this SQL:')
    console.log(`
alter table if exists public.employee_master
  add column if not exists fuel_type text;

comment on column public.employee_master.fuel_type is 'Fuel type for the service advisor (e.g., PV, EV)';
    `)
    console.log('4. Click "Run"')
  }
}

applyMigration()
