import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './fixtures/catalog.mjs';
import {indexCatalog,searchItems} from '../src/lib/builder/catalog.js';
import * as C from '../src/lib/builder/creation.js';
import {creationSteps,level1FeatSlots,level1Spells} from '../src/lib/builder/schema.js';
import {boostSources,boostAllowed,attributeModifiers,skillTraining,hitPoints,languageAllowance}
  from '../src/lib/builder/rules.js';
import {emptyCreation} from '../src/lib/leveler-format.js';

const catalog=indexCatalog(bundle);
const lookup=uuid=>catalog.get(uuid);
const byName=(type,name)=>catalog.ofType(type).find(i=>i.name===name);
const ids=steps=>steps.map(s=>s.id);

function fighter(){
  let d=emptyCreation();
  d=C.setAncestry(d,byName('ancestry','Human'));
  d=C.setHeritage(d,byName('heritage','Versatile Human'));
  d=C.setBackground(d,byName('background','Guard'));
  return C.setClass(d,byName('class','Fighter'));
}

test('wizard steps are built from the class: fighter vs wizard vs cleric',()=>{
  assert.deepEqual(ids(creationSteps(fighter(),lookup,{})),
    ['ancestry','heritage','background','class','boosts','skills','feats','languages','equipment','review']);
  const wizard=C.setClass(fighter(),byName('class','Wizard'));
  assert.deepEqual(ids(creationSteps(wizard,lookup,{})),
    ['ancestry','heritage','background','class','subclass','thesis','boosts','skills','feats','languages','spells','equipment','review']);
  let cleric=C.setClass(fighter(),byName('class','Cleric'));
  assert.deepEqual(ids(creationSteps(cleric,lookup,{})).slice(4,6),['deity','subclass'],
    'sanctification and font only appear once the deity calls for them');
  cleric=C.setDeity(cleric,byName('deity','Nethys'));
  assert.ok(ids(creationSteps(cleric,lookup,{})).includes('divineFont'),'Nethys offers two fonts');
  cleric=C.setDeity(cleric,byName('deity','Asmodeus'));
  const steps=creationSteps(cleric,lookup,{});
  assert.ok(steps.find(s=>s.id==='sanctification').complete,'a "must" deity sets sanctification automatically');
  assert.equal(cleric.classSelections.class.divineFont,'harmful');
  assert.equal(cleric.divineFont,'harmful','primary choices are mirrored at the top level like Leveler');
});

test('level-1 feat slots come from classFeatLevels and variants',()=>{
  assert.deepEqual(level1FeatSlots(fighter(),lookup,{}).map(s=>s.slot),['ancestry','class']);
  const wizard=C.setClass(fighter(),byName('class','Wizard'));
  assert.deepEqual(level1FeatSlots(wizard,lookup,{ancestralParagon:true,mythic:true}).map(s=>s.slot),
    ['ancestry','paragon','mythic']);
});

test('boost sources follow ancestry, background and class data; no replacement when full',()=>{
  const d=fighter();
  const sources=boostSources(d,lookup);
  assert.deepEqual(sources.map(s=>[s.source,s.count]),[['ancestry',2],['background',2],['class',1],['free',4]]);
  const elf=C.setAncestry(d,byName('ancestry','Elf'));
  const ancestry=boostSources(elf,lookup)[0];
  assert.deepEqual([ancestry.fixed,ancestry.flaws,ancestry.count],[['dex','int'],['con'],1]);
  assert.equal(boostAllowed(ancestry,[],'dex'),false,'a fixed boost cannot be picked again');
  const background=sources[1];
  assert.equal(boostAllowed(background,['dex'],'wis'),false,'one background boost must be STR or CHA');
  assert.equal(boostAllowed(background,['str'],'wis'),true);
  let picked=C.toggleBoost(d,'free','str',4);
  for(const a of ['dex','con','wis','int'])picked=C.toggleBoost(picked,'free',a,4);
  assert.deepEqual(picked.boosts.free,['str','dex','con','wis']);
});

test('attribute modifiers, HP, skills and languages at level 1',()=>{
  let d=fighter();
  d=C.toggleBoost(d,'ancestry','str',2);d=C.toggleBoost(d,'ancestry','con',2);
  d=C.toggleBoost(d,'background','str',2);d=C.toggleBoost(d,'background','dex',2);
  d=C.toggleBoost(d,'class','str',1);
  for(const a of ['str','dex','con','int'])d=C.toggleBoost(d,'free',a,4);
  const {mods}=attributeModifiers(d,lookup);
  assert.deepEqual(mods,{str:4,dex:2,con:2,int:1,wis:0,cha:0});
  assert.equal(hitPoints(d,lookup,mods.con),8+10+2);
  const skills=skillTraining(d,lookup,mods.int);
  assert.equal(skills.choices,3+1);
  assert.ok(skills.granted.has('intimidation'));
  assert.equal(languageAllowance(d,lookup,mods.int).count,2);
});

test('remaster partial boosts above +4',()=>{
  let d=fighter();
  d=C.toggleBoost(d,'ancestry','str',2);d=C.toggleBoost(d,'background','str',2);
  d=C.toggleBoost(d,'class','str',1);d=C.toggleBoost(d,'free','str',4);
  const plan={5:{abilityBoosts:['str']},10:{abilityBoosts:['str']}};
  assert.equal(attributeModifiers(d,lookup,plan,5).mods.str,4);
  assert.equal(attributeModifiers(d,lookup,plan,5).partial.str,true);
  assert.equal(attributeModifiers(d,lookup,plan,10).mods.str,5);
});

test('setClass resets class-dependent choices like Leveler',()=>{
  let d=C.setClass(fighter(),byName('class','Wizard'));
  d=C.setSubclass(d,byName('feat','School of Battle Magic'));
  d=C.setHandlerItem(d,'thesis',byName('feat','Spell Blending'));
  d=C.toggleBoost(d,'class','int',1);
  assert.equal(d.thesis.name,'Spell Blending');
  d=C.setClass(d,byName('class','Fighter'));
  assert.equal(d.subclass,null);
  assert.equal(d.thesis,null);
  assert.equal(d.boosts.class,undefined);
  assert.equal(d.class.slug,'fighter');
});

test('level-1 spells use Leveler counts and cap picks',()=>{
  const wizard=C.setClass(fighter(),byName('class','Wizard'));
  assert.deepEqual(level1Spells(wizard,lookup),{cantrips:10,rank1:5});
  assert.equal(level1Spells(fighter(),lookup),null);
  assert.equal(level1Spells(C.setClass(fighter(),byName('class','Cleric')),lookup),null,
    'prepared list casters learn no spells');
  let d=wizard;
  const shield=byName('spell','Shield');
  d=C.toggleSpell(d,shield,{cantrip:true,max:1});
  d=C.toggleSpell(d,byName('spell','Light'),{cantrip:true,max:1});
  assert.equal(d.spells.cantrips.length,1);
});

test('local search ranks name prefixes and filters by tags, traits and level',()=>{
  const schools=searchItems(catalog.ofType('feat'),'',{tags:['wizard-arcane-school']});
  assert.deepEqual(schools.map(i=>i.name),['School of Battle Magic','School of Civic Wizardry']);
  assert.equal(searchItems(catalog.ofType('feat'),'sud')[0].name,'Sudden Charge');
  assert.equal(searchItems(catalog.ofType('spell'),'fireball',{maxLevel:2}).length,0);
  assert.deepEqual(searchItems(catalog.ofType('spell'),'fire',{maxLevel:2}).map(i=>i.name),['Ignition'],
    'trait words match too');
  assert.deepEqual(searchItems(catalog.ofType('feat'),'',{traits:['fighter'],test:i=>i.metadata.category==='class'})
    .map(i=>i.name),['Point-Blank Stance','Reactive Shield','Sudden Charge']);
});
