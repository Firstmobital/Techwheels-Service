const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
)

const declared = new Set([
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
])

const importScan = execSync(
  "rg -n \"from ['\\\"][^'\\\"]+['\\\"]\" src --glob '*.{ts,tsx,js,jsx}'",
  { cwd: projectRoot, encoding: 'utf8' },
)

const externals = new Set()
for (const line of importScan.split('\n')) {
  const match = line.match(/from ['\"]([^'\"]+)['\"]/)
  if (!match) continue

  const spec = match[1]
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/')) {
    continue
  }

  const root = spec.startsWith('@')
    ? spec.split('/').slice(0, 2).join('/')
    : spec.split('/')[0]

  externals.add(root)
}

const allowlist = new Set(['react', 'react-native'])
const missing = [...externals]
  .filter((name) => !declared.has(name) && !allowlist.has(name))
  .sort()

if (missing.length > 0) {
  console.error('Missing declared dependencies for imported modules:')
  for (const dep of missing) {
    console.error(`- ${dep}`)
  }
  process.exit(1)
}

console.log('Native dependency import check passed: no undeclared external imports found.')
