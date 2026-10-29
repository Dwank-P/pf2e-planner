import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {LOCALES,setLocale,tr,pickLocale,labels} from '../src/lib/i18n/index.js';
import {RANKS,titleCase} from '../src/lib/builder/rules.js';

const dir=new URL('../src/lib/i18n/locales/',import.meta.url);
const catalog=code=>JSON.parse(readFileSync(new URL(code+'.json',dir),'utf8'));

test('every supported language has a catalog, and every catalog is a supported language', () => {
  const files=readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)).sort();
  assert.deepEqual(files,LOCALES.map(([code])=>code).filter(c=>c!=='en').sort());
});

test('translations keep their placeholders and the key’s edge spaces', () => {
  const marks=s=>(s.match(/\{\d+\}/g)??[]).sort().join();
  for(const [code] of LOCALES.filter(([c])=>c!=='en')){
    for(const [key,value] of Object.entries(catalog(code))){
      assert.equal(marks(value),marks(key),`${code}: ${key}`);
      assert.equal(/^\s/.test(value),/^\s/.test(key),`${code} leading space: ${key}`);
      assert.equal(/\s$/.test(value),/\s$/.test(key),`${code} trailing space: ${key}`);
    }
  }
});

test('tr fills placeholders and falls back to English', () => {
  setLocale('de',catalog('de'));
  try{
    assert.equal(tr('Level {0}',3),'Stufe 3');
    assert.equal(tr('Not a key {0}','x'),'Not a key x');
    // Labels tables and titled slugs translate when read, after the language is set.
    assert.equal(RANKS[1],'Geübt');
    assert.equal(titleCase('crafting'),'Handwerk');
    assert.equal(labels({a:'Expert'}).a,'Experte');
  }finally{setLocale('en');}
  assert.equal(RANKS[1],'Trained');
  assert.equal(tr('Level {0}',3),'Level 3');
});

test('pickLocale prefers the cookie, then the browser’s languages', () => {
  assert.equal(pickLocale('fr','de-DE,de;q=0.9'),'fr');
  assert.equal(pickLocale(undefined,'pt-BR,pt;q=0.9,en;q=0.5'),'pt-BR');
  assert.equal(pickLocale(undefined,'pt-PT,pt;q=0.9'),'pt-BR');
  assert.equal(pickLocale(undefined,'de-AT,de;q=0.9'),'de');
  assert.equal(pickLocale('xx','zh-CN'),'en');
});
