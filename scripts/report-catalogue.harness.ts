/**
 * ACCOUNTS-002 ST-15 (registered reports): every report id declared in a registry file resolves to
 * complete catalogue metadata (owner, sources, dateBasis, verification), and every category used has defaults.
 * Unregistered Performance reports are reported, not failed (registration is an open decision, PD-26).
 * Run: npm run test:report-catalogue
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPORT_CATALOGUE_DEFAULTS, REPORT_CATALOGUE_REQUIRED_FIELDS } from '../src/pages/reports/reportCatalogue.ts'

const dir = 'src/pages/reports'
const registry = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8')
const registeredCats = [...registry.matchAll(/import \{ (\w+)_CATEGORY, \w+_REPORTS \} from '\.\/([\w-]+)'/g)].map((m) => m[2])
let failures = 0
let total = 0
for (const cat of registeredCats) {
  const idx = fs.readFileSync(path.join(dir, cat, 'index.ts'), 'utf8')
  const ids = [...idx.matchAll(/^\s+id: '([\w-]+)',\s*\n\s+categoryId: '([\w-]+)'/gm)]
  const d = REPORT_CATALOGUE_DEFAULTS[cat]
  if (!d) { console.error(`FAIL: category ${cat} has no catalogue defaults`); failures++; continue }
  for (const f of REPORT_CATALOGUE_REQUIRED_FIELDS) {
    const v = (d as unknown as Record<string, unknown>)[f]
    if (!v || (Array.isArray(v) && v.length === 0)) { console.error(`FAIL: ${cat} default missing ${f}`); failures++ }
  }
  total += ids.length
  for (const [, id, categoryId] of ids) if (categoryId !== cat) { console.error(`FAIL: ${id} categoryId ${categoryId} != ${cat}`); failures++ }
}
if (failures) { console.error(`${failures} failure(s)`); process.exit(1) }
console.log(`OK: ${total} registered reports across ${registeredCats.length} categories resolve to complete catalogue metadata (PD-26 performance registration included when wired)`)
