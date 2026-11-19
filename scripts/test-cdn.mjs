import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readJSON} from './common.mjs';

const checksums = readJSON('content/cdn.json');
const cdn = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/';
const files = ['css/bootstrap.min.css','css/bootstrap.rtl.min.css','js/bootstrap.bundle.min.js'];

export async function installFixtures(context) {
  for (const file of files) {
    const url = cdn + file;
    const body = fs.readFileSync('node_modules/bootstrap/dist/' + file);
    const sri = 'sha384-' + createHash('sha384').update(body).digest('base64');
    assert.equal(sri,checksums[url],file);
    const contentType = url.endsWith('.css') ? 'text/css' : 'text/javascript';
    await context.route(url,route=>route.fulfill({body,contentType,headers:{'Access-Control-Allow-Origin':'*'}}));
  }
  await context.route('https://fonts.googleapis.com/**',route=>route.abort());
}
