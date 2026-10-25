import test from 'node:test';
import assert from 'node:assert/strict';
import {levelerChoiceSlots,setBoost,selectedBoosts,choiceComplete,spellAllowance,spellsAtLevel,
 classFeaturesAt,signatureRanks} from '../src/lib/leveler-progression.js';

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
 assert.equal(out.slots.some(s=>s.type==='spells'),false,
  'A non-caster gets no spell slots, even if Leveler marks a spells step');
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
 setBoost(build,'level-5','int',4);
 assert.deepEqual(selectedBoosts(build,'level-5'),['str','wis','con','cha'],
  'A full slot must not replace an earlier pick');
});
test('level-1 class/skill feats and specializations come from the class Item',()=>{
 const wizardLike={name:'Fighter',metadata:{classFeatLevels:[1,2,4],skillFeatLevels:[2],
  levelerProgression:{...fighter.metadata.levelerProgression,subclassTag:'fighter-style'}}};
 const keys=levelerChoiceSlots(wizardLike).slots.filter(s=>s.level===1).map(s=>s.key);
 assert.ok(keys.includes('class-1'));
 assert.ok(!keys.includes('skill-1'));
 assert.equal(levelerChoiceSlots(wizardLike).slots.find(s=>s.key==='subclass-1').tag,'fighter-style');
 const rogueLike={metadata:{classFeatLevels:[1],skillFeatLevels:[1,2]}};
 assert.ok(levelerChoiceSlots(rogueLike).slots.some(s=>s.key==='skill-1'));
});
test('spells learned per level follow Leveler: repertoire growth, spellbook +2, prepared none',()=>{
 const sorcerer={slug:'sorcerer',spellcasting:{type:'spontaneous',slots:{
  1:{cantrips:5,1:3},2:{cantrips:5,1:4},3:{cantrips:5,1:4,2:3}}}};
 assert.deepEqual(spellAllowance(sorcerer,1),{cantrips:5,ranks:{1:3},any:0,maxRank:1,granted:0,total:8});
 assert.deepEqual(spellAllowance(sorcerer,2),{cantrips:0,ranks:{1:1},any:0,maxRank:1,total:1});
 assert.deepEqual(spellAllowance(sorcerer,3).ranks,{2:3});
 const bard={...sorcerer,slug:'bard',spellcasting:{...sorcerer.spellcasting,level1Counts:{cantrips:5,rank1:3}}};
 assert.equal(spellAllowance(bard,1).ranks[1],3,'Leveler handler counts win at level 1');
 const wizard={slug:'wizard',spellcasting:{type:'prepared',slots:{1:{cantrips:5,1:2},2:{cantrips:5,1:3},3:{cantrips:5,1:3,2:2}}}};
 assert.deepEqual(spellAllowance(wizard,1),{cantrips:10,ranks:{1:5},any:0,maxRank:1,granted:0,total:15});
 assert.deepEqual(spellAllowance(wizard,3),{cantrips:0,ranks:{},any:2,maxRank:2,total:2});
 const cleric={slug:'cleric',spellcasting:{type:'prepared',slots:{1:{cantrips:5,1:2}}}};
 assert.equal(spellAllowance(cleric,1),null);
 const build={spells:{'3:rank-2':['a','b'],'3:cantrip':['c'],'1:rank-1':['d']}};
 assert.deepEqual(spellsAtLevel(build,3),{cantrip:['c'],ranked:{2:['a','b']},count:3});
 const slots=levelerChoiceSlots({metadata:{levelerProgression:{provider:'pf2e-leveler',slug:'sorcerer',
  spellcasting:sorcerer.spellcasting,levels:{2:[{type:'classFeat'}]}}}}).slots;
 assert.deepEqual(slots.filter(s=>s.type==='spells').map(s=>s.key),['spells-1','spells-2','spells-3']);
 assert.equal(choiceComplete(slots.find(s=>s.key==='spells-3'),{spells:{'3:rank-2':['a','b','c']}}),true);
});
test('automatic class features per level prefer the class Item list',()=>{
 const item={name:'Fighter',metadata:{grantedFeatures:[{name:'Bravery',level:3,uuid:'U1'}],
  levelerProgression:{classFeatures:[{name:'Ignored',level:3}]}}};
 assert.deepEqual(classFeaturesAt([item],3),[{name:'Bravery',uuid:'U1',className:'Fighter'}]);
 const legacy={name:'Fighter',metadata:{levelerProgression:{classFeatures:[{name:'Bravery',level:3}]}}};
 assert.deepEqual(classFeaturesAt([legacy,null],3),[{name:'Bravery',uuid:null,className:'Fighter'}]);
});
test('bard-style counts that include a granted muse spell pick only the repertoire slots',()=>{
 const bard={slug:'bard',spellcasting:{type:'spontaneous',slots:{1:{cantrips:5,1:2}},level1Counts:{cantrips:5,rank1:3}}};
 const a=spellAllowance(bard,1);
 assert.equal(a.ranks[1],2);
 assert.equal(a.granted,1);
});
test('signature spell ranks follow Leveler: all ranks at the feature level, then new ranks',()=>{
 const slots={1:{cantrips:5,1:3},2:{cantrips:5,1:4},3:{cantrips:5,1:4,2:3},4:{cantrips:5,1:4,2:4},5:{cantrips:5,1:4,2:4,3:3}};
 const sorcerer={metadata:{levelerProgression:{provider:'pf2e-leveler',slug:'sorcerer',levels:{},
  spellcasting:{type:'spontaneous',slots},classFeatures:[{level:3,name:'Signature Spells',key:'signature-spells'}]}}};
 assert.deepEqual([2,3,4,5].map(l=>signatureRanks(sorcerer,l)),[[],[1,2],[],[3]]);
 const fromItem={metadata:{grantedFeatures:[{level:3,name:'Signature Spells'}],
  levelerProgression:{spellcasting:{type:'spontaneous',slots}}}};
 assert.deepEqual(signatureRanks(fromItem,3),[1,2]);
 const wizard={metadata:{levelerProgression:{spellcasting:{type:'prepared',slots},classFeatures:[{level:3,key:'signature-spells'}]}}};
 assert.deepEqual(signatureRanks(wizard,3),[]);
 const slotsAt3=levelerChoiceSlots(sorcerer).slots.filter(s=>s.level===3).map(s=>s.type);
 assert.ok(slotsAt3.includes('signature'));
});
