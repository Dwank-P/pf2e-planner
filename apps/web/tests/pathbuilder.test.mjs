import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './fixtures/catalog.mjs';
import {indexCatalog} from '../src/lib/builder/catalog.js';
import {importPathbuilder,nameKey,PATHBUILDER_ID} from '../src/lib/builder/pathbuilder.js';
import * as P from '../src/lib/builder/plan.js';
import {skillRanks} from '../src/lib/builder/legality.js';

const catalog=indexCatalog(bundle);
// Shaped like a Pathbuilder 2e "Export JSON" response (abridged).
const fighter={success:true,build:{
  name:'Valeros',class:'Fighter',dualClass:null,level:5,ancestry:'Human',heritage:'Versatile Human',
  background:'Guard',deity:'Not set',languages:['Common','Dwarven'],keyability:'str',
  abilities:{str:18,dex:14,con:14,int:10,wis:12,cha:10,breakdown:{
    ancestryFree:['Str','Con'],ancestryBoosts:[],ancestryFlaws:[],backgroundBoosts:['Str','Cha'],
    classBoosts:['Str'],mapLevelledBoosts:{1:['Str','Dex','Con','Wis'],5:['Str','Dex','Con','Wis']}}},
  proficiencies:{athletics:6,acrobatics:2,intimidation:2,survival:2,perception:4},
  lores:[['Legal',2],['Warfare',4]],
  feats:[['Natural Ambition',null,'Ancestry Feat',1],['Sudden Charge',null,'Class Feat',1],
    ['Lunge',null,'Class Feat',2],['Quick Jump',null,'Skill Feat',2],['Toughness',null,'General Feat',3],
    ['Knockdown',null,'Class Feat',4],['Assurance','Athletics','Skill Feat',4],['Cooperative Nature',null,'Ancestry Feat',5],
    ['Shield Block',null,'Awarded Feat',1],['Made Up Feat',null,'Class Feat',4]],
  specials:['Reactive Strike','Shield Block'],
  weapons:[{name:'Longsword',qty:1}],armor:[{name:'Leather Armor',qty:1}],
  equipment:[["Healer's Toolkit",1],['Minor Healing Potion',3],['Vorpal Spoon',1]],
  spellCasters:[]}};

test('Pathbuilder JSON ids are plain numbers',()=>{
  assert.ok(PATHBUILDER_ID.test('123456'));
  assert.ok(!PATHBUILDER_ID.test('12a'));
  assert.equal(nameKey('Doctor’s Visitation (Legacy)'),"doctor's visitation");
});

test('a Pathbuilder fighter becomes Leveler creation and plan documents',()=>{
  const result=importPathbuilder(fighter,catalog,{freeArchetype:false});
  const {creation:c,plan,planner,report}=result;
  assert.equal(result.name,'Valeros');
  assert.equal(result.level,5);
  assert.equal(c.ancestry.name,'Human');assert.equal(c.heritage.name,'Versatile Human');
  assert.equal(c.background.name,'Guard');assert.equal(c.class.name,'Fighter');
  assert.deepEqual(c.boosts.free,['str','dex','con','wis']);
  assert.deepEqual(c.boosts.background,['str','cha']);
  assert.equal(c.ancestryFeat.name,'Natural Ambition');
  assert.equal(c.classFeat.name,'Sudden Charge');
  assert.deepEqual(c.languages,['common','dwarven']);
  assert.deepEqual(P.planBoosts(plan,5),['str','dex','con','wis']);
  assert.equal(plan.classSlug,'fighter');
  assert.equal(plan.levels[2].classFeats[0].name,'Lunge');
  assert.equal(plan.levels[2].skillFeats[0].name,'Quick Jump');
  assert.equal(plan.levels[3].generalFeats[0].name,'Toughness');
  assert.equal(plan.levels[5].ancestryFeats[0].name,'Cooperative Nature');
  // Athletics to master and Warfare Lore to master need increases at levels 3, 5 (expert) and 7+ (master):
  // by level 5 only expert ranks fit; the master ranks are reported.
  const ranks=skillRanks(c,plan,catalog.get,5);
  assert.equal(ranks.get('athletics'),2);
  assert.ok(report.notes.some(n=>/athletics rank 3/.test(n)));
  assert.ok(report.missing.some(m=>m.name==='Made Up Feat'));
  assert.ok(report.missing.some(m=>m.name==='Vorpal Spoon'));
  assert.ok(!report.missing.some(m=>m.name==='Shield Block'),'Awarded feats come with the class');
  const potion=planner.wishlist.find(w=>w.name==='Minor Healing Potion');
  assert.equal(potion.quantity,3);assert.equal(potion.status,'bought');
});

test('lore skill increases are stored as Leveler slugs and counted',()=>{
  let plan=P.ensurePlan(null,{class:{slug:'fighter'}});
  plan=P.setSkillIncrease(plan,{key:'skill-increase-3',level:3},'warfare lore',2);
  assert.equal(plan.levels[3].skillIncreases[0].skill,'warfare-lore');
  const creation={selectedLoreSkills:['Warfare Lore']};
  assert.equal(skillRanks(creation,plan,()=>null,3).get('warfare lore'),2);
});
