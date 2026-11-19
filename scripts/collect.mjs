import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { load } from 'cheerio';
import { origin, releases, intro, routeFor, versionHome, cacheFile, readJSON, writeJSON, writeFile, hash } from './common.mjs';

const exec = promisify(execFile);
const inventory = readJSON('content/scope.json', {pages:{}, releases:{}, sitemaps:{}});
const queue = new Set();
const visited = new Set();
const selected = new Set(process.argv.slice(2));
const include = route => !selected.size || [...selected].some(key => route.startsWith(versionHome(key)));
const sourceMeta = new Map();
const officialEntry = {
  '6.0': '/docs/6.0/getting-started/install/',
  '5.3': intro
};

function add(route, via, expected = true) {
  if (!route) return;
  inventory.pages[route] ??= {sources:[], expected:false};
  const item = inventory.pages[route];
  if (!item.sources.includes(via)) item.sources.push(via);
  item.expected ||= expected;
  if (!visited.has(route) && (include(route) || !selected.size)) queue.add(route);
}

async function request(url, timeout = 24) {
  try {
    const {stdout} = await exec('curl', ['-LsS','--compressed','--connect-timeout','5','--max-time',String(timeout),'-w','\n%{http_code} %{url_effective}',url],{maxBuffer:15_000_000});
    const cut = stdout.lastIndexOf('\n');
    const [status, final] = stdout.slice(cut + 1).split(' ');
    return {status:Number(status), final, body:stdout.slice(0,cut)};
  } catch {
    return {status:0, final:url, body:''};
  }
}

async function parallel(items, limit, fn) {
  const work = [...items];
  await Promise.all(Array.from({length:Math.min(limit,work.length)}, async () => {
    while(work.length) await fn(work.shift());
  }));
}

function routesFromTree(v, entries) {
  const root = versionHome(v);
  const major = Number(v.split('.')[0]);
  const paths = [];
  for (const file of entries) {
    if (major >= 6) {
      const match = /^site\/src\/content\/docs\/(.+)\.(mdx?|html)$/.exec(file);
      if (match) paths.push(root + match[1].replace(/\/index$/, '') + '/');
      const demo = /^site\/src\/pages\/.*?examples\/(.+)\.(astro|html)$/.exec(file);
      if (demo && !demo[1].includes('[')) paths.push(root + 'examples/' + demo[1].replace(/\/index$/,'') + '/');
      continue;
    }
    if (major >= 4) {
      const astro = /^site\/src\/content\/docs\/(.+)\.mdx?$/.exec(file);
      const hugo = /^(?:site\/content\/docs\/[^/]+|docs\/[^/]+|docs)\/(.+)\.(?:mdx?|html)$/.exec(file);
      const match = astro ?? hugo;
      if (!match || match[1].startsWith('_includes/') || match[1].startsWith('_layouts/')) continue;
      if (/^docs\/[^/]+\//.test(file) && !/^docs\/\d+\.\d+\//.test(file)) {
        // Jekyll layouts use subdirectories named by documentation section.
        paths.push(root + file.replace(/^docs\//,'').replace(/\.(?:md|html)$/,'').replace(/\/?(?:_index|index)$/,'') + '/');
      } else {
        const slug = match[1].replace(/\/?(?:_index|index)$/, '');
        paths.push(root + (slug ? slug + '/' : ''));
      }
      continue;
    }
    if (major === 3) {
      const match = /^docs\/((?:getting-started|css|components|javascript|customize|about|migration|browser-bugs)(?:\/index)?|examples\/[^/]+\/index)\.(?:html|md)$/.exec(file);
      if (match) paths.push(root + match[1].replace(/\/index$/,'') + '/');
      continue;
    }
    const legacy = /^(?:docs|examples)\/(.+\.html)$/.exec(file);
    if (legacy && !/(?:templates|assets|tests)\//.test(legacy[1])) {
      const relative = file.startsWith('examples/') ? file : legacy[1];
      paths.push(relative === 'index.html' ? root : root + relative);
    }
  }
  return [...new Set(paths.map(route => routeFor(route)).filter(Boolean))];
}

async function readTree([v, release]) {
  if (selected.size && !selected.has(v)) return;
  const tag = 'v' + release;
  const file = `.cache/trees/${release}.json`;
  let entries = readJSON(file);
  const github = `https://api.github.com/repos/twbs/bootstrap/git/trees/${tag}?recursive=1`;
  let source = github;
  if (!entries) {
    for (const url of [github,`https://data.jsdelivr.com/v1/package/gh/twbs/bootstrap@${tag}/flat`,`https://data.jsdelivr.com/v1/package/gh/twbs/bootstrap@${release}/flat`]) {
      const result = await request(url,20);
      if (result.status !== 200) continue;
      try {
        const body = JSON.parse(result.body);
        entries = body.tree?.filter(item => item.type === 'blob').map(item => item.path) ?? body.files?.map(item => item.name.replace(/^\//,''));
        if (!entries?.length) continue;
        source = url;
        writeJSON(file, entries);
        break;
      } catch {}
    }
  }
  if (entries) {
    for (const route of routesFromTree(v, entries)) add(route, 'source:' + tag, false);
    sourceMeta.set(v, {tag, source, files:entries.length});
  } else {
    sourceMeta.set(v, {tag, source, files:0});
  }
}

function metaRefresh($) {
  const content = $('meta[http-equiv]').filter((_, n) => $(n).attr('http-equiv').toLowerCase() === 'refresh').first().attr('content');
  return content?.match(/url\s*=\s*["']?([^"']+)/i)?.[1]?.trim();
}

function discover(route, $, base) {
  const candidates = $('a[href]').filter((_, node) => !$(node).closest('.bd-example,.bs-example,pre,code,#carbonads,[data-bs-toggle]').length);
  candidates.each((_, node) => {
    const link = $(node).attr('href');
    if (!link || link.startsWith('#')) return;
    const found = routeFor(link,base);
    const old = /^\/[12]\.\d+\.\d+\//.test(found ?? '');
    if (old && route === '/docs/versions/') add(found, 'versions');
    if (!found || found === route) return;
    const nav = $(node).closest('nav,.bd-sidebar,.navbar,.topbar,.bd-content,.bs-docs-sidenav,main').length > 0;
    add(found, nav ? 'navigation' : 'page-link');
  });
}

async function visit(route, retry = false) {
  visited.add(route);
  const item = inventory.pages[route];
  const file = cacheFile(route);
  let body, final = route;
  if (fs.existsSync(file)) {
    body = fs.readFileSync(file,'utf8');
  } else {
    const result = await request(origin + route, retry ? 28 : 14);
    item.http = result.status;
    if (result.status !== 200) return;
    body = result.body;
    final = routeFor(result.final) ?? route;
  }
  if (body.length < 120 || !/<(?:!doctype|html|head|body|meta)\b/i.test(body)) return;
  const $ = load(body);
  const redirect = metaRefresh($);
  const canonical = routeFor($('link[rel=canonical]').attr('href') || '', route);
  const alternative = redirect ? routeFor(redirect,final) : final !== route ? final : canonical;
  if (alternative && alternative !== route && alternative !== '/' && alternative !== '/404/') {
    item.alias = alternative;
    item.http = 200;
    add(alternative, 'redirect');
  } else if ($('title').first().text().trim() && !/^404\b/.test($('title').first().text()) && ($('h1, main, .container, .jumbotron, .bd-content').length || /\/examples\//.test(route))) {
    item.http = 200;
  } else {
    item.http = 422;
    return;
  }
  if (!fs.existsSync(file)) writeFile(file, body);
  if (!item.alias) discover(route, $, final);
}

for (const url of ['/', '/docs/versions/', '/docs/5.3/examples/', intro]) add(url, 'entry');
for (const v of Object.keys(releases)) {
  if (include(versionHome(v))) {
    add(versionHome(v), 'versions');
    if (officialEntry[v]) add(officialEntry[v], 'entry');
  }
}
if (!selected.size) {
  const seenSitemaps = new Set();
  async function sitemap(route) {
    if (seenSitemaps.has(route)) return;
    seenSitemaps.add(route);
    const snapshot = `.cache/sitemaps/${hash(route)}.xml`;
    const result = fs.existsSync(snapshot)
      ? {status:200,body:fs.readFileSync(snapshot,'utf8')}
      : await request(origin + route,18);
    inventory.sitemaps[route] = result.status;
    if (result.status !== 200) return;
    if (!fs.existsSync(snapshot)) writeFile(snapshot,result.body);
    const children = [];
    for (const [, location] of result.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = new URL(location,origin);
      if (url.origin !== origin) continue;
      if (url.pathname.endsWith('.xml')) children.push(url.pathname);
      else add(routeFor(location),'sitemap');
    }
    await parallel(children,4,sitemap);
  }
  await parallel(['/sitemap.xml','/sitemap-index.xml','/docs/5.3/sitemap.xml','/docs/6.0/sitemap.xml'],4,sitemap);
}

function save() {
  for (const [v, info] of sourceMeta) inventory.releases[v] = info;
  inventory.pages = Object.fromEntries(Object.entries(inventory.pages).sort(([a],[b]) => a.localeCompare(b)));
  writeJSON('content/scope.json', inventory, true);
}

async function drain() {
  while (queue.size) {
    const batch = [...queue];
    queue.clear();
    await parallel(batch, 22, route => visit(route));
    save();
    console.log(`Discovered ${Object.keys(inventory.pages).length} routes. Cached ${Object.values(inventory.pages).filter(p => p.http === 200).length}.`);
  }
}

await Promise.all([parallel(Object.entries(releases), 10, readTree), drain()]);
await drain();
const retries = Object.entries(inventory.pages).filter(([route,item]) => include(route) && (!item.http || item.http === 422 || item.http >= 500)).map(([route]) => route);
await parallel(retries,18,route => visit(route,true));
await drain();
save();
