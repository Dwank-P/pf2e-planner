import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './fixtures/catalog.mjs';
import {indexCatalog} from '../src/lib/builder/catalog.js';
import {importFoundryActor} from '../src/lib/builder/foundry-import.js';
import {attributeModifiers} from '../src/lib/builder/rules.js';
import {skillRanks} from '../src/lib/builder/legality.js';

const catalog=indexCatalog(bundle);
const ref=(type,name)=>{const i=catalog.ofType(type).find(x=>x.name===name);return {uuid:i.uuid,name:i.name};};
// What Bridge 0.15 sends for a level-5 dwarf fighter built on the sheet (alternate ancestry boosts).
const snapshot={name:'Brakka',level:5,class:ref('class','Fighter'),dualClass:null,
  ancestry:ref('ancestry','Dwarf'),heritage:ref('heritage','Rock Dwarf'),background:ref('background','Guard'),deity:null,
  languages:['common','dwarven'],
  abilities:{breakdown:{alternate:true,ancestryFree:['str','con'],backgroundBoosts:['str','cha'],classBoosts:['str'],
    mapLevelledBoosts:{1:['str','con','int','cha'],5:['str','dex','con','wis']}}},
  proficiencies:{athletics:4,intimidation:2,acrobatics:2,survival:2},lores:[['Legal',2]],
  feats:[[ref('feat','Rock Runner'),null,'Ancestry Feat',1,'Ancestry Feat 1'],[ref('feat','Sudden Charge'),null,'Class Feat',1,'Class Feat 1'],
    [ref('feat','Lunge'),null,'Class Feat',2,'Class Feat 2'],[ref('feat','Quick Jump'),null,'Skill Feat',2,'Skill Feat 2'],
    [ref('feat','Toughness'),null,'General Feat',3,'General Feat 3'],[{uuid:'Compendium.pf2e.classfeatures.Item.ShieldBlock',name:'Shield Block'},null,'Awarded Feat',1]],
  specials:[],spellCasters:[],equipment:[[ref('weapon','Longsword'),1]]};
// Leveler's wizard data saved before the player changed things on the sheet.
const staleLeveler={creation:{version:1,class:{uuid:snapshot.class.uuid,slug:'fighter',name:'Fighter'},
    boosts:{free:['str','dex','con','wis'],ancestry:['str'],background:['str','con']},skills:['athletics','acrobatics'],
    classSelections:{class:{implement:{uuid:'Compendium.pf2e.x.Item.y',name:'Kept wizard choice'}}},featGrants:[{requirementId:'r1',selections:[]}]},
  plan:{version:1,classSlug:'fighter',levels:{
    3:{skillIncreases:[{skill:'athletics',toRank:2}],featGrants:[{requirementId:'r3',selections:[]}]},
    9:{classFeats:[{uuid:'Compendium.pf2e.feats-srd.Item.Future',name:'Future plan'}]}}}};

test('a Foundry export takes boosts, alternate ancestry boosts and feats from the actor, not stale Leveler data',()=>{
  const {creation:c,plan,report}=importFoundryActor(snapshot,staleLeveler,catalog,{freeArchetype:false});
  assert.equal(c.alternateAncestryBoosts,true);
  assert.deepEqual(c.boosts.ancestry,['str','con']);
  assert.deepEqual(c.boosts.free,['str','con','int','cha'],'level-1 free boosts are the actor\'s');
  assert.deepEqual(c.boosts.background,['str','cha']);
  assert.equal(plan.levels[5]?.abilityBoosts,undefined,'later boosts come only from the Leveler plan, never guessed');
  const {mods}=attributeModifiers(c,catalog.get);
  assert.equal(mods.cha,2,'alternate boosts drop the dwarf\'s Charisma flaw (it would be +1)');
  assert.equal(c.ancestryFeat.name,'Rock Runner');assert.equal(c.classFeat.name,'Sudden Charge');
  assert.equal(plan.levels[2].classFeats[0].name,'Lunge');
  assert.equal(plan.levels[3].generalFeats[0].name,'Toughness');
  assert.equal(c.classSelections.class.implement.name,'Kept wizard choice','wizard-only choices come from Leveler');
  assert.equal(c.featGrants[0].requirementId,'r1');
  assert.equal(plan.levels[3].featGrants[0].requirementId,'r3');
  assert.equal(plan.levels[9].classFeats[0].name,'Future plan','levels above the actor keep the Leveler plan');
  assert.deepEqual(plan.levels[3].skillIncreases,[{skill:'athletics',toRank:2}],'skill increases come from the Leveler plan');
  assert.equal(Object.values(plan.levels).flatMap(d=>d.skillIncreases??[]).length,1,'none are made up from skill ranks');
  assert.deepEqual(c.skills,['athletics','acrobatics'],'level-1 skills from Leveler\'s creation data');
  assert.equal(skillRanks(c,plan,catalog.get,5).get('athletics'),2);
  assert.ok(report.notes.some(n=>/from your Leveler plan/.test(n)));
});

test('without Leveler data only the sheet\'s known choices come across',()=>{
  const {creation:c,plan,report}=importFoundryActor(snapshot,{creation:null,plan:null},catalog,{});
  assert.equal(c.class.name,'Fighter');
  assert.deepEqual(c.boosts.free,['str','con','int','cha']);
  assert.equal(plan.classSlug,'fighter');
  assert.equal(plan.levels[2].classFeats[0].name,'Lunge','feats on the sheet keep their slot');
  assert.deepEqual(c.skills,[],'level-1 skill picks aren\'t guessed for a level-5 character');
  assert.ok(!Object.values(plan.levels).some(d=>d.skillIncreases?.length||d.abilityBoosts?.length));
  assert.ok(report.notes.some(n=>/Level-1 skill picks/.test(n)));
});
