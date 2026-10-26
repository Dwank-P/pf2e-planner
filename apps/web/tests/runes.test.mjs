import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveRunes,toggleRune,setRuneCount,resetRunes,isRunesmith,DEFAULT_RUNE_COUNT} from '../src/lib/builder/runes.js';

const A='Compendium.x.runes.Item.A',B='Compendium.x.runes.Item.B',C='Compendium.x.runes.Item.C',
  D='Compendium.x.runes.Item.D',E='Compendium.x.runes.Item.E';
const pick=(planner,level,...uuids)=>uuids.reduce((p,u)=>toggleRune(p,level,u),planner);

test('runes follow the nearest earlier level until changed there',()=>{
  assert.ok(isRunesmith({class:{slug:'runesmith'}}));
  let p=pick({},1,A,B,C);
  assert.deepEqual(effectiveRunes(p,1).picks,[A,B,C]);
  assert.equal(effectiveRunes(p,1).count,DEFAULT_RUNE_COUNT);
  assert.deepEqual(effectiveRunes(p,5).picks,[A,B,C],'later levels inherit');
  assert.equal(effectiveRunes(p,5).pickLevel,1);
  // Level 3 changes its own runes: swap C for D.
  p=toggleRune(p,3,C);p=toggleRune(p,3,D);
  assert.deepEqual(effectiveRunes(p,3).picks,[A,B,D]);
  assert.deepEqual(effectiveRunes(p,1).picks,[A,B,C],'level 1 is untouched');
  // Changing level 1 now: level 2 follows it, level 3 keeps its own, level 4 follows level 3.
  p=toggleRune(p,1,A);p=toggleRune(p,1,E);
  assert.deepEqual(effectiveRunes(p,2).picks,[B,C,E]);
  assert.deepEqual(effectiveRunes(p,3).picks,[A,B,D]);
  assert.deepEqual(effectiveRunes(p,4).picks,[A,B,D]);
  // Undo level 3's change: it follows level 1 again.
  p=resetRunes(p,3);
  assert.deepEqual(effectiveRunes(p,4).picks,[B,C,E]);
});

test('a new rune slot at a level carries upward and adds a free slot',()=>{
  let p=pick({},1,A,B,C);
  p=setRuneCount(p,4,4);
  assert.equal(effectiveRunes(p,3).count,3);
  assert.equal(effectiveRunes(p,9).count,4);
  p=toggleRune(p,4,D);
  assert.deepEqual(effectiveRunes(p,4).picks,[A,B,C,D]);
  assert.deepEqual(effectiveRunes(p,2).picks,[A,B,C]);
  assert.equal(toggleRune(p,4,E),p,'no fifth rune while four are known');
  p=setRuneCount(p,4,3);
  assert.equal(p.runes[4].count,undefined,'setting it back to the inherited count clears the override');
});
