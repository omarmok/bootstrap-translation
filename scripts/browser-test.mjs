import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {installFixtures} from './test-cdn.mjs';

const base = process.env.BOOTSTRAP_READER_URL ?? 'http://127.0.0.1:4173';
const channel = process.env.BOOTSTRAP_BROWSER ?? (process.platform==='darwin' ? 'chrome' : '');
const browser = await chromium.launch({...(channel ? {channel} : {}),headless:process.env.BOOTSTRAP_HEADED !== '1'});
const context = await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
await installFixtures(context);
const screenshot = process.env.BOOTSTRAP_SCREENSHOTS;
if (screenshot) fs.mkdirSync(screenshot,{recursive:true});

async function wait(page, callback) { await page.waitForFunction(callback,{},{timeout:20_000}); }
async function ready(page, path) {
  const response = await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:40_000});
  assert.equal(response.status(),200,path);
  await wait(page,()=>typeof bootstrap==='object' && [...document.styleSheets].some(s=>s.href?.includes('bootstrap.rtl.min.css')));
}

try {
  const page = await context.newPage();
  const runtime = [];
  page.on('pageerror',err=>runtime.push(err.message));
  await ready(page,'/');
  assert.match(await page.title(),/ابدأ مع Bootstrap/);
  const alignment = await page.locator('.pair-title').evaluate(row=>{
    const [ar,en] = [...row.children].map(cell=>cell.querySelector('.text').getBoundingClientRect());
    return {arRight:ar.left>en.left,aligned:Math.abs(ar.top-en.top)<1.5};
  });
  assert.deepEqual(alignment,{arRight:true,aligned:true});
  if (screenshot) await page.screenshot({path:screenshot+'/desktop.png'});

  await page.getByRole('button',{name:'ابحث في التوثيق'}).click();
  await page.locator('#search-input').fill('CDN links');
  const englishLink = page.locator('#search-results a').filter({hasText:'CDN links'}).first();
  await englishLink.waitFor();
  assert.match(await englishLink.getAttribute('href'),/#cdn-links$/);
  await page.locator('#search-input').fill('نقاط التوقف');
  const arLink = page.locator('#search-results a').filter({hasText:'نقاط التوقف'}).first();
  await arLink.click();
  assert.match(page.url(),/layout\/breakpoints\//);
  assert.deepEqual(await page.locator('#release option').allTextContents(),['5.3.8']);
  console.log('Desktop alignment, Arabic and English search, section links, and the single 5.3.8 release passed.');

  await ready(page,'/');
  const code = page.locator('.code-block').first();
  const text = await code.locator('pre code').textContent();
  await code.locator('.copy-code').click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),text);
  assert.equal(await code.locator('.copy-code span').textContent(),'تم النسخ');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  const mobile = await page.locator('.pair-title').evaluate(row=>{
    const [ar,en] = [...row.children].map(cell=>cell.getBoundingClientRect());
    return {arabicFirst:ar.bottom<=en.top+1,fullWidth:Math.abs(ar.width-en.width)<1,scrollableBody:document.documentElement.scrollWidth>innerWidth};
  });
  assert.deepEqual(mobile,{arabicFirst:true,fullWidth:true,scrollableBody:false});
  assert(await page.locator('.table-wrap').first().evaluate(table=>table.scrollWidth>table.clientWidth));
  if (screenshot) await page.screenshot({path:screenshot+'/mobile.png'});
  await page.getByRole('button',{name:'أقسام التوثيق',exact:true}).click();
  await page.locator('#mobile-sections.show').waitFor();
  console.log('Clipboard, mobile stacking, horizontal overflow, and mobile navigation passed.');

  await page.setViewportSize({width:1440,height:1000});
  await ready(page,'/docs/5.3/components/collapse/');
  const preview = page.locator('figure.preview').first();
  await preview.scrollIntoViewIfNeeded();
  const frame = preview.frameLocator('iframe');
  await frame.locator('body').waitFor();
  await frame.locator('body').evaluate(node=>new Promise((resolve,reject)=>{
    const begin=Date.now();
    const check=()=>{
      if (node.ownerDocument.defaultView.bootstrap?.Collapse) resolve();
      else if (Date.now()-begin>15_000) reject(new Error('Bootstrap Collapse failed to load'));
      else setTimeout(check,75);
    };
    check();
  }));
  const trigger = frame.locator('[data-bs-toggle="collapse"]').first();
  await trigger.click({timeout:20_000});
  await frame.locator('.collapse.show').first().waitFor();
  await trigger.click();
  await frame.locator('.collapse.show').first().waitFor({state:'hidden'});

  await ready(page,'/docs/5.3/components/tooltips/');
  const tooltipPreview = page.locator('figure.preview').filter({has:page.locator('iframe')});
  const item = await tooltipPreview.evaluateAll(frames=>frames.map(f=>f.querySelector('iframe').src));
  let hoverTested = false;
  for (const src of item.slice(0,12)) {
    const matching = page.locator(`iframe[src="${new URL(src).pathname}"]`);
    await matching.scrollIntoViewIfNeeded();
    const frame = matching.contentFrame();
    const control = frame.locator('[data-bs-toggle="tooltip"]').first();
    await frame.locator('body').waitFor();
    if (!await control.count()) continue;
    await control.evaluate(node=>new Promise((resolve,reject)=>{
      const begin=Date.now();
      const check=()=>{
        if (node.ownerDocument.defaultView.bootstrap?.Tooltip?.getInstance(node)) resolve();
        else if (Date.now()-begin>15_000) reject(new Error('Bootstrap Tooltip failed to initialize'));
        else setTimeout(check,75);
      };
      check();
    }));
    await control.hover();
    await frame.getByRole('tooltip').first().waitFor();
    hoverTested = true;
    break;
  }
  assert.equal(hoverTested,true);
  console.log('Isolated Bootstrap 5.3 Collapse and Tooltip interactions passed.');
  assert.deepEqual(runtime,[]);

  const speech = await browser.newContext({viewport:{width:1440,height:900}});
  await installFixtures(speech);
  await speech.addInitScript(()=>{
    class Synth extends EventTarget {
      constructor() { super(); this.voices=[]; this.log=[]; this.current=null; }
      get pending() { return false; }
      get speaking() { return !!this.current; }
      getVoices() { return this.voices; }
      setVoices(voices) { this.voices=voices; this.dispatchEvent(new Event('voiceschanged')); }
      cancel() { this.log.push({cancel:true}); this.current=null; }
      speak(utterance) { this.current=utterance; this.log.push({lang:utterance.lang,text:utterance.text,voice:utterance.voice?.name}); utterance.onstart?.(); }
      finish() { const current=this.current; this.current=null; current?.onend?.(); }
      fail(error) { const current=this.current; this.current=null; current?.onerror?.({error}); }
    }
    class Utterance {
      constructor(text) { this.text=text; }
    }
    window.__speech = new Synth();
    Object.defineProperty(window,'speechSynthesis',{value:window.__speech});
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance});
  });
  const audio = await speech.newPage();
  await ready(audio,'/');
  const mixed = audio.locator('#quick-start--paragraph-1 > [lang=ar] > .speak');
  await mixed.click();
  assert.equal(await mixed.getAttribute('aria-pressed'),'true');
  await audio.evaluate(()=>window.__speech.setVoices([{name:'Majed',lang:'ar-001'},{name:'Samantha',lang:'en-US'}]));
  await wait(audio,()=>window.__speech.log.some(v=>v.lang==='ar'));
  const runs = await audio.evaluate(async()=>{
    for(let i=0;i<30;i++) {
      window.__speech.finish();
      if (!document.querySelector('.speak[aria-pressed="true"]')) break;
      await new Promise(resolve=>setTimeout(resolve,95));
    }
    return window.__speech.log.filter(v=>v.lang);
  });
  assert.equal(runs[0].lang,'ar');
  for (const pronunciation of ['C S S','JavaScript','C D N']) assert(runs.some(run=>run.lang==='en-US' && run.text.includes(pronunciation)));
  assert.equal(runs.find(run=>run.lang==='ar').voice,'Majed');
  assert.equal(runs.find(run=>run.lang==='en-US').voice,'Samantha');
  assert.equal(await mixed.getAttribute('aria-pressed'),'false');
  const english = audio.locator('#quick-start--paragraph-1 > [lang=en] > .speak');
  await english.focus();
  await audio.keyboard.press('Enter');
  await wait(audio,()=>window.__speech.current?.lang==='en-US');
  assert.equal(await english.getAttribute('aria-label'),'Stop');
  await mixed.click();
  assert.equal(await english.getAttribute('aria-pressed'),'false');
  await wait(audio,()=>window.__speech.current?.lang==='ar');
  await mixed.click();
  assert.equal(await mixed.getAttribute('aria-pressed'),'false');
  assert.equal(await audio.evaluate(()=>window.__speech.speaking),false);

  const acronym = audio.locator('[data-term="C S S"]').first();
  await acronym.focus();
  await acronym.locator('.term-hint').waitFor();
  assert.match(await acronym.locator('.term-hint').textContent(),/سي إس إس/);
  await acronym.click();
  await wait(audio,()=>window.__speech.current?.text==='C S S');
  await audio.evaluate(()=>window.__speech.fail('synthesis-failed'));
  assert.match(await audio.locator('.toast-region').textContent(),/تعذّر تشغيل صوت الإنجليزية/);

  await ready(audio,'/docs/5.3/components/tooltips/');
  await audio.evaluate(()=>window.__speech.setVoices([{name:'Majed',lang:'ar-001'},{name:'Samantha',lang:'en-US'}]));
  const tooltip = audio.locator('[data-term="Tooltip"]').first();
  await tooltip.click();
  await wait(audio,()=>window.__speech.current?.text==='Tooltip');
  await audio.evaluate(()=>window.__speech.finish());
  assert.equal(await tooltip.getAttribute('aria-pressed'),'false');

  await ready(audio,'/docs/5.3/utilities/flex/');
  await audio.evaluate(()=>window.__speech.setVoices([{name:'Samantha',lang:'en-US'}]));
  const className = audio.locator('[data-term="D flex"]').first();
  await className.click();
  await wait(audio,()=>window.__speech.current?.text==='D flex');
  await audio.evaluate(()=>{ location.hash='#enable-flex-behaviors'; });
  await wait(audio,()=>!window.__speech.speaking);
  assert.equal(await className.getAttribute('aria-pressed'),'false');
  console.log('Speech queue tests passed for both languages, delayed voices, mixed narration, a term, an acronym, a CSS class, switching, stopping, navigation, and errors.');
  await speech.close();
} finally {
  await browser.close();
}
