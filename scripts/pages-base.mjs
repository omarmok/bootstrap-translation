// Prefix root-absolute links in a built copy of dist/ so the site can be served from a sub-path
// (e.g. GitHub Pages project sites at /bootstrap-translation/).
// Usage: node scripts/pages-base.mjs <dir> </base/>
import {readdirSync, readFileSync, writeFileSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const [dir, rawBase] = process.argv.slice(2);
if (!dir || !rawBase) throw new Error('usage: node scripts/pages-base.mjs <dir> </base/>');
const base = '/' + rawBase.replace(/^\/+|\/+$/g, '') + '/';
const prefix = base.slice(0, -1);

const html = text => text.replace(/\b(href|src|value|action|poster|data-src)=(["'])\/(?!\/)/g, `$1=$2${prefix}/`)
  .replace(/url\((["']?)\/(?!\/)/g, `url($1${prefix}/`);
const json = text => text.replace(/(\[|,)"\/(?!\/)/g, `$1"${prefix}/`);
const js = text => text.replace(/(['"`])\/search\//g, `$1${prefix}/search/`);
const css = text => text.replace(/url\((["']?)\/(?!\/)/g, `url($1${prefix}/`);

let count = 0;
function walk(path) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    const ext = extname(name);
    const fix = ext === '.html' ? html : ext === '.json' && full.includes('/search/') ? json : ext === '.js' ? js : ext === '.css' ? css : null;
    if (!fix) continue;
    const before = readFileSync(full, 'utf8');
    const after = fix(before);
    if (after !== before) { writeFileSync(full, after); count++; }
  }
}
walk(dir);
console.log(`rewrote ${count} files for base ${base}`);
