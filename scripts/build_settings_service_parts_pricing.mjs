import fs from 'fs'
import path from 'path'

function normalizeLabel(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

const SERVICE_TYPE_RENAMES = {
  'first service': 'First Free Service',
  'second service': 'Second Free Service',
  'third service': 'Third Free Service',
  paidservice: 'Paid Service',
}

function canonicalizeServiceType(value) {
  const label = normalizeLabel(value)
  return SERVICE_TYPE_RENAMES[label.toLowerCase()] || label
}

function splitCombinedModelName(value) {
  let label = normalizeLabel(value)
  const compact = label.replace(/\s+/g, '')
  if (/cng$/i.test(compact) && !/\scng$/i.test(label)) {
    label = normalizeLabel(label.replace(/cng$/i, ' CNG'))
  } else if (/ev$/i.test(compact) && !/\sev$/i.test(label) && !/cng$/i.test(compact)) {
    label = normalizeLabel(label.replace(/ev$/i, ' EV'))
  }
  const lower = label.toLowerCase()
  if (lower.endsWith(' cng')) return { model: normalizeLabel(label.slice(0, -4)), fuel: 'CNG' }
  if (lower.endsWith(' ev')) return { model: normalizeLabel(label.slice(0, -3)), fuel: 'EV' }
  return { model: label, fuel: null }
}

function canonicalizeRow(row, id) {
  const split = splitCombinedModelName(row.model)
  return {
    id,
    service_type: canonicalizeServiceType(row.service_type),
    model: split.model || normalizeLabel(row.model),
    fuel: normalizeLabel(row.fuel) || split.fuel || '',
    service_name: normalizeLabel(row.service_name),
    price: Number(row.price) || 0,
    labour: Number(row.labour) || 0,
  }
}

const root = process.cwd()
const srcJson = path.join(root, 'src/data/parts_pricing.json')
const raw = JSON.parse(fs.readFileSync(srcJson, 'utf8'))
const canonical = raw.map((row) => canonicalizeRow(row, 0))
const seen = new Map()
const dropped = []
for (const row of canonical) {
  if (!row.service_name) {
    dropped.push({ key: 'blank-service-name', kept: null, dropped: row })
    continue
  }
  const key = [row.model, row.fuel, row.service_type, row.service_name]
    .map((value) => String(value).trim().toLowerCase())
    .join('|')
  const existing = seen.get(key)
  if (existing) {
    dropped.push({ key, kept: existing, dropped: row })
    continue
  }
  seen.set(key, row)
}
const rows = Array.from(seen.values()).map((row, index) => ({ ...row, id: index + 1 }))
const ids = new Set(rows.map((r) => r.id))
if (ids.size !== rows.length) {
  throw new Error(`Duplicate ids after remumber: ${ids.size} unique / ${rows.length} rows`)
}

const jsonOut = `${JSON.stringify(rows, null, 2)}\n`
fs.writeFileSync(srcJson, jsonOut)
fs.writeFileSync(path.join(root, 'bodyshop/src/data/parts_pricing.json'), jsonOut)

const sqlValues = rows
  .map((r) => {
    const esc = (v) => String(v).replace(/'/g, "''")
    return `(${r.id}, 'GLOBAL', '${esc(r.service_type)}', '${esc(r.model)}', '${esc(r.fuel)}', '${esc(r.service_name)}', ${r.price}, ${r.labour}, true)`
  })
  .join(',\n')

fs.writeFileSync(
  path.join(root, 'scripts/_seed_settings_service_parts_pricing.sql'),
  `-- Generated seed fragment. Do not apply alone.\n${sqlValues}\n`,
)

const typeCounts = {}
for (const r of rows) typeCounts[r.service_type] = (typeCounts[r.service_type] || 0) + 1
console.log(JSON.stringify({
  total: rows.length,
  uniqueIds: ids.size,
  droppedDuplicates: dropped.length,
  dropped,
  typeCounts,
}, null, 2))
