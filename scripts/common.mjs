import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const origin = 'https://getbootstrap.com';
export const latest = '5.3';
export const releases = {
  '5.3': '5.3.8', '6.0': '6.0.0-alpha.1',
  '5.2': '5.2.3', '5.1': '5.1.3', '5.0': '5.0.2',
  '4.6': '4.6.2', '4.5': '4.5.3', '4.4': '4.4.1', '4.3': '4.3.1',
  '4.2': '4.2.1', '4.1': '4.1.3', '4.0': '4.0.0',
  '3.4': '3.4.1', '3.3': '3.3.7',
  ...Object.fromEntries(['2.3.2','2.3.1','2.3.0','2.2.2','2.2.1','2.2.0','2.1.1','2.1.0','2.0.4','2.0.3','2.0.2','2.0.1','2.0.0','1.4.0','1.3.0','1.2.0','1.1.1','1.1.0','1.0.0'].map(v => [v,v])),
};
export const intro = '/docs/5.3/getting-started/introduction/';
export const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const clean = text => text.replace(/\s+/gu,' ').trim();
export const hash = value => createHash('sha256').update(value).digest('hex').slice(0,20);
export const readJSON = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : fallback;
export function writeFile(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, value);
}
export function writeJSON(file, value, pretty = false) {
  writeFile(file, JSON.stringify(value, null, pretty ? 2 : 0) + '\n');
}
export const cacheFile = route => `.cache/html/${hash(route)}.html`;
export const dataFile = route => `content/pages/${hash(route)}.json`;
export const routeVersion = url => /^\/(?:docs\/)?(\d+\.\d+(?:\.\d+)?)\//.exec(url)?.[1] ?? 'عام';
export function versionHome(v) {
  const major = Number(v.split('.')[0]);
  return major >= 3 ? `/docs/${v}/` : `/${v}/`;
}
export function routeFor(value, parent = '/') {
  let u;
  try { u = new URL(value, origin + parent); } catch { return; }
  if (u.hostname !== 'getbootstrap.com' && u.hostname !== 'www.getbootstrap.com') return;
  const p = u.pathname.replace(/\/{2,}/g,'/').replace(/\/index(?:\.html)?\/?$/,'/');
  if (p === '/' || /^\/(?:docs\/versions|about|docsref|migration|docs|(?:docs\/)?(?:components|content|customize|examples|forms|getting-started|guides|helpers|layout|utilities))\/?$/.test(p)) return p.endsWith('/') ? p : p + '/';
  const version = /^\/(?:docs\/)?(\d+\.\d+(?:\.\d+)?)(?:\/|$)/.exec(p)?.[1];
  if (!version || !Object.hasOwn(releases,version)) return;
  if (!/^\/docs\/\d+\.\d+\/content\/images\/?$/.test(p) && /(?:^|\/)(?:assets|dist|css|js|img|images|fonts|pagefind|vendor|download\.zip)(?:\/|$)/.test(p)) return;
  if (!/^[\w./-]+$/.test(p) || /\.(?:php|xml|txt|zip|svg|png|gif|jpg|webp|js|css|json|scss|ico|map|pdf|woff2?)\/?$/i.test(p)) return;
  if (/\.html\/?$/.test(p)) return p.replace(/\/$/,'');
  return p.endsWith('/') ? p : p + '/';
}
export const localRoute = route => route === '/' ? '/bootstrap-home/' : route;

export function outputPath(route) {
  return route.endsWith('/') ? route.slice(1) + 'index.html' : route.slice(1);
}
