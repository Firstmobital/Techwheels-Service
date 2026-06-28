/**
 * crm-scraper.js
 *
 * Automates login to the Tata Motors CRM DMS system, searches each chassis number
 * from a list, scrapes:
 *   - Full Service Information
 *   - Contact details where Contact Status = "Customer" (First Name + Cell Phone No.)
 *
 * Usage:
 *   node scripts/crm-scraper.js
 *
 * Prerequisites:
 *   npm install playwright dotenv @supabase/supabase-js
 *   npx playwright install chromium
 *
 * Environment variables (create a .env file in project root):
 *   CRM_USERNAME=your_crm_user_id
 *   CRM_PASSWORD=your_crm_password
 *   SUPABASE_URL=https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_KEY=your_service_role_key
 *
 * Chassis numbers are read from a table in Supabase called `crm_chassis_queue`
 * with columns: id, chassis_no, status ('pending'|'done'|'error')
 * Results are upserted into `crm_vehicle_data`.
 */

import { chromium } from 'playwright'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

// ─── Config ───────────────────────────────────────────────────────────────────

const CRM_URL     = 'https://carsdms.inservices.tatamotors.com/siebel/app/workshop/enu'
const CRM_USER    = process.env.CRM_USERNAME
const CRM_PASS    = process.env.CRM_PASSWORD
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!CRM_USER || !CRM_PASS) {
  console.error('❌  Set CRM_USERNAME and CRM_PASSWORD in .env')
  process.exit(1)
}

const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * Wait for a Siebel applet to finish loading (spinner gone).
 */
async function waitForSiebel(page, timeout = 20000) {
  await page.waitForFunction(
    () => !document.querySelector('[id*="SiebelAjaxWaiting"]')
      || document.querySelector('[id*="SiebelAjaxWaiting"]').style.display === 'none',
    { timeout }
  )
}

// ─── Step 1: Login ────────────────────────────────────────────────────────────

async function login(page) {
  console.log('🔐  Navigating to CRM login page…')
  await page.goto(CRM_URL + '?SWECmd=Login&SWECM=S', { waitUntil: 'networkidle' })

  await page.fill('input[name="SWEUserName"], #SWEUserName', CRM_USER)
  await page.fill('input[name="SWEPassword"], #SWEPassword', CRM_PASS)
  await page.click('input[value="Login"], button:has-text("Login")')

  await page.waitForURL(/GotoView.*Home/, { timeout: 30000 })
  console.log('✅  Logged in successfully')
}

// ─── Step 2: Navigate to Vehicles > All Visible Vehicles ─────────────────────

async function navigateToVehicles(page) {
  console.log('🚗  Navigating to Vehicles tab…')

  // Click "Vehicles" in the top nav
  await page.click('a:has-text("Vehicles"), td:has-text("Vehicles")')
  await waitForSiebel(page)

  // Open the view dropdown and select "All Visible Vehicles"
  const dropdown = page.locator('select, [class*="DropDown"]').first()
  if (await dropdown.isVisible()) {
    await dropdown.selectOption({ label: 'All Visible Vehicles' })
  } else {
    // Fallback: click the text link
    const visibleLink = page.locator('text=All Visible Vehicles')
    if (await visibleLink.isVisible()) await visibleLink.click()
  }

  await waitForSiebel(page)
  console.log('✅  On All Visible Vehicles view')
}

// ─── Step 3: Search by Chassis Number ────────────────────────────────────────

async function searchByChassis(page, chassisNo) {
  console.log(`🔍  Searching chassis: ${chassisNo}`)

  // Click the search/query button (magnifying glass icon)
  await page.click('[title*="Search"], [class*="applet-new-query-button"], button[class*="search"]')
  await waitForSiebel(page)

  // Fill chassis number in the search field
  const chassisInput = page.locator('input[aria-label*="Chassis"], td:has-text("Chassis No") + td input').first()
  await chassisInput.fill(chassisNo)

  // Press Go / Execute query
  await page.keyboard.press('Enter')
  await waitForSiebel(page, 25000)

  // Check if record found
  const noRecords = await page.locator('text=No Records').count()
  if (noRecords > 0) {
    console.warn(`⚠️   No record found for chassis: ${chassisNo}`)
    return false
  }

  console.log(`✅  Record found for ${chassisNo}`)
  return true
}

// ─── Step 4: Scrape Service Information ──────────────────────────────────────

async function scrapeServiceInfo(page) {
  const info = {}

  const fieldMap = {
    last_service_km:       'Last Service Km',
    last_service_dealer:   'Last Service Dealer',
    last_service_division: 'Last Service Division',
    last_service_date:     'Last Service Date',
    next_service_date:     'Next Service Date',
    next_service_type:     'Next Service Type',
  }

  for (const [key, label] of Object.entries(fieldMap)) {
    try {
      // Siebel renders field labels in <td> and values in adjacent <td> or <input>
      const labelCell = page.locator(`td:has-text("${label}:")`).first()
      const valueCell = labelCell.locator('xpath=following-sibling::td[1]')
      const input     = valueCell.locator('input, span').first()

      const text = await input.inputValue().catch(() => null)
        ?? await input.innerText().catch(() => null)
        ?? await valueCell.innerText().catch(() => null)
        ?? ''

      info[key] = text.trim() || null
    } catch {
      info[key] = null
    }
  }

  // Also grab basic vehicle info
  const vehicleFieldMap = {
    chassis_no:                'Chassis No',
    vehicle_registration_number: 'Vehicle Registration Number',
    product_name:              'Product Name',
    model:                     'Model',
    engine_no:                 'Engine No',
    dealer_invoice_number:     'Dealer Invoice Number',
    tm_invoice_date:           'TM Invoice Date',
    resale_date:               'Resale Date',
    resale_odometer_reading:   'Resale Odometer Reading',
    vehicle_type:              'Vehicle Type',
    vehicle_category:          'Vehicle Category',
    status:                    'Status',
  }

  for (const [key, label] of Object.entries(vehicleFieldMap)) {
    try {
      const labelCell = page.locator(`td:has-text("${label}:")`).first()
      const valueCell = labelCell.locator('xpath=following-sibling::td[1]')
      const input     = valueCell.locator('input, span, select').first()

      const text = await input.inputValue().catch(() => null)
        ?? await input.innerText().catch(() => null)
        ?? await valueCell.innerText().catch(() => null)
        ?? ''

      info[key] = text.trim() || null
    } catch {
      info[key] = null
    }
  }

  return info
}

// ─── Step 5: Scrape Contacts (Customer status only) ──────────────────────────

async function scrapeCustomerContacts(page) {
  const contacts = []

  try {
    // Click the "Contacts" sub-tab
    await page.click('a:has-text("Contacts"), [class*="tab"]:has-text("Contacts")')
    await waitForSiebel(page)

    // Wait for the contacts list to appear
    await page.waitForSelector('table[summary*="Contacts"], [class*="applet"] table', { timeout: 10000 })

    // Find all rows in the contacts list applet
    const rows = await page.locator(
      '[class*="applet"] table tr, table[summary*="Contacts"] tr'
    ).all()

    for (const row of rows) {
      const cells = await row.locator('td').all()
      if (cells.length < 4) continue

      // Column order from screenshot: First Name | Cell Phone No. | Created Date | Contact Status
      const firstName    = (await cells[0]?.innerText().catch(() => '')).trim()
      const cellPhone    = (await cells[1]?.innerText().catch(() => '')).trim()
      const contactStatus = (await cells[3]?.innerText().catch(() => '')).trim()

      if (!firstName || firstName === 'First Name') continue  // skip header row
      if (contactStatus.toLowerCase() !== 'customer') continue

      contacts.push({ first_name: firstName, cell_phone: cellPhone })
    }
  } catch (err) {
    console.warn('⚠️   Could not scrape contacts:', err.message)
  }

  return contacts
}

// ─── Step 6: Persist results to Supabase ─────────────────────────────────────

async function saveToSupabase(chassisNo, vehicleData, contacts) {
  if (!supabase) {
    console.log('ℹ️   No Supabase config — printing result to console:')
    console.log(JSON.stringify({ chassisNo, vehicleData, contacts }, null, 2))
    return
  }

  // Upsert vehicle/service data
  const { error: vErr } = await supabase
    .from('crm_vehicle_data')
    .upsert(
      { chassis_no: chassisNo, ...vehicleData, customer_contacts: contacts, fetched_at: new Date().toISOString() },
      { onConflict: 'chassis_no' }
    )

  if (vErr) console.error('❌  Supabase upsert error:', vErr.message)
  else console.log(`✅  Saved data for ${chassisNo}`)

  // Mark chassis as done in queue
  await supabase
    .from('crm_chassis_queue')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('chassis_no', chassisNo)
}

// ─── Step 7: Load chassis numbers from Supabase (or fallback to env) ─────────

async function loadChassisQueue() {
  if (supabase) {
    const { data, error } = await supabase
      .from('crm_chassis_queue')
      .select('chassis_no')
      .eq('status', 'pending')
      .order('created_at')

    if (!error && data?.length) {
      console.log(`📋  Loaded ${data.length} chassis numbers from Supabase queue`)
      return data.map(r => r.chassis_no)
    }
  }

  // Fallback: read from CHASSIS_LIST env var (comma-separated)
  const fromEnv = process.env.CHASSIS_LIST
  if (fromEnv) {
    const list = fromEnv.split(',').map(s => s.trim()).filter(Boolean)
    console.log(`📋  Loaded ${list.length} chassis numbers from CHASSIS_LIST env var`)
    return list
  }

  console.warn('⚠️   No chassis numbers found. Add rows to crm_chassis_queue or set CHASSIS_LIST env var.')
  return []
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const chassisList = await loadChassisQueue()
  if (chassisList.length === 0) process.exit(0)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page    = await context.newPage()

  try {
    // Login once
    await login(page)

    // Navigate to All Visible Vehicles once
    await navigateToVehicles(page)

    for (const chassisNo of chassisList) {
      console.log(`\n──────────────────────────────────`)
      console.log(`Processing: ${chassisNo}`)
      console.log(`──────────────────────────────────`)

      try {
        const found = await searchByChassis(page, chassisNo)
        if (!found) {
          if (supabase) {
            await supabase
              .from('crm_chassis_queue')
              .update({ status: 'not_found', updated_at: new Date().toISOString() })
              .eq('chassis_no', chassisNo)
          }
          continue
        }

        const vehicleData = await scrapeServiceInfo(page)
        const contacts    = await scrapeCustomerContacts(page)

        console.log(`📊  Service Info:`, vehicleData)
        console.log(`👤  Customer Contacts:`, contacts)

        await saveToSupabase(chassisNo, vehicleData, contacts)

        // Go back to search for next chassis
        await navigateToVehicles(page)
        await sleep(1500)

      } catch (err) {
        console.error(`❌  Error processing ${chassisNo}:`, err.message)
        if (supabase) {
          await supabase
            .from('crm_chassis_queue')
            .update({ status: 'error', error_msg: err.message, updated_at: new Date().toISOString() })
            .eq('chassis_no', chassisNo)
        }
      }
    }

  } finally {
    await browser.close()
    console.log('\n🏁  Scraper finished')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
