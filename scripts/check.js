const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const directories = ['config', 'controllers', 'lib', 'middleware', 'migrations', 'models', 'multer', 'routes', 'scripts', 'services', 'tests'];
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(name);
    else if (name.endsWith('.js')) execFileSync(process.execPath, ['--check', name], { stdio: 'inherit' });
  }
}
for (const directory of directories) inspect(directory);
for (const file of ['app.js', 'index.js', 'swaggerConfig.js']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log('Sintaxis verificada.');
