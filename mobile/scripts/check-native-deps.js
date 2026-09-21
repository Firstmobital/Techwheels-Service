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
const deps = {
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {}),
}

function majorFromSpec(spec) {
  const match = String(spec || '').match(/(\d+)/)
  return match ? Number(match[1]) : null
}

function installedVersion(pkgName) {
  const pkgPath = path.join(projectRoot, 'node_modules', pkgName, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || null
}

const sdkErrors = []
if (majorFromSpec(deps.expo) !== 54) {
  sdkErrors.push(`package.json expo must stay on SDK 54 (found ${deps.expo || 'missing'})`)
}
if (!String(deps['react-native'] || '').startsWith('0.81.')) {
  sdkErrors.push(`package.json react-native must stay on 0.81.x (found ${deps['react-native'] || 'missing'})`)
}
if (majorFromSpec(deps['expo-updates']) !== 29) {
  sdkErrors.push(`package.json expo-updates must stay on 29.x for SDK 54 (found ${deps['expo-updates'] || 'missing'})`)
}
if (declared.has('@expo/ui')) {
  sdkErrors.push('@expo/ui cannot be added; it breaks eas update (jetpack-compose / swift-ui)')
}

const installedExpo = installedVersion('expo')
if (installedExpo && !installedExpo.startsWith('54.')) {
  sdkErrors.push(`installed expo must be 54.x (found ${installedExpo}); run rm -rf node_modules && npm ci`)
}
if (fs.existsSync(path.join(projectRoot, 'node_modules', '@expo', 'ui'))) {
  sdkErrors.push('node_modules/@expo/ui is present; clean-install before OTA')
}

if (sdkErrors.length > 0) {
  console.error('OTA-incompatible native/SDK state:')
  for (const error of sdkErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

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
