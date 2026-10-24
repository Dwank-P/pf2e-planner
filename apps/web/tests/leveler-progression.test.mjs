import test from 'node:test';
import assert from 'node:assert/strict';
import {levelerChoiceSlots,setBoost,selectedBoosts,choiceComplete} from '../src/lib/leveler-progression.js';

const fighter={
 metadata:{levelerProgression:{
  provider:'pf2e-leveler',version:'3.12.3',
  levels:{2:[{type:'classFeat'},{type:'skillFeat'},{type:'archetypeFeat'}],
   3:[{type:'abilityBoosts',count:1},{type:'skillIncrease'},
      {type:'ancestryFeat'},{type:'ancestryFeat'}],
   5:[{type:'abilityBoosts',count:4},{type:'skillIncrease'}],
   8:[{type:'dualClassFeat'},{type:'mythicFeat'},{type:'spells'},{type:'abpPotency'}]
  }
 }}
};
test('Leveler data controls slot presence, counts, variants and repeated ancestry feats',()=>{
 const out=levelerChoiceSlots(fighter);
 assert.equal(out.ready,true);
 assert.ok(out.slots.some(s=>s.key==='class-2'));
 assert.ok(out.slots.some(s=>s.key==='archetype-2'));
 assert.deepEqual(out.slots.filter(s=>s.level===3&&s.type==='feat').map(s=>s.key),
  ['ancestry-3','ancestry-3-2']);
 assert.equal(out.slots.find(s=>s.key==='level-3').count,1);
 assert.equal(out.slots.find(s=>s.key==='level-5').count,4);
 assert.ok(out.slots.some(s=>s.key==='dual-class-8'));
 assert.ok(out.slots.some(s=>s.key==='mythic-8'));
 assert.ok(out.slots.some(s=>s.key==='spells-8'));
 assert.ok(out.slots.some(s=>s.key==='abp-8'));
 assert.equal(out.slots.some(s=>s.key==='class-4'),false,
  'Must not invent slots from fallback schedules');
});
test('missing old Leveler schema reports need for sync, not assumed progression',()=>{
 assert.equal(levelerChoiceSlots({metadata:{}}).slots.filter(x=>x.type==='ability').length,4);
 assert.equal(levelerChoiceSlots({metadata:{}}).ready,false);
});
test('dual-class second class skill increases are deduplicated against primary',()=>{
 const second={metadata:{levelerProgression:{provider:'pf2e-leveler',
  levels:{2:[{type:'skillIncrease'},{type:'classFeat'}],3:[{type:'skillIncrease'}]}}}};
 const out=levelerChoiceSlots(fighter,second,{dualClass:true});
 assert.equal(out.slots.filter(s=>s.key==='skill-increase-2').length,1);
 assert.equal(out.slots.filter(s=>s.key==='skill-increase-3').length,1);
});
test('attribute boosts are per-source, capped, toggleable and selectable in level flow',()=>{
 const build={};
 setBoost(build,'level-5','str',4);setBoost(build,'level-5','dex',4);
 setBoost(build,'level-5','wis',4);setBoost(build,'level-5','con',4);
 assert.equal(choiceComplete({type:'ability',key:'level-5',count:4},build),true);
 setBoost(build,'level-5','dex',4);
 assert.deepEqual(selectedBoosts(build,'level-5'),['str','wis','con']);
 setBoost(build,'level-5','cha',4);
 assert.deepEqual(selectedBoosts(build,'level-5'),['str','wis','con','cha']);
});
