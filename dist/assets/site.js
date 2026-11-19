'use strict';

const statusRegion = document.querySelector('.toast-region');
let statusTimer;
function notify(message) {
  clearTimeout(statusTimer);
  statusRegion.textContent = message;
  statusTimer = setTimeout(() => { statusRegion.textContent = ''; }, 5200);
}

const synthesizer = window.speechSynthesis;
let availableVoices = [];
const updateVoices = () => { availableVoices = synthesizer?.getVoices() ?? []; };
updateVoices();
synthesizer?.addEventListener('voiceschanged', updateVoices);

let speakingButton;
let session = 0;
let currentUtterance;
let speechTimer;
const soundIcons = [...document.querySelector('#sound-icons').content.children];
function buttonState(button, playing) {
  const original = button.dataset.originalLabel ?? button.getAttribute('aria-label');
  button.dataset.originalLabel = original;
  const english = button.dataset.lang.startsWith('en') && !button.matches('.term-speak');
  const stop = english ? 'Stop' : 'إيقاف';
  button.setAttribute('aria-pressed', String(playing));
  button.setAttribute('aria-label', playing ? stop : original);
  button.title = playing ? stop : original;
  button.querySelector('svg')?.replaceWith(soundIcons[Number(playing)].cloneNode(true));
  const label = button.querySelector('.speak-label');
  if (label) label.textContent = playing ? stop : english ? 'Listen' : 'استمع';
}
function stopSpeech() {
  clearTimeout(speechTimer);
  session += 1;
  if (speakingButton) buttonState(speakingButton, false);
  speakingButton = undefined;
  currentUtterance = undefined;
  synthesizer?.cancel();
}

function chooseVoice(language) {
  const prefix = language.toLowerCase().split('-')[0];
  const matching = availableVoices.filter(v => v.lang.toLowerCase().split(/[-_]/)[0] === prefix);
  if (prefix === 'en') {
    const natural = matching.find(v => /Samantha|Alex|Google US English|Microsoft (Aria|Jenny|Guy)/i.test(v.name));
    if (natural) return natural;
  }
  if (prefix === 'ar') {
    const natural = matching.find(v => /Majed|Maged|Salma|Google|Tarik/i.test(v.name));
    if (natural) return natural;
  }
  return matching.find(v => v.lang.toLowerCase() === language.toLowerCase() && v.default)
    ?? matching.find(v => v.lang.toLowerCase() === language.toLowerCase())
    ?? matching.find(v => v.default) ?? matching[0];
}

function extractRuns(element, language) {
  const parts = [];
  function append(text, lang) {
    if (!text) return;
    if (parts.at(-1)?.lang === lang) parts.at(-1).text += text;
    else parts.push({text,lang});
  }
  function read(node, lang) {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent,lang);
      return;
    }
    if (!(node instanceof Element) || node.matches('button,[aria-hidden="true"],svg')) return;
    if (node.matches('br, wbr')) {
      append(' ',lang);
      return;
    }
    if (node instanceof HTMLImageElement) {
      append(' ' + node.alt + ' ',lang);
      return;
    }
    const code = node.lang.toLowerCase();
    const nextLang = code.startsWith('en') ? 'en-US' : code.startsWith('ar') ? 'ar' : lang;
    if (node.dataset.say) append(node.dataset.say,nextLang);
    else node.childNodes.forEach(child => read(child,nextLang));
  }
  read(element,language);
  return parts.map(part=>({
    lang:part.lang,
    text:part.text.replace(/\s+/g,' ').trim()
  })).filter(part=>/[\p{L}\p{N}]/u.test(part.text));
}

function voiceListReady() {
  if (availableVoices.length || !synthesizer) return Promise.resolve();
  return new Promise(resolve => {
    const complete = () => {
      clearTimeout(timer);
      synthesizer.removeEventListener('voiceschanged',complete);
      updateVoices();
      resolve();
    };
    const timer = setTimeout(complete,800);
    synthesizer.addEventListener('voiceschanged',complete,{once:true});
  });
}
async function speak(button) {
  if (speakingButton === button) {
    stopSpeech();
    return;
  }
  if (speakingButton || synthesizer?.speaking || synthesizer?.pending) stopSpeech();
  if (!synthesizer || !('SpeechSynthesisUtterance' in window)) {
    notify('الاستماع غير مدعوم في هذا المتصفح.');
    return;
  }
  const language = button.dataset.lang;
  const source = button.closest('.edition')?.querySelector('[data-speech-source]');
  const parts = button.dataset.term ? [{text:button.dataset.term,lang:language}] : source ? extractRuns(source,language) : [];
  if (!parts.length) {
    notify('لا يوجد نص يمكن قراءته في هذا المقطع.');
    return;
  }
  speakingButton = button;
  buttonState(button,true);
  const active = ++session;
  await voiceListReady();
  if (active !== session) return;

  function fail(part, error) {
    if (active !== session) return;
    stopSpeech();
    const langName = part.lang === 'ar' ? 'العربية' : 'الإنجليزية';
    const unavailable = error === 'language-unavailable' || error === 'voice-unavailable';
    notify(unavailable ? `صوت ${langName} غير متاح في هذا المتصفح.` : `تعذّر تشغيل صوت ${langName}. أعد المحاولة.`);
  }
  function next(index, retried = false) {
    if (active !== session) return;
    if (index >= parts.length) {
      buttonState(button,false);
      speakingButton = undefined;
      currentUtterance = undefined;
      return;
    }
    const part = parts[index];
    const voice = chooseVoice(part.lang);
    if (!voice && availableVoices.length) {
      fail(part,'voice-unavailable');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(part.text);
    utterance.lang = part.lang;
    if (voice) utterance.voice = voice;
    utterance.rate = part.lang === 'ar' ? 0.93 : 0.96;
    const isCurrent = () => active === session && currentUtterance === utterance;
    utterance.onstart = () => {
      if (!isCurrent()) return;
      clearTimeout(speechTimer);
      speechTimer = setTimeout(()=>fail(part),Math.max(15_000,part.text.length * 220));
    };
    utterance.onend = () => {
      if (!isCurrent()) return;
      clearTimeout(speechTimer);
      // Let the platform voice finish before submitting the next language.
      if (index + 1 === parts.length) next(index+1);
      else speechTimer = setTimeout(()=>next(index+1),80);
    };
    utterance.onerror = event => {
      if (isCurrent()) fail(part,event.error);
    };
    currentUtterance = utterance;
    speechTimer = setTimeout(()=>{
      if (!isCurrent()) return;
      if (retried) {
        fail(part);
        return;
      }
      currentUtterance = undefined;
      synthesizer.cancel();
      speechTimer = setTimeout(()=>next(index,true),150);
    },5000);
    try { synthesizer.speak(utterance); }
    catch { fail(part); }
  }
  next(0);
}

document.addEventListener('click', event => {
  const sound = event.target.closest('.speak,.term-speak');
  if (sound) {
    event.preventDefault();
    speak(sound);
  }
  const copy = event.target.closest('.copy-code');
  if (copy) copyCode(copy);
});
window.addEventListener('pagehide',stopSpeech);
window.addEventListener('hashchange',stopSpeech);
document.addEventListener('visibilitychange',()=>{
  if (document.visibilityState === 'hidden') stopSpeech();
});

async function copyCode(button) {
  const code = button.closest('.code-block').querySelector('pre code').textContent;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
    else {
      const input = document.createElement('textarea');
      input.value = code;
      input.style.cssText = 'position:fixed;inset-inline-start:-10000px';
      document.body.append(input);
      try {
        input.select();
        if (!document.execCommand('copy')) throw new Error('copy failed');
      } finally {
        input.remove();
        button.focus();
      }
    }
    const text = button.querySelector('span');
    clearTimeout(button.copyTimer);
    text.textContent = 'تم النسخ';
    button.copyTimer = setTimeout(() => { text.textContent = 'نسخ الكود'; },1800);
    notify('تم نسخ الكود.');
  } catch {
    notify('تعذّر نسخ الكود. يمكنك تحديده ونسخه يدويًا.');
  }
}

document.querySelector('#release').addEventListener('change',event=>{
  stopSpeech();
  location.href = event.target.value;
});

const toc = document.querySelector('#page-toc');
if (toc) {
  const narrow = matchMedia('(max-width: 72rem)');
  const update = () => { toc.open = !narrow.matches; };
  update();
  narrow.addEventListener('change',update);
  const markCurrent = () => {
    for (const a of toc.querySelectorAll('a')) {
      if (a.hash === location.hash) a.setAttribute('aria-current','location');
      else a.removeAttribute('aria-current');
    }
  };
  markCurrent();
  window.addEventListener('hashchange',markCurrent);
  toc.addEventListener('click',e=>{
    if (narrow.matches && e.target.closest('a')) toc.open = false;
  });
}

const dialog = document.querySelector('#search-dialog');
const form = document.querySelector('#reader-search-form');
const field = document.querySelector('#search-input');
const results = document.querySelector('#search-results');
const status = document.querySelector('#search-status');
const version = document.documentElement.dataset.version;
const indexes = new Map();
const normalize = text => text.toLocaleLowerCase().normalize('NFKC')
  .replace(/[\u064b-\u065f\u0670\u0640]/g,'')
  .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').trim();
let timeout;
let queryID = 0;

function index(name) {
  if (!indexes.has(name)) {
    const pending=fetch('/search/'+name+'.json').then(response=>{
      if (!response.ok) throw new Error('search index unavailable');
      return response.json();
    }).then(entries=>entries.map(row=>({
      url:row[0], ar:row[1], en:row[2], pageAr:row[3], pageEn:row[4], body:row[5],
      arKey:normalize(row[1]), enKey:normalize(row[2]),
      parent:normalize(row[3]+' '+row[4])
    }))).catch(error=>{ indexes.delete(name); throw error; });
    indexes.set(name,pending);
  }
  return indexes.get(name);
}

dialog.addEventListener('shown.bs.modal',()=>{
  field.focus();
  index(version).catch(()=>{});
  if (field.value) search();
});
dialog.addEventListener('hidden.bs.modal',()=>{ queryID++; });
document.addEventListener('keydown',event=>{
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    window.bootstrap?.Modal.getOrCreateInstance(dialog).show();
  }
});
form.addEventListener('submit',event=>{
  event.preventDefault();
  const first = results.querySelector('a');
  if (first) first.click();
});
field.addEventListener('input',()=>{
  clearTimeout(timeout);
  timeout = setTimeout(search,100);
});
results.addEventListener('click',event=>{
  if (event.target.closest('a')) {
    stopSpeech();
    window.bootstrap?.Modal.getOrCreateInstance(dialog).hide();
  }
});
dialog.addEventListener('keydown',event=>{
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const links = [...results.querySelectorAll('a')];
  if (!links.length) return;
  event.preventDefault();
  const i = links.indexOf(document.activeElement);
  const next = event.key === 'ArrowDown' ? Math.min(i + 1,links.length - 1) : i - 1;
  (links[next] ?? field).focus();
});

async function search() {
  const active = ++queryID;
  const value = normalize(field.value);
  results.replaceChildren();
  if (value.length < 2) {
    status.textContent = value.length ? 'أدخل حرفين على الأقل.' : '';
    return;
  }
  status.textContent = 'جارٍ البحث…';
  const words = value.split(/\s+/);
  const rank = entry => {
    if (entry.arKey === value || entry.enKey === value) return entry.body ? 21 : 0;
    if (!words.every(word=>entry.arKey.includes(word) || entry.enKey.includes(word))) return Infinity;
    if (entry.arKey.startsWith(value) || entry.enKey.startsWith(value)) return entry.body ? 22 : 3;
    if (entry.arKey.includes(value) || entry.enKey.includes(value)) return entry.body ? 24 : 6;
    return entry.body ? 28 : 11;
  };
  try {
    const collections = await Promise.all([index(version),index('general').catch(()=>[]),index('pages').catch(()=>[])]);
    if (active !== queryID) return;
    const matches = new Map();
    for (const [i,collection] of collections.entries()) {
      for (const entry of collection) {
        const score = rank(entry) + (i===2 ? 18 : i===1 ? 3 : 0);
        if (score < (matches.get(entry.url)?.score ?? Infinity)) matches.set(entry.url,{...entry,score});
      }
    }
    const next = [...matches.values()].sort((a,b)=>a.score-b.score).slice(0,18);
    status.textContent = next.length ? '' : 'لا توجد نتائج لهذا البحث.';
    for (const item of next) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = item.url;
      const ar = document.createElement('div');
      const en = document.createElement('div');
      ar.textContent = item.pageAr ? item.pageAr + ' · ' + item.ar : item.ar;
      en.textContent = item.pageEn ? item.pageEn + ' · ' + item.en : item.en;
      ar.lang = 'ar';
      ar.dir = 'rtl';
      en.lang = 'en';
      en.dir = 'ltr';
      en.className = 'search-result-english';
      a.append(ar,en);
      li.append(a);
      results.append(li);
    }
  } catch {
    if (active === queryID) status.textContent = 'تعذّر تحميل فهرس البحث.';
  }
}
