import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium} from 'playwright';
import {installFixtures} from './test-cdn.mjs';

const origin = process.env.BOOTSTRAP_READER_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({channel:process.env.BOOTSTRAP_BROWSER ?? 'chrome',headless:false});
const events = [];
let sequence = 0;

async function waitFor(check, description, timeout = 12_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await pause(80);
  }
  throw new Error(description + ' timed out. Events: ' + JSON.stringify(events));
}

try {
  const context = await browser.newContext();
  await installFixtures(context);
  const page = await context.newPage();
  await page.exposeFunction('recordNativeReaderSpeech',event=>{events.push(event);});
  async function open(path) {
    await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:30_000});
    await waitFor(()=>page.evaluate(()=>['ar','en'].every(lang=>speechSynthesis.getVoices().some(voice=>voice.lang.startsWith(lang)))),'Native browser voices');
    await page.evaluate(()=>{
      const play = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = utterance=>{
        const step = window.readerSpeechTestStep;
        for (const kind of ['start','end','error']) {
          const original=utterance['on'+kind];
          utterance['on'+kind]=event=>{
            window.recordNativeReaderSpeech({step,kind,lang:utterance.lang,text:utterance.text,voice:utterance.voice?.name,error:event.error});
            original?.call(utterance,event);
          };
        }
        play(utterance);
      };
    });
  }
  const finished = async button => {
    await waitFor(()=>page.evaluate(()=>!speechSynthesis.speaking && !speechSynthesis.pending),'Native queue idle');
    const step = ++sequence;
    await page.evaluate(value=>{ window.readerSpeechTestStep=value; },step);
    const current = () => events.filter(e=>e.step===step);
    await button.click();
    await waitFor(()=>current().some(e=>e.kind==='start'),'Native playback start');
    await waitFor(async()=>await button.getAttribute('aria-pressed')==='false','Native playback completion',65_000);
    await waitFor(()=>current().some(e=>e.kind==='end' || e.kind==='error'),'Native end notification');
    assert(current().every(e=>e.kind!=='error'),JSON.stringify(current()));
    return current().filter(e=>e.kind==='end');
  };

  await open('/');
  const arabic = page.locator('#quick-start--paragraph-1 > [lang=ar] > .speak');
  const mixed = await finished(arabic);
  for (const term of ['C S S','JavaScript','C D N']) assert(mixed.some(e=>e.lang==='en-US' && e.text.includes(term)),term);
  assert(mixed.some(e=>e.lang==='ar' && e.voice));
  console.log(`Native mixed passage completed with ${[...new Set(mixed.map(e=>e.voice))].join(' and ')}.`);

  await open('/docs/5.3/getting-started/introduction/');
  const englishTitle = page.locator('.pair-title > [lang=en] > .speak');
  assert((await finished(englishTitle)).some(e=>e.lang==='en-US'));
  const switchStep = ++sequence;
  await page.evaluate(value=>{ window.readerSpeechTestStep=value; },switchStep);
  await englishTitle.click();
  await waitFor(()=>events.some(e=>e.step===switchStep && e.kind==='start'),'Native English restart');
  const arabicTitle = page.locator('.pair-title > [lang=ar] > .speak');
  await arabicTitle.click();
  await waitFor(()=>events.some(e=>e.step===switchStep && e.kind==='start'&&e.lang==='ar'),'Native passage switch');
  await arabicTitle.click();
  await waitFor(()=>page.evaluate(()=>!speechSynthesis.speaking && !speechSynthesis.pending),'Native stop');
  assert.equal(await englishTitle.getAttribute('aria-pressed'),'false');

  assert((await finished(page.locator('[data-term="C S S"]').first())).some(e=>e.text==='C S S'));
  await open('/docs/5.3/components/tooltips/');
  assert((await finished(page.locator('[data-term="Tooltip"]').first())).some(e=>e.text==='Tooltip'));
  await open('/docs/5.3/utilities/flex/');
  assert((await finished(page.locator('[data-term="D flex"]').first())).some(e=>e.text==='D flex'));

  console.log('Native speech passed for English, an Arabic/English passage, Tooltip, CSS, d-flex, interruption, and stopping.');
} finally {
  await browser.close();
}
