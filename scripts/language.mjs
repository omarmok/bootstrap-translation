import { load } from 'cheerio';
import { esc, clean, readJSON } from './common.mjs';
import { meaningKey, meaningNames, meaningText } from './meanings.mjs';

export const glossary = readJSON('content/glossary.json', {});
export const reviewed = readJSON('content/reviewed.json', {});
const names = Object.keys(glossary).filter(name => name !== 'Quick start').sort((a,b)=>b.length-a.length);
const quote = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const terms = new RegExp('(?<![A-Za-z0-9_-])(?:'+names.map(quote).join('|')+')(?![A-Za-z0-9_-])','ig');
const literal = new Map(names.map(name => [name.toLowerCase(),name]));
const marker = i => String(8765301 + i);
const isWord = /[A-Za-z]{2,}/;
export const arabic = /[\u0621-\u064a]/;
const asciiDigits = s => s.replace(/[٠-٩۰-۹]/g,ch=>String(ch.charCodeAt(0)-(ch <= '٩' ? 1632 : 1776)));
const parser = h => load(h,{},false);
const protectedCode = new Set(['code','kbd','samp','var','img']);
const comparable = s => s.replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();
const identifiers = /^(?:https?:\/\/\S+|[.#@][A-Za-z0-9_-]+(?:[.:][\w-]+)*(?:\s+[.#@][A-Za-z0-9_-]+(?:[.:][\w-]+)*)*|[\w]+(?:[-_.][\w-]+)+|[\d.]+(?:px|rem|em|vh|ms)|[A-Z\d]{2,7}|[a-z]+(?:[A-Z][a-z0-9]+)+|glyphicon(?: glyphicon-[a-z0-9-]+)?|[^a-z]*\d[^a-z]*)$/;
const lorem = /^(?:@username\s+)?(?:Lorem ipsum|Duis mollis|Cras justo odio|Praesent commodo cursus|Maecenas sed diam|Donec id elit non mi|Nulla vitae elit libero|Donec ullamcorper nulla|Etiam porta sem malesuada|Eget lacinia odio|Fusce dapibus, tellus|ipsum|consectetur|adipiscing|odio|cursus|dapibus|nibh|elementum|eget|sociosqu|conubia|inceptos|ligula)(?:[., ]|$)/i;
export const needsTranslation = text => isWord.test(text) && !identifiers.test(text) && !lorem.test(text);
const hintLetters = 'إيه|بي|سي|دي|إي|إف|جي|إتش|آي|جاي|كاي|إل|إم|إن|أو|بي|كيو|آر|إس|تي|يو|في|دبليو|إكس|واي|زد'.split('|');
const hintParts = {
  flex:'فليكس', inline:'إنلاين', block:'بلوك', none:'نَن', grid:'غريد', row:'رو', col:'كول',
  border:'بوردر', radius:'ريديوس', primary:'برايمري', secondary:'سيكندري', success:'سكسِس',
  warning:'وورنِنغ', danger:'دينجر', light:'لايت', dark:'دارك', button:'بَتَن', btn:'بي تي إن',
  dropdown:'دروب داون', modal:'مودال', tooltip:'تول تِب', popover:'بوب أوفر', close:'كلوز',
  hover:'هوفر', active:'أكتِف', disabled:'دِسيبْلْد', toggle:'توغُل', target:'تارغِت',
  data:'داتا', hide:'هايد', show:'شو', start:'ستارت', end:'إند', center:'سِنتر',
  top:'توب', bottom:'بوتَم', left:'ليفت', right:'رايت', table:'تيبُل', display:'دِسبلاي',
  background:'باك غراوند', color:'كَلَر', padding:'بادِنغ', margin:'مارجِن', auto:'أوتو',
  text:'تكست', position:'بَزيشن', relative:'ريلاتِف', absolute:'أبسولوت', fixed:'فِكست',
  sticky:'ستِكي', overflow:'أوفر فلو', hidden:'هِدِن', visible:'فِزِبُل', container:'كونتينر',
  fluid:'فلويد', gutter:'غَتر', rounded:'راوندِد', shadow:'شادُو', bs:'بي إس', size:'سايز'
};
function termInfo(word, infer) {
  const name = literal.get(word.toLowerCase());
  if (name) return [name,...glossary[name]];
  const cleaned = word.replace(/^[.#$]+/,'').replace(/\(\)$/,'');
  if (!infer || !/^[a-zA-Z][\w-]{0,34}$/.test(cleaned)) return;
  const bits = cleaned.replace(/([a-z])([A-Z])/g,'$1-$2').split(/[-_]+/).filter(Boolean);
  if (!bits.length || bits.some(bit=>!hintParts[bit.toLowerCase()] && !/^[a-z]{1,3}$|^\d+$/i.test(bit))) return;
  const say = bits.map(bit=>bit.length === 1 || /^[A-Z]{2,4}$/.test(bit) || /^(?:btn|bs)$/i.test(bit) ? [...bit.toUpperCase()].join(' ') : bit).join(' ');
  const hint = bits.map(bit=>hintParts[bit.toLowerCase()] ?? (/^\d+$/.test(bit) ? bit : [...bit.toLowerCase()].map(c=>hintLetters[c.charCodeAt(0)-97]).join(' '))).join(' ');
  return [cleaned,say,hint];
}

function makePlan(html) {
  const $ = parser(html);
  const protectedNodes = [];
  const push = node => {
    protectedNodes.push(node);
    return marker(protectedNodes.length - 1);
  };
  function visit(node) {
    if (node.type === 'text') return node.data.replace(terms,hit=>push({text:hit,kind:'term'}));
    if (!node.name) return '';
    if (node.name === 'br') return ' ';
    if (protectedCode.has(node.name)) return push({kind:'literal',html:$.html(node)});
    if (node.name === 'a') return push({kind:'link',html:$(node).html(),href:$(node).attr('href')});
    return (node.children ?? []).map(visit).join('');
  }
  const input = comparable($.root().contents().get().map(visit).join(''));
  return {input,protectedNodes,original:clean($.root().text())};
}
function sentenceParts(s) {
  if (s.length <= 560) return [s];
  return [...new Intl.Segmenter('en',{granularity:'sentence'}).segment(s)].map(x=>x.segment.trim()).filter(Boolean).flatMap(s=> {
    const chunks = s.match(/.{1,500}(?:\s|$)|\S+/g);
    return (chunks ?? [s]).map(x=>x.trim());
  });
}
function translationInputs(input) {
  return sentenceParts(input).filter(needsTranslation);
}
function markerSet(value) {
  return [...asciiDigits(value).matchAll(/8765\s*3\s*\d\s*\d/g)].map(m=>m[0].replace(/\s/g,'')).sort().join('|');
}
export function requests(html, output, translated = {}) {
  if (!html || Object.hasOwn(reviewed,html)) return;
  const plan = makePlan(html);
  for (const key of translationInputs(plan.input)) {
    if (!translated[key]) output.add(key);
    else if (!validTranslation(key,translated[key]) && markerSet(key)) {
      for (const part of key.split(/(87653\d{2})/).map(clean).filter(needsTranslation)) if (!translated[part]) output.add(part);
    }
  }
  for (const node of plan.protectedNodes) if (node.kind === 'link') requests(node.html,output,translated);
}
export function validTranslation(source,dest) {
  if (typeof dest !== 'string' || !dest.trim()) return false;
  return (arabic.test(dest) || !needsTranslation(source)) && markerSet(source) === markerSet(dest);
}
function fallback(input, translated) {
  return input.split(/(87653\d{2})/).map(s=>{
    const text=clean(s);
    if (!needsTranslation(text)) return s;
    const result = translated[text];
    return validTranslation(text,result) ? s.replace(text,result) : s;
  }).join('');
}
export function translate(html, translations) {
  if (!html) return '';
  if (Object.hasOwn(reviewed,html)) return reviewed[html];
  const plan = makePlan(html);
  if (!plan.protectedNodes.length && !needsTranslation(plan.input)) return html;
  const output = sentenceParts(plan.input).map(s => {
    if (!needsTranslation(s)) return s;
    const direct = translations[s];
    return validTranslation(s,direct) ? direct : fallback(s,translations);
  }).join(' ');
  return esc(asciiDigits(output)).replace(/8765\s*3\s*\d\s*\d/g, m => {
    const node = plan.protectedNodes[Number(m.replace(/\s/g,'')) - 8765301];
    if (!node) return m;
    if (node.kind === 'literal') return node.html;
    if (node.kind === 'term') return esc(node.text);
    return `<a href="${esc(node.href)}">${translate(node.html,translations)}</a>`;
  }).replace(/ +([،؛؟.!])/g,'$1');
}
export function eligibleHTML(html) {
  return !!html && !needsTranslation(makePlan(html).input);
}
export function decorateArabic(html, seen, icon, { key: headingKey, meanings } = {}) {
  const $ = parser(html);
  let linkButtons;
  function termHTML(text, info) {
    const [key,say,hint] = info;
    const english = `<bdi lang="en" dir="ltr" data-say="${esc(say)}">${esc(text)}</bdi>`;
    if (seen.has(key.toLowerCase())) return english;
    seen.add(key.toLowerCase());
    const button = `<button type="button" class="term-speak" aria-label="نطق ${esc(key)} بالإنجليزية، ${esc(hint)}" data-lang="en-US" data-term="${esc(say)}">${icon}<span class="term-hint" aria-hidden="true">${esc(hint)}</span></button>`;
    if (linkButtons) {
      linkButtons.push(button);
      return english;
    }
    return `<span class="term">${english}${button}</span>`;
  }
  function renderNames(text) {
    let out = '', i = 0;
    for (const hit of text.matchAll(terms)) {
      out += wrapEnglish(text.slice(i,hit.index)) + termHTML(hit[0],termInfo(hit[0]));
      i = hit.index + hit[0].length;
    }
    return out + wrapEnglish(text.slice(i));
  }
  function meaningHTML(key, existingParentheses = false) {
    const explanation = meaningText(key);
    const mark = 'meaning:' + key;
    if (!explanation || seen.has(mark) || (headingKey && headingKey !== key)) return '';
    seen.add(mark);
    meanings?.push(explanation);
    const contents = wrapEnglish(explanation);
    return `<span class="term-meaning" lang="ar" dir="rtl" data-meaning-key="${esc(key)}">${existingParentheses ? '، ' + contents : ' (' + contents + ')'}</span>`;
  }
  function renderText(text) {
    if (/^\s*(?:https?:\/\/|[.\/]+[\w.-]+\/)/i.test(text)) return renderNames(text);
    let out = '', i = 0;
    for (const hit of text.matchAll(meaningNames)) {
      const start = hit.index;
      const end = start + hit[0].length;
      const key = meaningKey(hit[0]);
      const nextName = /^\s*\(([A-Za-z][^()]*)\)/u.exec(text.slice(end))?.[1];
      const note = nextName && meaningKey(nextName) === key ? '' : meaningHTML(key,text[start-1]==='(' && text[end]===')');
      out += renderNames(text.slice(i,start)) + renderNames(hit[0]) + note;
      i = end;
    }
    return out + renderNames(text.slice(i));
  }
  function visit(node) {
    if (node.type === 'text') return renderText(node.data);
    if (!node.name) return '';
    if (node.name === 'img' || node.name === 'br' || node.name === 'wbr') return $.html(node);
    const value = $(node).text();
    if (protectedCode.has(node.name) && /[A-Za-z]/.test(value)) {
      const info = termInfo(value,true);
      const label = value.replace(/^[.#$]+/u,'').replace(/\(\)$/u,'')
        .replace(/^<\/?([\w-]+)>$/iu,'$1').replace(/^([\w-]+)=["'][^"']*["']$/u,'$1');
      const key = meaningKey(label);
      const code = `<${node.name} lang="en" dir="ltr">${info ? termHTML(value,info) : esc(value)}</${node.name}>`;
      return code + meaningHTML(key);

    }
    if (node.name === 'a' && $(node).attr('href')) {
      linkButtons = [];
      const inner = (node.children ?? []).map(visit).join('');
      const buttons = linkButtons.join('');
      linkButtons = undefined;
      return `<a href="${esc($(node).attr('href'))}">${inner}</a>${buttons}`;
    }
    const inner = (node.children ?? []).map(visit).join('');
    return `<${node.name}>${inner}</${node.name}>`;
  }
  const rendered = $.root().contents().get().map(visit).join('');
  return rendered + (headingKey ? meaningHTML(headingKey) : '');
}

function wrapEnglish(text) {
  return esc(text).replace(/[A-Za-z][A-Za-z\d_./+#-]*(?:[ \t]+[A-Za-z][A-Za-z\d_./+#-]*)*/g,s=>`<bdi lang="en" dir="ltr">${s}</bdi>`);
}

export function* segments(page) {
  yield page.title;
  if (page.lead) yield page.lead;
  function* walk(blocks) {
    for (const b of blocks) {
      if (b.en) yield b;
      if (b.body) yield* walk(b.body);
      if (b.items) for (const item of b.items) yield* walk(item.body);
      if (b.caption) yield* walk(b.caption);
      if (b.rows) for (const row of b.rows) for (const cell of row.cells) yield* walk(cell.body);
    }
  }
  yield* walk(page.blocks);
}
