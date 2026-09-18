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

function scanDir(dir) {
  let files = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) {
      files = files.concat(scanDir(full))
    } else if (/\.(ts|tsx|js|jsx)$/.test(item.name)) {
      files.push(full)
    }
  }
  return files
}

const externals = new Set()
const allFiles = scanDir(path.join(projectRoot, 'src'))
for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8')
  const matches = content.matchAll(/from\s+['"]([^'"]+)['"]/g)
  for (const match of matches) {
    const spec = match[1]
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/')) {
      continue
    }
    const root = spec.startsWith('@')
      ? spec.split('/').slice(0, 2).join('/')
      : spec.split('/')[0]
    externals.add(root)
  }
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
