const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'supabase', 'functions')
const index = fs.readFileSync(path.join(root, 'booking-source-sync', 'index.ts'), 'utf8')

const args = {
  project_id: 'jmdndcphkmaljhwgzqxq',
  name: 'booking-source-sync',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
  files: [{ name: 'index.ts', content: index }],
}

const out = path.join(__dirname, '..', 'deploy-only-args.json')
fs.writeFileSync(out, JSON.stringify(args))
console.log('wrote', out, 'bytes', fs.statSync(out).size)
