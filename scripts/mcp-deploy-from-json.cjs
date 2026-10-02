const fs = require('fs');
const path = require('path');
const argsPath = path.join(__dirname, '..', 'deploy-only-args.json');
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
process.stdout.write(JSON.stringify({
  namespace: 'plugin-supabase-supabase',
  toolName: 'deploy_edge_function',
  arguments: args,
}));
