import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { readJSON, writeJSON } from './common.mjs';
import { requests, segments, validTranslation } from './language.mjs';

const exec = promisify(execFile);
const prefixes = process.argv.slice(2);
const file = 'content/machine-translations.json';
const values = Object.assign(Object.create(null),readJSON(file,{}));
const pages = fs.readdirSync('content/pages').map(name=>readJSON('content/pages/'+name));
const selected = pages.filter(page=>!prefixes.length || prefixes.some(prefix=>page.route.startsWith(prefix)));
const ranks = ['5.3','عام','5.2','5.1','5.0','6.0','4.6','4.5','4.4','4.3','4.2','4.1','4.0','3.4','3.3'];
selected.sort((a,b)=>(ranks.indexOf(a.version)+1 || 99)-(ranks.indexOf(b.version)+1 || 99) ||
  Number(b.route.includes('/getting-started/'))-Number(a.route.includes('/getting-started/')));
const hosts = ['translate.googleapis.com','translate.google.com.sa','clients5.google.com','translate.google.co.uk'];
const limit = Number(process.env.BOOTSTRAP_TRANSLATION_WORKERS ?? 12);

function save() {
  writeJSON(file+'.next',values);
  fs.renameSync(file+'.next',file);
}

async function batchTranslate(batch,id) {
  for (let attempt=0; attempt<hosts.length; attempt++) {
    const host = hosts[(id+attempt)%hosts.length];
    const args = ['-fLsS','--connect-timeout','5','--max-time','10','--get',
      `https://${host}/translate_a/t`,'--data','client=gtx&sl=en&tl=ar',
      ...batch.flatMap(text=>['--data-urlencode','q='+text])];
    try {
      const {stdout}=await exec('curl',args,{maxBuffer:1_048_576});
      const result=JSON.parse(stdout);
      if (!Array.isArray(result) || result.length !== batch.length || !result.every(v=>typeof v==='string')) continue;
      return result;
    } catch {}
  }
}

for (let pass=0;pass<2;pass++) {
  const requested = new Set();
  for (const page of selected) {
    for (const b of segments(page)) requests(b.en,requested,values);
    for (const link of page.nav) requests(link.en,requested,values);
  }
  let batch=[], size=0;
  const queue=[];
  for (const key of requested) {
    const cost=encodeURIComponent(key).length+3;
    if (batch.length && (size+cost>4600 || batch.length>=30)) {
      queue.push(batch);
      batch=[];size=0;
    }
    batch.push(key);size+=cost;
  }
  if (batch.length) queue.push(batch);
  if (!queue.length) break;
  const total = queue.length;
  let done=0, successes=0, failed=0;
  console.log(`Pass ${pass+1}: ${requested.size} strings in ${total} batches from ${selected.length} pages.`);
  await Promise.all(Array.from({length:Math.min(limit,total)},async (_,worker) => {
    while(queue.length) {
      const b = queue.shift();
      const result=await batchTranslate(b,worker);
      if (result) {
        b.forEach((text,index)=>{values[text]=result[index] || text; if (validTranslation(text,result[index])) successes++;});
      } else failed++;
      done++;
      if (done % 25 === 0) {
        save();
        console.log(`  ${done}/${total}, ${successes} valid, ${failed} failed requests`);
      }
    }
  }));
  save();
  console.log(`  ${done}/${total}, ${successes} valid, ${failed} failed requests`);
}
