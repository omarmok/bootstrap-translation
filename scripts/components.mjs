import {componentMeanings} from './meanings.mjs';
const aliases = {
  alerts: 'alert',
  badges: 'badge',
  breadcrumbs: 'breadcrumb',
  buttons: 'button',
  dropdowns: 'dropdown',
  'close-icon': 'close-button',
  'button-groups': 'button-group',
  'button-dropdowns': 'button-dropdown',
  'buttons-dropdowns': 'button-dropdown',
  'button-dropdown-menus': 'button-dropdown',
  'dropdown-menus': 'dropdown',
  'navs-tabs': 'nav-tabs',
  'nav-tabs-and-pills': 'nav-tabs',
  'navs-tabs-and-pills': 'nav-tabs',
  'nav-tabs-pills-and-lists': 'nav-tabs',
  'tabs-and-pills': 'nav-tabs',
  'navs': 'nav',
  'nav-lists': 'nav',
  'navigation': 'nav',
  'fixed-topbar': 'navbar',
  tabs: 'tab',
  'togglable-tabs': 'tab',
  'tabbable-nav': 'tab',
  'example-accordion': 'accordion',
  'accordion-example': 'accordion',
  modals: 'modal',
  placeholders: 'placeholder',
  popovers: 'popover',
  'progress-bars': 'progress',
  spinners: 'spinner',
  toasts: 'toast',
  tooltips: 'tooltip',
  'tool-tips': 'tooltip',
  'input-groups': 'input-group',
  'inline-labels': 'label',
  labels: 'label',
  'hero-unit': 'jumbotron',
  thumbnails: 'thumbnail',
  panels: 'panel',
  wells: 'well',
  'alert-messages': 'alert',
  'alerts-and-errors': 'alert',
  'basic-alerts': 'alert',
  icons: 'glyphicons',
};

function keyFor(slug) {
  return Object.hasOwn(aliases,slug) ? aliases[slug] : slug;
}

function legacyKey(block) {
  if (block.type !== 'heading') return;
  if (/<small>Components for displaying content/i.test(block.en)) return;
  const slug = block.en.split(/<small(?:\s|>)/i)[0]
    .replace(/<[^>]*>/g,'')
    .toLowerCase()
    .replace(/&amp;/g,' and ')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-|-$/g,'');
  return keyFor(slug);
}

function markHeading(block,key) {
  block.termKey = key;
  block.anchors = [...(block.anchors ?? []),block.id + '--component-meaning'];
}

export function markComponentHeadings(page) {
  const match = /^\/docs\/\d+\.\d+\/(components|forms)\/([^/]+)\/$/.exec(page.route);
  if (match) {
    const key = keyFor(match[2]);
    if (Object.hasOwn(componentMeanings,key)) markHeading(page.title,key);
    else if (match[1] === 'components') throw new Error('Missing component meaning for ' + page.route);
    return page;
  }

  if (!/^\/(?:1\.\d+\.\d+\/(?:javascript\.html)?|2\.\d+\.\d+\/(?:components|javascript|base-css)\.html|docs\/3\.\d+\/(?:components|javascript|css)\/)$/i.test(page.route)) return page;

  const seen = new Set();
  for (const block of page.blocks) {
    const key = legacyKey(block);
    if (!key || !Object.hasOwn(componentMeanings,key) || seen.has(key)) continue;
    seen.add(key);
    markHeading(block,key);
  }
  return page;
}
