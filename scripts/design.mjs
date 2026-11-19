const paths = {
  volume:'<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',
  search:'<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4 4"/>',
  book:'<path d="M12 6a6 6 0 0 0-6-2H3v14h3a6 6 0 0 1 6 2m0-14a6 6 0 0 1 6-2h3v14h-3a6 6 0 0 0-6 2zm0 0v14"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  external:'<path d="M13 5h6v6m0-6-9 9m7-2v6H6V7h6"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  chevron:'<path d="m7 10 5 5 5-5"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18-3-3-3-15 0-18Z"/>',
  code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-2-13-4 16"/>',
  note:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  hash:'<path d="M5 9h15M4 15h15M10 4 7 20m10-16-3 16"/>',
};
export function icon(name, size = 18) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ''}</svg>`;
}

export const sections = {
  'getting-started':['البدء','Getting started'],
  'customize':['التخصيص','Customize'],
  'layout':['التخطيط','Layout'],
  'content':['المحتوى','Content'],
  'forms':['النماذج','Forms'],
  'components':['المكوّنات','Components'],
  'helpers':['الأدوات المساعدة','Helpers'],
  'utilities':['الأصناف المساعدة','Utilities'],
  'utilities-api':['واجهة الأصناف المساعدة','Utilities API'],
  'extend':['التوسعة','Extend'],
  'about':['عن Bootstrap','About'],
  'migration':['الترحيل','Migration'],
  'examples':['الأمثلة','Examples'],
  'guides':['الأدلة','Guides'],
  'design':['التصميم','Design'],
  'tokens':['رموز التصميم','Tokens'],
  'css':['تنسيقات CSS','CSS'],
  'javascript':['مكوّنات JavaScript','JavaScript'],
  'other':['صفحات التوثيق','Documentation'],
  'general':['عن Bootstrap','About Bootstrap'],
};

export const sectionOrder = Object.keys(sections);
export const sectionName = key => sections[key] ?? [key.replaceAll('-',' '),key.replaceAll('-',' ')];
