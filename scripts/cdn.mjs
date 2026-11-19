import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {releases,readJSON,writeJSON} from './common.mjs';

const exec = promisify(execFile);
const file = 'content/cdn.json';
const assets = readJSON(file,{});
const urls = [];
for (const version of Object.values(releases).filter(v=>Number(v.split('.')[0]) >= 3)) {
  const major = Number(version.split('.')[0]);
  const base = `https://cdn.jsdelivr.net/npm/bootstrap@${version}/dist/`;
  urls.push(base+'css/bootstrap.min.css',base+(major < 4 ? 'js/bootstrap.min.js' : 'js/bootstrap.bundle.min.js'));
  if (major >= 5) urls.push(base+'css/bootstrap.rtl.min.css');
}
urls.push('https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js');
const queue = urls.filter(url=>!assets[url]);
await Promise.all(Array.from({length:12},async()=>{
  while(queue.length) {
    const url = queue.shift();
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const {stdout}=await exec('curl',['-fLsS','--connect-timeout','6','--max-time','25',url],{encoding:'buffer',maxBuffer:1_000_000});
        if (stdout.length < 1000) continue;
        assets[url] = 'sha384-' + createHash('sha384').update(stdout).digest('base64');
        break;
      } catch {}
    }
  }
}));
writeJSON(file,assets,true);
console.log(Object.keys(assets).length+' pinned CDN checksums');
