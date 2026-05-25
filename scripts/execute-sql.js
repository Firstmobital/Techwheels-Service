import https from 'https'

const supabaseUrl = 'https://jmdndcphkmaljhwgzqxq.supabase.co'
const projectId = 'jmdndcphkmaljhwgzqxq'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0'

// Note: This requires a management token or service role key to work
const managementToken = process.env.SUPABASE_MANAGEMENT_TOKEN

async function executeSql() {
  console.log('Attempting to execute SQL to add fuel_type column...\n')

  if (!managementToken) {
    console.log('⚠️  SUPABASE_MANAGEMENT_TOKEN not found as environment variable.')
    console.log('\nTo fix this issue, please go to: https://app.supabase.com/project/jmdndcphkmaljhwgzqxq/sql')
    console.log('\nExecute this SQL in the SQL Editor:')
    console.log(`
-- Add fuel_type column to employee_master table
ALTER TABLE public.employee_master 
  ADD COLUMN IF NOT EXISTS fuel_type text;

COMMENT ON COLUMN public.employee_master.fuel_type IS 'Fuel type for the service advisor (e.g., PV, EV)';
    `)
    console.log('\nAfter executing the SQL, reload the app at http://localhost:5173')
    return
  }

  const sql = `
ALTER TABLE public.employee_master 
  ADD COLUMN IF NOT EXISTS fuel_type text;

COMMENT ON COLUMN public.employee_master.fuel_type IS 'Fuel type for the service advisor (e.g., PV, EV)';
  `.trim()

  const postData = JSON.stringify({ query: sql })

  const options = {
    hostname: 'api.supabase.com',
    port: 443,
    path: `/v1/projects/${projectId}/query`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${managementToken}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ SQL executed successfully!')
          console.log('fuel_type column has been added to employee_master table.')
        } else {
          console.log('Response status:', res.statusCode)
          console.log('Response:', data)
        }
        resolve()
      })
    })

    req.on('error', (error) => {
      console.error('Error:', error)
      resolve()
    })

    req.write(postData)
    req.end()
  })
}

executeSql()
