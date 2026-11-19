import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';
import { limitScope, origin, releases, latest, intro, esc, clean, hash, readJSON, writeJSON, writeFile, dataFile, routeFor, routeVersion, localRoute, outputPath, versionHome } from './common.mjs';
import { arabic, decorateArabic, eligibleHTML, segments, translate, validTranslation } from './language.mjs';
import { icon, sectionName, sectionOrder } from './design.mjs';
import { markComponentHeadings } from './components.mjs';

const scope = readJSON('content/scope.json');
limitScope(scope);
const translations = Object.assign(Object.create(null),readJSON('content/translations.json',{}));
for (const [key,value] of Object.entries(readJSON('content/machine-translations.json',{}))) {
  if (validTranslation(key,value) || !validTranslation(key,translations[key])) translations[key] = value;
}
const cdn = readJSON('content/cdn.json',{});
const rtlStyle = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.rtl.min.css';
const appBundle = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js';
cdn[rtlStyle] = 'sha384-CfCrinSRH2IR6a4e6fy2q6ioOX7O6Mtm1L9vRvFZ1trBncWmMePhzvafv7oIcWiW';
cdn[appBundle] = 'sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI';
const font = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';
const stages = 'dist';
const preferred = {'6.0':'/docs/6.0/getting-started/install/','5.3':intro};
const pages = new Map();
const stats = {};
const unresolved = new Map();
const search = new Map();
const nav = new Map();
const menus = new Map();
const parse = html => load(html,{},false);
const plain = html => clean(!/[<&]/.test(html ?? '') ? html ?? '' : parse(html).root().text());
const listen = icon('volume',17);
const stop = icon('stop',17);
const sitePath = route => stages + '/' + outputPath(route);
const layoutDirection = route => /(?:-rtl|\/rtl)\/?$/.test(route) ? 'rtl' : 'ltr';

for (const [route,item] of Object.entries(scope.pages)) {
  if (item.alias || item.http !== 200 || !fs.existsSync(dataFile(route))) continue;
  const page = markComponentHeadings(readJSON(dataFile(route)));
  page.headings = [];
  page.anchors = new Set(['main']);
  page.section = groupFor(page);
  page.untranslated = [];
  const opening = [page.title,page.lead].filter(Boolean);
  for (const b of groupedBlocks([...opening,...page.blocks])) {
    page.anchors.add(b.id);
    for (const id of b.anchors ?? []) page.anchors.add(id);
    if (b.type === 'heading' && b.level > 1) page.headings.push(b);
    if (b.en) {
      b.ar ??= translate(b.en,translations);
      if ((!arabic.test(plain(b.ar)) && !eligibleHTML(b.en)) || !b.ar.trim()) page.untranslated.push(b.id);
    }
  }
  pages.set(route,page);
  nav.set(page.version,[...(nav.get(page.version) ?? []),page]);
}

function* groupedBlocks(list) {
  for (const b of list) {
    yield b;
    if (b.body) yield* groupedBlocks(b.body);
    if (b.items) for (const item of b.items) yield* groupedBlocks(item.body);
    if (b.caption) yield* groupedBlocks(b.caption);
    if (b.rows) for (const row of b.rows) for (const cell of row.cells) yield* groupedBlocks(cell.body);
  }
}
function groupFor(page) {
  if (page.version === 'عام') return page.route.includes('versions') ? 'other' : 'general';
  const rel = page.route.slice(versionHome(page.version).length).split('/')[0].replace(/\.html$/,'');
  if (rel === 'index' || !rel || rel === 'scaffolding') return 'getting-started';
  if (rel === 'base-css') return 'css';
  return sectionOrder.includes(rel) ? rel : 'other';
}
function resolve(route) {
  const seen = new Set();
  while (scope.pages[route]?.alias && !seen.has(route)) {
    seen.add(route);
    route = scope.pages[route].alias;
  }
  return pages.has(route) ? route : undefined;
}
function home(version) {
  return resolve(preferred[version] ?? versionHome(version)) ??
    nav.get(version)?.find(p=>p.section === 'getting-started')?.route ?? nav.get(version)?.[0]?.route;
}
function anchorFor(page, fragment) {
  let decoded = fragment;
  try { decoded = decodeURIComponent(decoded); } catch {}
  if (page.anchors.has(decoded)) return decoded;
  const lower = decoded.toLowerCase();
  for (const an of page.anchors) if (an.toLowerCase() === lower) return an;
}
function relocatedAnchor(route,fragment) {
  const version = routeVersion(route);
  const docs = `/docs/${version}/`;
  const relative = route.startsWith(docs) ? route.slice(docs.length) : route;
  const moves = {
    'getting-started/contents/#comparison-of-css-files':['getting-started/contents/','css-files'],
    'layout/grid/#horizontal-alignment':['layout/columns/','horizontal-alignment'],
    'layout/grid/#column-classes':['layout/columns/','standalone-column-classes'],
    'components/breadcrumb/#changing-the-separator':['components/breadcrumb/','dividers'],
    'components/offcanvas/#sass':['components/offcanvas/','sass-variables'],
    'components/carousel/#with-controls':['components/carousel/',version==='6.0'?'overlay-controls':'basic-examples'],
    'migration/#improved-markup-for-progress-bars':['migration/','progress-bars'],
    'utilities/text/#opacity':['utilities/colors/','opacity'],
    'utilities/borders/#border-color':['utilities/borders/','color'],
    'utilities/borders/#border-width':['utilities/borders/','width'],
    'components/tab/#javascript-behavior':['components/tab/','via-javascript'],
    'forms/form-control/#sizing':['forms/form-control/','sizes'],
  };
  const move = moves[relative + '#' + fragment];
  if (move) return [docs + move[0],move[1]];
  if (version.startsWith('1.') && fragment==='twipsy') return [`/${version}/javascript.html`,'using-bootstrap-twipsyjs'];
  if (version.startsWith('1.') && fragment==='dropdowns') return [`/${version}/javascript.html`,'using-bootstrap-dropdownjs'];
  if (version.startsWith('2.') && fragment==='tooltip') return [route,'tooltips'];
  if (version.startsWith('2.') && fragment==='grid') return [route,'live-grid-example'];
}

function rewritten(html,current) {
  if (!/<a\b/i.test(html)) return html;
  const $ = parse(html);
  $('a[href]').each((_,node)=>{
    const a = $(node);
    const href = a.attr('href');
    let url;
    try { url = new URL(href,origin+current); } catch { return; }
    const route = href.startsWith('#') ? current : routeFor(url.href);
    let target = resolve(route);
    if (!target) return;
    const fragment = url.hash.slice(1);
    let anchor = fragment ? anchorFor(pages.get(target),fragment) : '';
    if (fragment && !anchor) {
      const move = relocatedAnchor(target,fragment);
      const destination = move ? resolve(move[0]) : undefined;
      const relocated = destination ? anchorFor(pages.get(destination),move[1]) : undefined;
      if (relocated) {
        target = destination;
        anchor = relocated;
      }
    }
    const same = current === target;
    if (fragment && !anchor && !fragment.includes(':~:text=')) {
      unresolved.set(`${current} → ${url.pathname}${url.hash}`,{from:current,to:url.pathname+url.hash});
      a.attr('href',url.href);
      return;
    }
    a.attr('href',(same && anchor ? '' : localRoute(target)) + url.search + (anchor ? '#'+encodeURIComponent(anchor) : url.hash));
  });
  return $.root().html();
}

function cssTag(src) { return `<link rel="stylesheet" href="${esc(src)}"${cdn[src] ? ` integrity="${cdn[src]}" crossorigin="anonymous"` : ''}>`; }
function jsTag(src, defer = false, type = '') {
  return `<script src="${esc(src)}"${type ? ` type="${esc(type)}"` : ''}${cdn[src] ? ` integrity="${cdn[src]}" crossorigin="anonymous"` : ''}${defer ? ' defer' : ''}></script>`;
}
function bootstrapAssets(version, direction) {
  const patch = releases[version] ?? releases[latest];
  const major = Number(patch.split('.')[0]);
  if (major < 3) return {};
  const base = `https://cdn.jsdelivr.net/npm/bootstrap@${patch}/dist/`;
  const rtl = base + 'css/bootstrap.rtl.min.css';
  const css = direction === 'rtl' && major >= 5 && cdn[rtl] ? rtl : base + 'css/bootstrap.min.css';
  const js = base + 'js/bootstrap' + (major >= 4 ? '.bundle' : '') + '.min.js';
  const jquery = major < 5 ? 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js' : '';
  return {css,js,jquery,major};
}
function speaker(lang, label) {
  return `<button class="speak" type="button" aria-label="${esc(label)}" aria-pressed="false" title="${lang==='ar'?'استمع':'Listen'}" data-lang="${lang==='ar'?'ar':'en-US'}">${listen}<span class="visually-hidden speak-label">${lang==='ar'?'استمع':'Listen'}</span></button>`;
}
function pair(page,b,seen,kind,bothHeading = false) {
  if (b.type === 'heading') seen.clear();
  const label = kind === 'title' || kind === 'heading';
  const tag = label ? 'h'+Math.min(6,b.level ?? 2) : (kind === 'caption' ? 'div' : 'p');
  b.inlineMeanings = [];
  const ar = decorateArabic(rewritten(b.ar,page.route),seen,icon('volume',14),{key:b.termKey,meanings:b.inlineMeanings});
  const en = rewritten(b.en,page.route);
  const marked = kind === 'item' ? ' item-text' : '';
  const mainTag = `<${tag} class="text${marked}" data-speech-source>`;
  return `<div id="${esc(b.id)}" class="pair pair-${kind}" data-segment="${esc(b.id)}" data-translated="${!page.untranslated.includes(b.id)}">
    <div class="edition" lang="ar" dir="rtl">${mainTag}${ar}</${tag}>${speaker('ar',label?'استمع إلى العنوان بالعربية':'استمع إلى المقطع بالعربية')}</div>
    <div class="edition" lang="en" dir="ltr"><${tag} class="text${marked}" data-speech-source${label&&!bothHeading?' role="presentation"':''}>${en}</${tag}>${speaker('en',label?'Listen to the heading in English':'Listen to the passage in English')}</div>
  </div>`;
}
const anchors = b => (b.anchors??[]).map(id=>`<span id="${esc(id)}" class="anchor-marker" aria-hidden="true"></span>`).join('');
function highlight(code, language) {
  const escaped = esc(code);
  if (!/<(?:[a-zA-Z!]|\/)/.test(code) || /^(scss|css|js|javascript|json|shell|bash|sh)$/.test(language)) return escaped;
  return escaped.replace(/&lt;!--[\s\S]*?--&gt;|&lt;\/?[\w!:-]+[^\n]*?&gt;/g,tag => {
    if (tag.startsWith('&lt;!--')) return '<span class="syntax-comment">'+tag+'</span>';
    return tag.replace(/^(&lt;\/?[\w!:-]+)/,'<span class="syntax-tag">$1</span>')
      .replace(/(?:&quot;.*?&quot;|&#39;.*?&#39;)/g,value=>'<span class="syntax-string">'+value+'</span>');
  });
}
function codeBlock(b) {
  const lang = b.language ? esc(b.language.toUpperCase()) : 'Code';
  return `<div class="code-block" id="${esc(b.id)}"><div class="code-head" dir="ltr"><span class="code-lang" lang="en">${icon('code',16)}${lang}</span><button class="copy-code" type="button" dir="rtl" lang="ar">${icon('copy',15)}<span>نسخ الكود</span></button></div><pre dir="ltr" lang="en" tabindex="0"><code>${highlight(b.value,b.language)}</code></pre></div>`;
}
function previewBlock(page,b) {
  const inline = b.type === 'demo';
  const source = inline ? `/previews/${b.key}.html` : b.src;
  const version = releases[page.renderedVersion] ?? releases[page.version] ?? releases[latest];
  return `<figure class="preview" id="${esc(b.id)}"><figcaption><span>معاينة المثال</span><bdi dir="ltr" lang="en">Bootstrap ${esc(version)}</bdi></figcaption><iframe loading="lazy" title="معاينة مثال Bootstrap" dir="ltr" src="${esc(source)}" height="${Number(b.height)}" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe></figure>`;
}
function renderBlocks(page,list,seen,depth=1) {
  return list.map(b=>{
    let view;
    if (b.type === 'code') view=codeBlock(b);
    else if (b.type === 'demo' || b.type === 'frame') view=previewBlock(page,b);
    else if (b.type === 'media') view=`<div class="media" id="${esc(b.id)}">${b.html}</div>`;
    else if (b.type === 'note') view=`<aside class="note note-${b.tone}" id="${esc(b.id)}">${renderBlocks(page,b.body,seen,depth)}</aside>`;
    else if (b.type === 'list') {
      const start = Number(b.start);
      view = `<${b.tag} class="pair-list" id="${esc(b.id)}" style="--depth:${depth};--list-offset:${Number.isInteger(start)&&start > 0 ? start-1 : 0}"${b.tag === 'ol' && start ? ` start="${start}"` : ''}>${b.items.map(item=>`<${item.tag}>${renderBlocks(page,item.body,seen,depth+1)}</${item.tag}>`).join('')}</${b.tag}>`;
    } else if (b.type === 'table') {
      const renderRow = row => `<tr>${row.cells.map(cell=>{
        const c = cell.type;
        const numeric = (name,value) => value && /^\d+$/.test(value) ? ` ${name}="${value}"` : '';
        return `<${c}${numeric('colspan',cell.span)}${numeric('rowspan',cell.rowspan)}${cell.scope?` scope="${esc(cell.scope)}"`:''}>${renderBlocks(page,cell.body,seen,depth)}</${c}>`;
      }).join('')}</tr>`;
      const headings = b.rows.filter(row=>row.head);
      const remaining = b.rows.filter(row=>!row.head);
      const caption = b.caption.length ? `<caption>${renderBlocks(page,b.caption,seen,depth)}</caption>` : '';
      view = `<div class="table-wrap" id="${esc(b.id)}" tabindex="0" role="region" aria-label="جدول التوثيق"><table class="parallel-table">${caption}${headings.length?`<thead>${headings.map(renderRow).join('')}</thead>`:''}<tbody>${remaining.map(renderRow).join('')}</tbody></table></div>`;
    } else view=pair(page,b,seen,b.type==='note-text'?'paragraph':b.type);
    return anchors(b)+view;
  }).join('\n');
}

const initializeExamples = `document.addEventListener('DOMContentLoaded',()=>{
  if (window.bootstrap?.Tooltip) {
    document.querySelectorAll('[data-bs-toggle="tooltip"],[data-toggle="tooltip"]').forEach(el=>new bootstrap.Tooltip(el,{container:'body'}));
    document.querySelectorAll('[data-bs-toggle="popover"],[data-toggle="popover"]').forEach(el=>new bootstrap.Popover(el,{container:'body'}));
    document.querySelectorAll('[data-bs-spy="scroll"]').forEach(el=>bootstrap.ScrollSpy?.getOrCreateInstance?.(el));
    document.querySelectorAll('[data-bs-toggle="toast"], #liveToastBtn').forEach(el=>el.addEventListener('click',()=>{
      const selector=el.dataset.bsTarget||'#liveToast'; const toast=document.querySelector(selector); if(toast) bootstrap.Toast.getOrCreateInstance(toast).show();
    }));
  } else if (window.jQuery) {
    jQuery('[data-toggle="tooltip"]').tooltip?.({container:'body'});
    jQuery('[data-toggle="popover"]').popover?.({container:'body'});
  }
  document.querySelectorAll('#liveAlertBtn').forEach(button=>button.addEventListener('click',()=>{
    const placeholder=document.querySelector('#liveAlertPlaceholder');if(!placeholder)return;
    const alert=document.createElement('div');alert.className='alert alert-success alert-dismissible';alert.setAttribute('role','alert');
    alert.textContent='Nice, you triggered this alert message!';
    const close=document.createElement('button');close.type='button';close.className='btn-close';close.dataset.bsDismiss='alert';close.setAttribute('aria-label','Close');alert.append(close);placeholder.append(alert);
  }));
  document.querySelectorAll('.toast.show').forEach(el=>el.querySelector('[data-bs-dismiss="toast"]')?.addEventListener('click',()=>el.classList.remove('show')));
});`;
function demoHead() {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{color-scheme:light}body.embed-example{padding:1rem;margin:0}body.embed-example .placeholder-img{font-size:1.125rem;text-anchor:middle}body.embed-example svg{max-width:100%}body.embed-example [class^="bd-example-row"] .row>*{padding-top:.75rem;padding-bottom:.75rem;background:#f0e5ff;border:1px solid #b6a0d1}body.embed-example .modal.position-static,body.embed-example .offcanvas.position-static{display:block}body.embed-example [class*="scrollspy-example"]{position:relative;height:13rem;overflow:auto}body.embed-example .bd-example-offcanvas .offcanvas{position:static;display:block;height:15rem;visibility:visible;transform:none}</style>`;
}
function writeDemos(page) {
  if (!page.standalone && !page.demos.length) return;
  const assets = bootstrapAssets(page.renderedVersion ?? page.version,layoutDirection(page.route));
  const sourceStyles = page.sourceStyles;
  const fallbackStyles = sourceStyles.filter(url=>/(?:bootstrap(?:\.min|\.responsive|\.rtl)?\.css|bootstrap-responsive\.css)/i.test(url));
  let demoStyles = (assets.css ? [assets.css] : fallbackStyles).map(cssTag).join('');
  if (!demoStyles && /^2\./.test(page.version)) demoStyles = cssTag(origin+`/${page.version}/assets/css/bootstrap.css`);
  if (!demoStyles && /^1\./.test(page.version)) demoStyles = cssTag(origin+`/${page.version}/bootstrap.min.css`);
  const jquery = assets.jquery ? jsTag(assets.jquery) : /^2\./.test(page.version) ? jsTag('https://cdn.jsdelivr.net/npm/jquery@1.12.4/dist/jquery.min.js') : '';
  const legacy = !assets.js ? page.sourceScripts.filter(url=>/bootstrap[^/]*\.js$/.test(url)).map(url=>jsTag(url)).join(''):'';
  const bootstrap = jquery + (assets.js ? jsTag(assets.js) : legacy);
  for (const d of page.demos) {
    const style = d.attrs?.style ? ` style="${esc(d.attrs.style)}"` : '';
    const classes = d.attrs?.class || 'bd-example';
    const sprite = d.sprite ? `<svg xmlns="http://www.w3.org/2000/svg" hidden>${d.sprite}</svg>` : '';
    writeFile(`${stages}/previews/${d.key}.html`,`<!doctype html><html lang="en" dir="${layoutDirection(page.route)}"><head>${demoHead()}<title>Bootstrap Example</title>${demoStyles}</head><body class="embed-example">${sprite}<div class="${esc(classes)}"${style}>${d.html}</div>${bootstrap}<script>${initializeExamples}</script></body></html>`);
  }
  if (page.standalone && page.embed) {
    const demoStylesheets = sourceStyles.filter(url=>!/bootstrap(?:\.min|\.rtl|\.responsive)?\.css|docs\.css/.test(url)).map(cssTag).join('');
    const embed = page.embed;
    const $ = load(embed.body,{},false);
    $('script[src]').each((_,n)=>{
      const src=$(n).attr('src');
      if (!src || /bootstrap(?:\.bundle)?(?:\.min)?\.js|jquery|analytics|google-analytics/i.test(src)) $(n).remove();
    });
    const key = hash(page.route+':standalone');
    writeFile(`${stages}/previews/${key}.html`,`<!doctype html><html lang="en" dir="${esc(embed.dir)}"><head>${demoHead()}<base href="${esc(origin+page.route)}"><title>${esc(plain(page.title.en))}</title>${demoStyles}${demoStylesheets}${embed.headStyles}${bootstrap}</head><body class="${esc(embed.classes)}">${$.root().html()}<script>${initializeExamples}</script></body></html>`);
    page.standaloneFrame={id:'interactive-example',type:'demo',key,height:560};
    page.anchors.add('interactive-example');
  }
}

function options(page) {
  const current = page.version === 'عام' ? latest : page.version;
  return Object.keys(releases).filter(home).map(v=>{
    const relative = page.version === 'عام' ? '' : page.route.slice(versionHome(page.version).length);
    const matching = relative ? resolve(versionHome(v)+relative) : undefined;
    const dest = matching ?? home(v);
    const valid = localRoute(dest);
    return `<option value="${esc(valid)}" data-version="${esc(v)}"${v===current?' selected':''}>${esc(releases[v])}${v==='6.0'?' (Alpha)':''}</option>`;
  }).join('');
}
function navigation(page) {
  const version = page.version === 'عام' ? latest : page.version;
  if (!menus.has(version)) {
    const all = nav.get(version) ?? [];
    const official = all.find(p=>p.nav.length > 20)?.nav ?? [];
    const order = new Map(official.map((item,i)=>[routeFor(item.href),i]));
    order.set(home(version),-2);
    const grouped = Map.groupBy(all,p=>p.section);
    const menu = [...grouped].sort(([a],[b])=>sectionOrder.indexOf(a)-sectionOrder.indexOf(b)).map(([group,items])=>{
      const [ar,en] = sectionName(group);
      items.sort((a,b)=>(order.get(a.route)??1000)-(order.get(b.route)??1000) || a.route.localeCompare(b.route));
      const html = items.map(p=>`<li><a href="${esc(localRoute(p.route))}" title="${esc(plain(p.title.en))}">${esc(plain(p.title.ar))}</a></li>`).join('');
      return {group,summary:`<summary title="${esc(en)}"><span>${esc(ar)}</span>${icon('chevron',15)}</summary>`,html};
    });
    menus.set(version,menu);
  }
  const active = page.version==='عام' ? 'getting-started' : page.section;
  const href = 'href="'+esc(localRoute(page.route))+'"';
  return '<div class="nav-groups">'+menus.get(version).map(menu=>{
    const open = menu.group===active;
    const links = open ? menu.html.replace(href,href+' aria-current="page"') : menu.html;
    return `<details${open?' open':''}>${menu.summary}<ul class="nav-list">${links}</ul></details>`;
  }).join('')+'</div>';
}

function toc(page) {
  if (!page.headings.length) return '<div></div>';
  return `<nav class="toc" aria-label="في هذه الصفحة"><details id="page-toc" open><summary class="toc-title">${icon('list')} في هذه الصفحة</summary><ul class="toc-list">${page.headings.map(b=>`<li data-level="${b.level}"><a href="#${esc(encodeURIComponent(b.id))}" title="${esc(plain(b.en))}">${esc(plain(b.ar))}</a></li>`).join('')}</ul></details></nav>`;
}
function primaryLinks(page) {
  const examplePath = resolve(versionHome(page.version) + 'examples/') ?? resolve('/docs/5.3/examples/');
  const download = resolve(versionHome(page.version) + 'getting-started/download/') ?? resolve('/docs/5.3/getting-started/download/');
  return `<a href="/bootstrap-home/">الرئيسية</a><a href="${esc(localRoute(home(page.version)??home(latest)))}">التوثيق</a>${download?`<a href="${esc(localRoute(download))}">التنزيل</a>`:''}${examplePath?`<a href="${esc(localRoute(examplePath))}">الأمثلة</a>`:''}<a href="/docs/versions/">الإصدارات</a>`;
}
function catalog(page) {
  return `<header class="topbar"><div class="topbar-inner">
    <button class="mobile-nav" type="button" data-bs-toggle="offcanvas" data-bs-target="#mobile-sections" aria-controls="mobile-sections" aria-label="أقسام التوثيق">${icon('menu',19)}</button>
    <a class="brand" href="/" aria-label="Bootstrap بالعربي، بداية التوثيق"><span class="brand-mark" aria-hidden="true">B</span><span class="brand-name"><strong lang="en" dir="ltr">Bootstrap</strong><small>التوثيق بالعربي</small></span></a>
    <nav class="topnav" aria-label="التنقل الرئيسي">${primaryLinks(page)}</nav>
    <div class="top-actions"><button class="search-launch" type="button" data-bs-toggle="modal" data-bs-target="#search-dialog" aria-label="ابحث في التوثيق">${icon('search',17)}<span>ابحث في التوثيق</span><kbd dir="ltr" lang="en">⌘ K</kbd></button>
    <label class="release-select"><span class="visually-hidden">إصدار Bootstrap</span><select id="release" dir="ltr" lang="en">${options(page)}</select>${icon('chevron',15)}</label></div>
    </div></header>`;
}
const dialog = `<div class="modal fade search-modal" id="search-dialog" tabindex="-1" aria-labelledby="search-label"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><form id="reader-search-form" class="search-form" role="search">${icon('search',19)}<label class="visually-hidden" id="search-label" for="search-input">ابحث في التوثيق</label><input id="search-input" type="search" dir="auto" placeholder="ابحث بالعربي أو بالإنجليزي" autocomplete="off"><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="إغلاق البحث"></button></form><p id="search-status" class="search-status" role="status"></p><ul class="search-results" id="search-results"></ul></div></div></div>`;
function renderPage(page) {
  const seen = new Set();
  const version = page.version === 'عام' ? latest : page.version;
  const original = origin+page.route;
  const [group] = sectionName(page.section);
  const links = navigation(page);
  const crumb = `<nav class="breadcrumbs" aria-label="مسار الصفحة"><a href="/">التوثيق</a><span aria-hidden="true">/</span><a dir="ltr" lang="en" href="${esc(localRoute(home(version)))}">v${esc(releases[version])}</a><span aria-hidden="true">/</span><span>${esc(group)}</span></nav>`;
  const licenseVersion = page.renderedVersion ?? version;
  const code = Number(licenseVersion.split('.')[0]) < 3 ? 'Apache-2.0' : 'MIT';
  const patch = releases[licenseVersion];
  const archivedLicense = `bootstrap-${patch}.txt`;
  const codeFile = fs.existsSync('web/licenses/'+archivedLicense) ? archivedLicense : code+'.txt';
  const licensing = `<a href="/licenses/${codeFile}" rel="license" lang="en" dir="ltr">${code}</a> · <a href="/licenses/CC-BY-3.0.txt" rel="license" lang="en" dir="ltr">CC BY 3.0</a>`;
  return `<!doctype html>
<html lang="ar" dir="rtl" data-version="${esc(version)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(plain(page.title.ar))} · Bootstrap بالعربي</title><meta name="description" content="${esc(plain(page.lead?.ar ?? page.title.ar).slice(0,170))}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${esc(font)}">
${cssTag(rtlStyle)}<link rel="stylesheet" href="/assets/site.css">${jsTag(appBundle,true)}<script src="/assets/site.js" defer></script></head>
<body><a class="skip" href="#main">تخطّ إلى المحتوى</a>${catalog(page)}
<div class="layout"><aside class="sidebar"><nav aria-label="أقسام التوثيق"><p class="sidebar-head">${icon('book')} أقسام التوثيق</p>${links}</nav></aside>
<main class="reader" id="main">${crumb}<article class="document"><div class="reader-labels"><span>${icon('globe',15)} العربية</span><span lang="en" dir="ltr">${icon('globe',15)} English</span></div>
${anchors(page.title)}${pair(page,page.title,seen,'title')}
${page.lead ? anchors(page.lead)+pair(page,page.lead,seen,'lead') : ''}
${page.standaloneFrame ? previewBlock(page,page.standaloneFrame) : ''}
${renderBlocks(page,page.blocks,seen)}
</article>
<div class="source-ref"><a href="${esc(original)}">${icon('external',16)} الصفحة الأصلية</a><span>${licensing}</span></div>
<footer class="reader-foot">المحتوى الأصلي من <a href="https://getbootstrap.com/" lang="en" dir="ltr">Bootstrap</a> والمساهمين. النص العربي ترجمة، وتخطيط القراءة مخصّص. <a href="/licenses/NOTICE.txt">إشعارات الترخيص</a></footer>
</main>${toc(page)}</div>
<div class="offcanvas offcanvas-start" tabindex="-1" id="mobile-sections" aria-labelledby="mobile-title"><div class="offcanvas-header"><h2 class="offcanvas-title h5" id="mobile-title">أقسام التوثيق</h2><button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="إغلاق"></button></div><div class="offcanvas-body"><nav class="mobile-topnav" aria-label="التنقل الرئيسي">${primaryLinks(page)}</nav><nav aria-label="أقسام التوثيق على الهاتف">${links}</nav></div></div>
${dialog}<div class="toast-region" aria-live="polite" role="status"></div><template id="sound-icons">${listen}${stop}</template></body></html>`;
}
function indexPage(page) {
  const base = localRoute(page.route);
  const titleAr = plain(page.title.ar);
  const titleEn = plain(page.title.en);
  const arabicWithMeanings = b => [plain(b.ar),...(b.inlineMeanings??[])].join(' ');
  const entries = [[base,arabicWithMeanings(page.title),titleEn,'','']];
  for (const b of segments(page)) {
    if (b === page.title) continue;
    const a = arabicWithMeanings(b), e = plain(b.en);
    if (b.type === 'heading') entries.push([base+'#'+encodeURIComponent(b.id),a,e,titleAr,titleEn]);
    else if (a.length > 12 && e.length > 12) entries.push([base+'#'+encodeURIComponent(b.id),a.slice(0,360),e.slice(0,360),titleAr,titleEn,1]);
  }
  search.set(page.version,[...(search.get(page.version)??[]),...entries]);
}
if (!pages.has(intro)) throw new Error('Default documentation page is unavailable');
fs.mkdirSync(stages,{recursive:true});
fs.cpSync('web/assets',stages+'/assets',{recursive:true});
if (fs.existsSync('web/licenses')) fs.cpSync('web/licenses',stages+'/licenses',{recursive:true});
for (const page of pages.values()) writeDemos(page);
for (const page of pages.values()) {
  writeFile(sitePath(localRoute(page.route)),renderPage(page));
  indexPage(page);
  const count = stats[page.version] ??= {complete:0,generated:0,expected:0,incomplete:[],unavailable:[]};
  count.generated++;
  if (!page.untranslated.length) count.complete++;
  else count.incomplete.push({route:page.route,segments:page.untranslated});
}
writeFile(sitePath('/'),renderPage(pages.get(intro)));
for (const [route,item] of Object.entries(scope.pages)) {
  if (pages.has(route)) {
    stats[routeVersion(route)].expected++;
    continue;
  }
  const target = item.alias ? resolve(route) : undefined;
  if (target && route !== '/') {
    const destination = localRoute(target);
    writeFile(sitePath(route),`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0; url=${esc(destination)}"><title>Bootstrap</title></head><body><a href="${esc(destination)}">انتقل إلى التوثيق</a><script>location.replace(${JSON.stringify(destination)}+location.search+location.hash)</script></body></html>`);
    continue;
  }
  if (item.http === 404) continue;
  if (item.expected || item.http === 200) {
    const version = routeVersion(route);
    const count = stats[version] ??= {complete:0,generated:0,expected:0,incomplete:[],unavailable:[]};
    count.expected++;
    count.unavailable.push({route,http:item.http ?? 0});
  }
}
for (const [version,entries] of search) writeJSON(`${stages}/search/${version==='عام'?'general':version}.json`,entries);
writeJSON(`${stages}/search/pages.json`,[...search.entries()].flatMap(([,entries])=>entries.filter(entry=>entry[3]==='')));
const rejected = Object.entries(scope.pages).filter(([,item])=>item.http===404).map(([route,item])=>({route,sources:item.sources,http:item.http}));
const expectedSections = Object.fromEntries([...pages].map(([route,page])=>[route,page.headings.map(b=>({id:b.id,level:b.level,title:plain(b.en)}))]));
writeJSON('content/sections.json',expectedSections);
writeJSON('content/coverage.json',{versions:stats,sitemaps:scope.sitemaps,rejected,upstreamFragments:[...unresolved.values()],searchEntries:[...search.values()].reduce((n,v)=>n+v.length,0)},true);
writeJSON(`${stages}/coverage.json`,Object.fromEntries(Object.entries(stats).map(([v,s])=>[v,{complete:s.complete,generated:s.generated,expected:s.expected}])),true);
console.log(`Built ${pages.size} documentation pages, with ${[...pages.values()].filter(p=>!p.untranslated.length).length} complete translation pairs.`);
