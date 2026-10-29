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
  assert.ok(report.notes.some(n=>/Athletics Expert → Master/.test(n)));
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

import {readFileSync} from 'node:fs';
import {levels} from './fixtures/catalog.mjs';
import {buildState,checkFeat,featNameIndex,takenFeats} from '../src/lib/builder/legality.js';

// A level-20 Ancestral Paragon bard (Pathbuilder 416365, abridged) on a small catalog with those names.
function nashiCatalog(){
  const item=(pack,id,type,name,level,metadata={},extra={})=>({uuid:`Compendium.pf2e.${pack}.Item.${id}`,name,type,level,
    rarity:'common',traits:extra.traits??[],pack:'pf2e.'+pack,metadata:{slug:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),...metadata}});
  const bardLevels=levels({ancestry:[3,5,7,9,11,13,15,17,19]});
  for(let l=2;l<=20;l+=2)(bardLevels[l]??=[]).push({type:'archetypeFeat'});
  const feat=(name,level,category,extra={})=>item('feats-srd',name.replace(/\W/g,''),'feat',name,level,
    {featType:category,category,prerequisites:[],...extra},{traits:[category]});
  return indexCatalog({items:[
    item('ancestries','Tanuki','ancestry','Tanuki',null,{rules:{hp:10,boosts:{}}}),
    item('heritages','VirtuousTanuki','heritage','Virtuous Tanuki',null,{ancestrySlug:'tanuki'}),
    item('backgrounds','EagerScofflaw','background','Eager Scofflaw',null,{rules:{trainedSkills:{value:['thievery'],lore:['Underworld']}}}),
    item('classes','Bard','class','Bard',1,{classFeatLevels:[1,2,4,6,8,10,12,14,16,18,20],keyAbility:['cha'],
      grantedFeatures:[{name:'Magnum Opus',level:19,uuid:null},{name:'Enigma',level:1,uuid:null}],
      rules:{hp:8,trainedSkills:{value:['occultism','performance'],additional:4}},
      levelerProgression:{provider:'pf2e-leveler',slug:'bard',levels:bardLevels,spellcasting:null,subclassTag:null}}),
    feat('Teakettle Form',1,'ancestry'),feat('Scorched On the Crackling Mountain',1,'ancestry'),
    feat('Virtuosic Performer',2,'skill'),feat('Multifarious Muse',2,'class'),feat('Captain Dedication',2,'class'),
    feat('Group Impression',1,'skill'),feat('Fleet',1,'general'),feat('Everyday Form',3,'ancestry'),
    feat('Hasty Celebration',5,'ancestry'),feat('Magnum Opus Fan',18,'class'),
    feat('Perfect Encore',20,'class',{prerequisites:['Magnum Opus']}),
    item('classfeatures','MagnumOpus','feat','Magnum Opus',19,{category:'classfeature'})]});
}

test('a Pathbuilder Ancestral Paragon bard keeps its slots and main skills',()=>{
  const catalog=nashiCatalog();
  const json=JSON.parse(readFileSync(new URL('./fixtures/pathbuilder-captain-nashi.json',import.meta.url),'utf8'));
  const {creation:c,plan,report}=importPathbuilder(json,catalog,{freeArchetype:true,ancestralParagon:true});
  assert.equal(c.ancestryFeat.name,'Teakettle Form');
  assert.equal(c.ancestryParagonFeat.name,'Scorched On the Crackling Mountain','Paragon 1 goes to the paragon field');
  assert.equal(plan.levels[1],undefined,'nothing hidden in plan.levels[1]');
  assert.equal(plan.levels[2].archetypeFeats[0].name,'Captain Dedication');
  assert.ok(!JSON.stringify(plan).includes('Group Impression'),'a dedication\'s granted choice is not a slot');
  assert.ok(report.notes.some(n=>/Group Impression comes from/.test(n)));
  assert.equal(plan.levels[3].ancestryFeats[0].name,'Everyday Form');
  assert.equal(plan.levels[20].classFeats[0].name,'Perfect Encore');
  // Diplomacy and Performance (legendary) are raised before anything else; Occultism to master.
  const increases=Object.entries(plan.levels).flatMap(([l,d])=>(d.skillIncreases??[]).map(i=>[Number(l),i.skill,i.toRank]))
    .sort((a,b)=>a[0]-b[0]);
  assert.deepEqual(increases.slice(0,2).map(i=>i[1]).sort(),['diplomacy','performance']);
  assert.ok(!increases.slice(0,5).some(i=>i[2]===1),'training untrained skills only uses spare increases');
  const final=skillRanks(c,plan,catalog.get,20);
  assert.equal(final.get('diplomacy'),4);assert.equal(final.get('performance'),4);assert.equal(final.get('occultism'),3);
  // Perfect Encore needs Magnum Opus, a level-19 class feature: legal at 20.
  const state=buildState(c,plan,catalog.get,20,{});
  const encore=catalog.ofType('feat').find(f=>f.name==='Perfect Encore');
  assert.equal(checkFeat(encore,state,{kind:'class',featNames:featNameIndex(catalog),currentUuid:encore.uuid}).blocked,null);
  const early=buildState(c,plan,catalog.get,18,{});
  assert.match(checkFeat({...encore,level:1},early,{kind:'class',featNames:featNameIndex(catalog),currentUuid:encore.uuid}).blocked??'',/Magnum Opus/);
  assert.ok(takenFeats(c,plan).every(f=>f.level>1||f.field),'level-1 feats only in the creation');
});
