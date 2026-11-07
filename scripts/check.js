const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
let count = 0;
for (const directory of ['public', 'extension', 'tests', 'scripts']) {
  for (const file of fs.readdirSync(path.join(root, directory), { recursive: true })) {
    if (!file.endsWith('.js')) continue;
    execFileSync(process.execPath, ['--check', path.join(root, directory, file)], { stdio: 'inherit' });
    count++;
  }
}
execFileSync(process.execPath, ['--check', path.join(root, 'server.js')], { stdio: 'inherit' });
console.log(`Syntax OK: ${count + 1} JavaScript files`);
