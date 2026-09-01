import fs from 'fs';
import path from 'path';

const GINKO = '/home/user/ginko-md-audit/cmds';
const SHIN = '/home/user/shin-md/cmds';

function processFile(srcPath, relPath) {
  const depth = relPath.split('/').length;
  const prefix = depth <= 1 ? '..' : '../..';
  const dbImport = prefix + '/src/services/ginko-db.js';

  let content = fs.readFileSync(srcPath, 'utf8');

  // Replace import db from '#db'
  content = content.replace(
    /import\s+db\s+from\s+['"]#db['"]/g,
    "import db from '" + dbImport + "'"
  );

  const target = path.join(SHIN, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  console.log('  -> ' + relPath);
}

function scan(dir, baseRel) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      scan(dir + '/' + e.name, baseRel + e.name + '/');
    } else if (e.isFile() && e.name.endsWith('.js')) {
      const rel = baseRel + e.name;
      const src = dir + '/' + e.name;
      processFile(src, rel);
    }
  }
}

console.log('Copying & converting Ginko commands to Shin...');
scan(GINKO, '');
console.log('All commands copied!');
process.exit(0);