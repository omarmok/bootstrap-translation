import fs from 'node:fs';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {origin, intro, routeVersion, localRoute, outputPath, dataFile, readJSON} from './common.mjs';
import {segments} from './language.mjs';
import {markComponentHeadings} from './components.mjs';

const scope = readJSON('content/scope.json');
const coverage = readJSON('content/coverage.json');
const sections = readJSON('content/sections.json');
const pages = new Map();
const errors = [];
const paths = new Map();
const redirects = new Set();
const localLinks = new Map();
const record = (route, message) => errors.push(`${route} ${message}`);
const file = route => 'dist/' + outputPath(route);
const all = Object.entries(scope.pages).filter(([,entry])=>entry.http === 200 && !entry.alias);
const queued = [...all.map(([source])=>[localRoute(source),source]),['/',intro]];

for (const [route,source] of queued) {
  const data = readJSON(dataFile(source));
  if (!data || !fs.existsSync(file(route))) {
    record(route,'missing page or content');
    continue;
  }
  markComponentHeadings(data);
  const $ = load(fs.readFileSync(file(route),'utf8'));
  const ids = new Set();
  const pairIDs = new Set();
  const expected = new Set([...segments(data)].map(segment=>segment.id));
  for (const heading of [data.title,...data.blocks].filter(block=>block.termKey)) {
    const row = $('.pair').filter((_,node)=>$(node).attr('id')===heading.id);
    const explanation = row.find(`[lang="ar"] .term-meaning[data-meaning-key="${heading.termKey}"]`);
    if (explanation.length !== 1 || !/[\u0621-\u064a]/u.test(explanation.text())) {
      record(route,'missing inline component meaning #'+heading.id);
    }
  }
  const article = $('.document');
  if (!article.length || !$('link[rel=stylesheet][href*=bootstrap][integrity][crossorigin]').length) record(route,'missing document or pinned RTL stylesheet');
  if (!$('script[src*=bootstrap][integrity][crossorigin]').length) record(route,'missing pinned Bootstrap bundle');
  if (!$('a[href="'+origin+source+'"]').length) record(route,'missing original source link');
  $('[id]').each((_,node)=>{
    const id = $(node).attr('id');
    if (ids.has(id)) record(route,'duplicate anchor #'+id);
    ids.add(id);
  });
  article.find('.pair').each((_,node)=>{
    const pair = $(node);
    const id = pair.attr('data-segment');
    const required = pair.children('.edition').toArray().map(child=>[$(child).attr('lang'),$(child).attr('dir')].join('/')).join(' ');
    if (required !== 'ar/rtl en/ltr' || !id || pairIDs.has(id)) record(route,'broken segment row #'+id);
    if (pair.attr('data-translated') !== 'true') record(route,'missing Arabic translation #'+id);
    pairIDs.add(id);
    pair.children('.edition').each((_,edition)=>{
      const text = $(edition).find('[data-speech-source]').clone();
      text.find('button').remove();
      if ((!text.text().trim() && !text.find('img[alt]').length) || $(edition).children('button.speak').length !== 1) record(route,'empty or unreadable segment #'+id);
    });
  });
  for (const id of expected) if (!pairIDs.has(id)) record(route,'missing segment #'+id);
  for (const section of sections[source] ?? []) {
    if (!pairIDs.has(section.id)) record(route,'missing inventoried section #'+section.id);
  }
  for (const id of pairIDs) if (!expected.has(id)) record(route,'unexpected segment #'+id);
  if (article.find('.code-block').filter((_,node)=>$(node).find('pre code').length!==1 || $(node).find('button.copy-code').length!==1).length) record(route,'code copy controls are missing');
  if (article.find('.preview iframe').filter((_,node)=>!$(node).attr('sandbox')?.includes('allow-scripts')).length) record(route,'preview has no sandbox');
  const local = $('a[href],link[href],script[src],iframe[src],option[value]').map((_,node)=>$(node).attr('href')??$(node).attr('src')??$(node).attr('value')).get();
  localLinks.set(route,new Set(local.filter(link=>link.startsWith('/') && !link.startsWith('//') || link.startsWith('#'))));
  pages.set(route,ids);
}

for (const [route,entry] of Object.entries(scope.pages)) {
  if (!entry.alias || route === '/') continue;
  if (!fs.existsSync(file(route))) {
    record(route,'missing official alias');
    continue;
  }
  const $ = load(fs.readFileSync(file(route),'utf8'));
  const target = $('a[href]').first().attr('href');
  if (!pages.has(target)) record(route,'invalid alias to '+target);
  redirects.add(route);
}

let linkCount=0;
function checkLink(route,href) {
  const target = new URL(href,'http://reader.test'+route);
  const pathname = decodeURIComponent(target.pathname);
  const fragment = decodeURIComponent(target.hash.slice(1));
  if (!paths.has(pathname)) paths.set(pathname,pages.has(pathname)||redirects.has(pathname)||fs.existsSync(file(pathname)));
  if (!paths.get(pathname)) record(route,'local link missing '+href);
  else if (fragment && !fragment.startsWith(':~:text=') && pages.has(pathname) && !pages.get(pathname).has(fragment)) record(route,'missing section '+href);
  linkCount++;
}
for (const [route,links] of localLinks) for (const href of links) checkLink(route,href);
for (const name of fs.readdirSync('dist/search')) {
  for (const entry of readJSON('dist/search/'+name)) checkLink('/',entry[0]);
}

for (const [v,stat] of Object.entries(coverage.versions)) {
  const count = all.filter(([route])=>routeVersion(route)===v).length;
  if (stat.expected !== count || stat.generated !== count || stat.complete !== count) record(v,`coverage ${stat.complete}/${stat.expected}, expected ${count} originated pages`);
}
if (errors.length) {
  for(const line of errors.slice(0,80)) console.error(line);
  console.error(`${errors.length} checks failed.`);
  process.exitCode=1;
} else {
  assert.equal(queued.length-1,all.length);
  console.log(`Verified ${all.length} source pages, ${redirects.size} aliases, and ${linkCount.toLocaleString('en')} local links and search entries.`);
}
