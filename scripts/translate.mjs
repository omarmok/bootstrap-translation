import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readJSON, writeJSON } from './common.mjs';
import { requests, segments } from './language.mjs';

const target = process.argv.slice(2);
const files = fs.readdirSync('content/pages').filter(name=>name.endsWith('.json'));
const pages = files.map(name=>readJSON('content/pages/'+name)).filter(page=>!target.length || target.some(prefix=>page.route.startsWith(prefix)));
pages.sort((a,b)=>priority(a)-priority(b));
function priority(page) {
  if (page.version === '5.3') return page.route.includes('/getting-started/') ? 0 : 1;
  if (page.version === 'عام') return 2;
  if (page.version.startsWith('5.')) return 3;
  if (page.version.startsWith('6.')) return 4;
  return 5;
}

const file = 'content/translations.json';
const values = Object.assign(Object.create(null),readJSON(file,{}));
const python = process.env.BOOTSTRAP_TRANSLATION_PYTHON ?? '.venv/bin/python';
const child = spawn(python,['scripts/local-translate.py'],{stdio:['pipe','pipe','inherit']});
const lines = createInterface({input:child.stdout})[Symbol.asyncIterator]();
const save = () => {
  writeJSON(file+'.next',values);
  fs.renameSync(file+'.next',file);
};

for (let pass=0; pass < 3; pass++) {
  const pending = new Set();
  for (const page of pages) {
    for (const b of segments(page)) requests(b.en,pending,values);
    for (const link of page.nav) requests(link.en,pending,values);
  }
  const queue = [...pending];
  if (!queue.length) break;
  console.log(`Pass ${pass+1}: ${queue.length} unique strings across ${pages.length} pages.`);
  for (let i=0;i<queue.length;i+=96) {
    const batch = queue.slice(i,i+96);
    child.stdin.write(JSON.stringify(batch)+'\n');
    const next = await lines.next();
    if (next.done) throw new Error('Translation model stopped');
    const result = JSON.parse(next.value);
    batch.forEach((key,j)=>{values[key] = result[j] || key;});
    if (i % 960 === 0) {
      save();
      console.log(`  ${i+batch.length}/${queue.length}`);
    }
  }
  save();
}
child.stdin.end();
console.log(`${Object.keys(values).length} cached translations.`);
