import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jmdndcphkmaljhwgzqxq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0'

const supabase = createClient(supabaseUrl, supabaseKey)

async function addFuelTypeColumn() {
  console.log('Adding fuel_type column to employee_master table...')

  try {
    // Try to insert a test record with fuel_type to verify column exists
    const { data, error } = await supabase
      .from('employee_master')
      .select('id')
      .limit(1)

    if (error) {
      console.error('Error accessing employee_master:', error)
      return
    }

    console.log('✓ employee_master table exists')

    // Try to update an existing record with fuel_type
    if (data && data.length > 0) {
      const { error: updateError } = await supabase
        .from('employee_master')
        .update({ fuel_type: null })
        .eq('id', data[0].id)
        .select()

      if (updateError && updateError.message.includes('fuel_type')) {
        console.error('❌ fuel_type column does not exist. You need to run the migration manually via Supabase UI.')
        console.log('\nSQL to execute in Supabase SQL Editor:')
        console.log(`
alter table if exists public.employee_master
  add column if not exists fuel_type text;

comment on column public.employee_master.fuel_type is 'Fuel type for the service advisor (e.g., PV, EV)';
        `)
      } else if (updateError) {
        console.error('Update error:', updateError)
      } else {
        console.log('✓ fuel_type column already exists or was successfully added')
      }
    }
  } catch (err) {
    console.error('Error:', err)
  }
}

addFuelTypeColumn()
