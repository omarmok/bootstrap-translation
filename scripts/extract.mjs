import fs from 'node:fs';
import { load } from 'cheerio';
import { origin, hash, clean, esc, routeVersion, cacheFile, dataFile, readJSON, writeJSON, writeFile } from './common.mjs';

const scope = readJSON('content/scope.json', {pages:{}});
const inline = new Set(['a','abbr','b','br','cite','code','del','em','i','kbd','mark','s','samp','small','span','strong','sub','sup','time','u','var','wbr']);
const ignored = new Set(['script','style','noscript','template','input','hr','svg','source','link','nav','footer','aside']);
const examples = '.bd-example,.bs-example,.bs-docs-example,.bootstrap-example,.example-preview,.live-example,.example';
const skipped = '.anchor-link,.visually-hidden,.sr-only,.btn-clipboard,[data-bs-toggle="modal"][data-bs-target="#bdSearchDialog"],.bd-code-snippet .btn,.example-snippet,.bd-clipboard,.bd-edit-link,.carbonads,.bd-callout-ad,.text-hide';
const sections = /^h[1-6]$/;
const groups = /^(?:ul|ol|dl|table|blockquote|figure|details|section|div|article|main|header|form|fieldset)$/;
const slug = text => clean(text).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff -]/g,'').replace(/\s+/g,'-').slice(0,80);
const plain = ($, nodes) => clean(nodes.map(node => node.type === 'text' ? node.data : $(node).text()).join(''));
const hasText = text => /[\p{L}\p{N}]/u.test(text);

export function extract(route, html) {
  const $ = load(html);
  const ids = new Set();
  const pending = new Set();
  const counters = new Map();
  const blocks = [];
  const demos = [];
  let active = 'page';
  const base = origin + route;
  const parser = load('',{},false);

  function anchor(id) {
    if (!id || ids.has(id)) return;
    ids.add(id);
    return id;
  }

  function useId(node, kind, value = '') {
    const explicit = node?.attribs?.id || node?.attribs?.name;
    if (explicit && !ids.has(explicit)) return anchor(explicit);
    if (kind === 'heading') {
      const key = slug(value);
      if (key && !ids.has(key)) return anchor(key);
    }
    const key = active + '--' + kind;
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key,next);
    return anchor(key + '-' + next);
  }

  function emit(target, block) {
    if (pending.size) {
      block.anchors = [...pending].filter(id => id !== block.id && !ids.has(id));
      block.anchors.forEach(anchor);
      pending.clear();
    }
    target.push(block);
  }

  function url(value, media = false) {
    if (!value) return '';
    try {
      const target = new URL(value,base);
      if (!['http:','https:','mailto:','tel:'].includes(target.protocol)) return '';
      if (media && target.hostname === 'getbootstrap.com') target.protocol = 'https:';
      return value.startsWith('#') && !media ? value : target.href;
    } catch { return ''; }
  }

  function inlineHTML(nodes) {
    return nodes.map(node => {
      if (node.type === 'text') return esc(node.data);
      const element = $(node);
      if (!node.name || ignored.has(node.name) || element.is(skipped)) return '';
      if (node.name === 'img') {
        const src = url(element.attr('src'),true);
        return src ? `<img src="${esc(src)}" alt="${esc(element.attr('alt'))}" loading="lazy">` : '';
      }
      const contents = inlineHTML(node.children ?? []);
      if (!inline.has(node.name)) return contents;
      if (node.name === 'br' || node.name === 'wbr') return `<${node.name}>`;
      const id = element.attr('id') || element.attr('name');
      if (id && !ids.has(id)) pending.add(id);
      if (node.name === 'a') {
        const href = url(element.attr('href'));
        return href ? `<a href="${esc(href)}">${contents}</a>` : contents;
      }
      if (node.name === 'span') return contents;
      const title = node.name === 'abbr' && element.attr('title') ? ` title="${esc(element.attr('title'))}"` : '';
      return `<${node.name}${title}>${contents}</${node.name}>`;
    }).join('').trim();
  }

  function segment(target,node,kind,children,flags = {}) {
    const en = inlineHTML(children);
    const value = clean(parser.load(en,{},false).root().text());
    if (!hasText(value) && !en.includes('<img')) return;
    if (!hasText(value)) {
      emit(target,{id:useId(node,'media'),type:'media',html:en});
      return;
    }
    const id = useId(node,kind,value);
    if (kind === 'heading') active = id;
    emit(target,{id,type:kind,en,...flags});
  }

  function code(target,node) {
    const element = $(node);
    const pre = node.name === 'pre' ? element : element.find('pre').first();
    const content = pre.find('code').first();
    const value = (content.length ? content : pre).text().replace(/^\n|\s+$/g,'');
    if (!value) return;
    const lang = /(?:language|lang)-([\w+-]+)/.exec((content.attr('class') ?? '')+' '+(pre.attr('class') ?? ''))?.[1] ?? pre.attr('data-lang') ?? '';
    emit(target,{id:useId(node,'code'),type:'code',value,language:lang});
  }

  function preview(target,node) {
    const element = $(node).clone();
    element.find('script[src], style, button.btn-clipboard, hr, .bd-clipboard, .anchor-link').remove();
    element.find('[src],[href],[poster]').each((_, asset) => {
      for (const attr of ['src','href','poster']) {
        const value = $(asset).attr(attr);
        if (value && !value.startsWith('#')) $(asset).attr(attr,url(value,true));
      }
    });
    const id = useId(node,'example');
    for (const n of [node,...$(node).find('[id]').get()]) {
      const a = n.attribs?.id;
      if (a && a !== id && !ids.has(a)) pending.add(a);
    }
    emit(target,{id,type:'demo',key:hash(route + ':' + id),height:estimateDemo(element, $)});
    demos.push({key:hash(route + ':' + id),html:element.html() ?? '',attrs:node.attribs ?? {}});
  }

  function table(target,node) {
    const groups = [];
    const rows = $(node).children().toArray().flatMap(part => part.name === 'tr' ? [part] : /^(?:thead|tbody|tfoot)$/.test(part.name) ? $(part).children('tr').get() : []);
    for (const row of rows) {
      const cells = [];
      for (const cell of $(row).children('td,th').get()) {
        const body = [];
        const attrs = $(cell).attr();
        walk(cell.children,body);
        cells.push({type:cell.name,span:attrs.colspan,rowspan:attrs.rowspan,scope:attrs.scope,body});
      }
      if (cells.length) groups.push({head:row.parent?.name === 'thead',cells});
    }
    const caption = [];
    const cap = $(node).children('caption').get(0);
    if (cap) segment(caption,cap,'caption',cap.children);
    if (groups.length) emit(target,{id:useId(node,'table'),type:'table',caption,rows:groups});
  }

  function list(target,node) {
    const items = [];
    for (const child of $(node).children('li,dt,dd').get()) {
      const body = [];
      if (child.attribs?.id) pending.add(child.attribs.id);
      walk(child.children,body,'item');
      if (body.length) items.push({tag:child.name,body});
    }
    if (items.length) emit(target,{id:useId(node,'list'),type:'list',tag:node.name,start:node.attribs?.start,items});
  }

  function walk(nodes,target,kind = 'paragraph') {
    let run = [];
    const flush = () => {
      if (run.length) segment(target,null,kind,run);
      run = [];
    };
    for (const node of nodes ?? []) {
      if (node.type === 'text' || inline.has(node.name) || node.name === 'img') {
        run.push(node);
        continue;
      }
      if (!node.name || $(node).is(skipped) || ignored.has(node.name)) continue;
      flush();
      const el = $(node);
      const parentIsExample = el.is(examples);
      if (sections.test(node.name)) {
        segment(target,node,'heading',node.children,{level:Number(node.name[1])});
      } else if (el.is('pre,.bd-code-snippet,.highlight,.code-toolbar') && (node.name === 'pre' || el.find('pre').length)) {
        el.children(examples).each((_,child) => preview(target,child));
        for (const child of (node.name === 'pre' ? [node] : el.find('pre').get())) code(target,child);
      } else if (parentIsExample || el.is('iframe')) {
        if (el.is('iframe')) {
          const src = url(el.attr('src'),true);
          if (src) emit(target,{id:useId(node,'example'),type:'frame',src,height:Math.min(Number(el.attr('height')) || 380,750)});
        } else {
          preview(target,node);
        }
      } else if (node.name === 'ul' || node.name === 'ol' || node.name === 'dl') {
        list(target,node);
      } else if (node.name === 'table') {
        table(target,node);
      } else if (node.name === 'p' || node.name === 'button' || node.name === 'figcaption' || node.name === 'summary') {
        segment(target,node,node.name === 'p' ? kind : 'caption',node.children);
      } else if (el.is('.bd-callout,.bs-callout,blockquote,.alert,[role="alert"]')) {
        const id = useId(node,'note');
        const body = [];
        walk(node.children,body,'note-text');
        if (body.length) emit(target,{id,type:'note',tone:el.is('.bd-callout-warning,.bs-callout-warning,.alert-warning') ? 'warning' : el.is('.bd-callout-danger,.bs-callout-danger,.alert-danger') ? 'danger' : 'info',body});
      } else if (groups.test(node.name) || node.children?.length) {
        const id = el.attr('id') || el.attr('name');
        if (id && !ids.has(id)) pending.add(id);
        walk(node.children,target,kind);
      }
    }
    flush();
  }

  const version = routeVersion(route);
  const standalone = /\/examples\/[^/]+/.test(route) && !$('.bd-content,.bs-docs-container').length;
  const modern = $('.bd-main > .bd-content').first();
  const masthead = $('body > .bd-masthead').first();
  if (modern.length) {
    walk($('.bd-intro').first().find('h1,.bd-lead,.bd-subtitle').get(),blocks);
    walk(modern.contents().get(),blocks);
  } else if ($('main.bd-content').length) {
    walk($('body > header').not('.navbar').find('h1,.bd-lead,.bd-subtitle').get(),blocks);
    walk($('main.bd-content').first().contents().get(),blocks);
  } else if (masthead.length) {
    walk(masthead.contents().get(),blocks);
    walk(masthead.nextAll('main,.container,.container-xxl,.bd-content').get(),blocks);
  } else if ($('.bs-docs-container [role="main"]').length) {
    walk($('.bs-docs-header').first().find('h1,p').get(),blocks);
    walk($('.bs-docs-container [role="main"]').first().contents().get(),blocks);
  } else if ($('.bs-docs-masthead').length) {
    walk($('.bs-docs-masthead,.bs-docs-featurette').get(),blocks);
  } else if (/^[12]\./.test(version) && !standalone) {
    walk($('body').children().not('.navbar,.topbar,.bs-docs-social,footer,script').get(),blocks);
  } else if ($('main').length && !standalone) {
    walk($('main').get(),blocks);
  } else {
    walk($('body').children().not('header.navbar,footer,.navbar,script').get(),blocks);
  }
  const rawTitle = clean($('h1').first().clone().find(skipped).remove().end().text()) || clean($('title').first().text().split(' · ')[0]);
  if (!blocks.length && rawTitle) {
    const id = anchor('overview');
    blocks.push({id,type:'heading',level:1,en:esc(rawTitle)});
  }
  const title = blocks.find(b => b.type === 'heading' && b.level === 1);
  if (title) blocks.splice(blocks.indexOf(title),1);
  const heading = title ?? {id:anchor('overview') ?? useId(null,'heading',rawTitle),type:'heading',level:1,en:esc(rawTitle)};
  const lead = blocks[0]?.type === 'paragraph' ? blocks.shift() : undefined;
  const nav = [];
  const navGroup = /(?:bd-links-heading|bd-links-link|bd-sidenav|bs-docs-sidenav|^nav-link$)/;
  $('.bd-sidebar a[href],.bs-docs-sidenav a[href],.navbar .nav a[href]').each((_,node)=>{
    const a = $(node);
    if ((a.closest('.bd-sidebar,.bs-docs-sidenav').length || navGroup.test(a.attr('class') ?? '') || /^[12]\./.test(version)) && a.text().trim()) nav.push({en:clean(a.text()),href:url(a.attr('href'))});
  });
  const publishedAssets = $('link[rel="stylesheet"][integrity],script[src][integrity]').map((_,node) => ({
    url:$(node).attr('src') ?? $(node).attr('href'),
    integrity:$(node).attr('integrity')
  })).get();
  const sourceStyles = $('link[rel="stylesheet"][href]').map((_,node)=>url($(node).attr('href'),true)).get().filter(Boolean);
  const sourceScripts = $('script[src]').map((_,node)=>url($(node).attr('src'),true)).get().filter(Boolean);
  const symbols = new Map($('symbol[id]').map((_,node)=>[[$(node).attr('id'),$(node).toString()]]).get());
  for (const demo of demos) {
    const used = new Set([...demo.html.matchAll(/<use[^>]+href="#([^"]+)"/gi)].map(hit=>hit[1]));
    demo.sprite = [...used].map(id=>symbols.get(id)??'').join('');
  }
  const embed = standalone ? {headStyles:$('head style').map((_,node)=>$(node).toString()).get().join(''),body:$('body').html(),classes:$('body').attr('class')??'',dir:$('html').attr('dir')??'ltr'} : undefined;
  const renderedVersion = [...sourceStyles,...sourceScripts].map(src=>/\/docs\/(\d+\.\d+)\//.exec(src)?.[1]).find(Boolean) ?? version;
  return {route, version, renderedVersion, title:heading, lead, blocks, demos, nav, standalone, embed, publishedAssets, sourceScripts, sourceStyles};
}

function estimateDemo(element, $) {
  const direct = element.children().length;
  if (element.find('.carousel,.card-img-top,.ratio,svg[height="250"],form').length || direct > 4) return 300;
  if (element.find('.modal.show,.table,.accordion,.list-group').length) return 260;
  return 120 + Math.min(direct,4) * 27;
}

const prefix = process.argv.slice(2);
let count = 0;
for (const [route,item] of Object.entries(scope.pages)) {
  if (item.http !== 200 || item.alias || (prefix.length && !prefix.some(part => route.startsWith(part)))) continue;
  const file = cacheFile(route);
  if (!fs.existsSync(file)) continue;
  const data = extract(route,fs.readFileSync(file,'utf8'));
  if (!data.title.en || !data.blocks.length && !data.lead && !data.standalone) {
    console.warn('Empty extraction:',route);
    continue;
  }
  writeJSON(dataFile(route),data);
  count++;
}
console.log(`Structured ${count} pages.`);
