const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'functions')

function deployPayload(fn) {
  return {
    project_id: 'jmdndcphkmaljhwgzqxq',
    name: fn,
    entrypoint_path: `functions/${fn}/index.ts`,
    verify_jwt: false,
    files: [
      {
        name: `functions/${fn}/index.ts`,
        content: fs.readFileSync(path.join(root, fn, 'index.ts'), 'utf8'),
      },
      {
        name: 'functions/_shared/authEmailDelivery.ts',
        content: fs.readFileSync(path.join(root, '_shared', 'authEmailDelivery.ts'), 'utf8'),
      },
    ],
  }
}

fs.writeFileSync(
  path.join(__dirname, '..', '.deploy-deliver.json'),
  JSON.stringify(deployPayload('deliver-password-reset-email')),
)
fs.writeFileSync(
  path.join(__dirname, '..', '.deploy-send-auth.json'),
  JSON.stringify(deployPayload('send-auth-access-email')),
)
