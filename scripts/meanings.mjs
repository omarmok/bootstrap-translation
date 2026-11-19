import { readJSON } from './common.mjs';

export const componentMeanings = readJSON('content/component-meanings.json');
const technicalMeanings = readJSON('content/technical-meanings.json');
const explanations = new Map();
const labels = new Map();
const arabicLabel = /\p{Script=Arabic}/u;
const normalized = text => text.trim().replace(/\s+/gu,' ').toLowerCase();

function add(key, explanation, names) {
  explanations.set(key,explanation);
  for (const name of names) labels.set(normalized(name),key);
}
for (const [key,[explanation,...names]] of Object.entries(technicalMeanings)) add(key,explanation,names);
for (const [key,[name,explanation,...aliases]] of Object.entries(componentMeanings)) add(key,explanation,[name,...aliases]);

export function meaningKey(value) {
  const name = normalized(value);
  return labels.get(name) ?? (arabicLabel.test(name) ? labels.get(name.replace(/^[وفبلك]/u,'')) : undefined);
}
export const meaningText = key => explanations.get(key);

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+');
function alternatives(arabic) {
  return [...labels.keys()].filter(label=>arabicLabel.test(label)===arabic)
    .sort((a,b)=>b.length-a.length).map(escapeRegex).join('|');
}
const englishNames = `(?<![a-z0-9_-])(?:${alternatives(false)})(?![a-z0-9_-])`;
const arabicNames = `(?<![\\p{L}\\p{M}\\p{N}_-])[وفبلك]?(?:${alternatives(true)})(?![\\p{L}\\p{M}\\p{N}_-])`;
export const meaningNames = new RegExp(englishNames+'|'+arabicNames,'giu');
