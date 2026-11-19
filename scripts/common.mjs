import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const origin = 'https://getbootstrap.com';
export const latest = '5.3';
// Only the current Bootstrap release is published. Older releases and the 6.0 alpha were removed on request;
// their extracted content stays in content/ so they can be restored by adding them back here.
export const releases = {
  '5.3': '5.3.8',
};
export const inScope = route => {
  const version = routeVersion(route);
  return version === 'عام' || Object.hasOwn(releases, version);
};
// Drop pages of removed releases and point official aliases (e.g. /docs/ → 6.0) at the matching 5.3 page.
export function limitScope(scope) {
  const pages = Object.fromEntries(Object.entries(scope.pages).filter(([route])=>inScope(route)));
  const kept = route => pages[route] && !pages[route].alias;
  for (const item of Object.values(pages)) {
    if (!item.alias || inScope(item.alias)) continue;
    const same = item.alias.replace(/^\/(?:docs\/)?\d+\.\d+(?:\.\d+)?\//, `/docs/${latest}/`);
    item.alias = kept(same) ? same : intro;
  }
  scope.pages = pages;
  return scope;
}
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
