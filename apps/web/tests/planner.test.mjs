import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './fixtures/catalog.mjs';
import {indexCatalog} from '../src/lib/builder/catalog.js';
import * as C from '../src/lib/builder/creation.js';
import * as P from '../src/lib/builder/plan.js';
import {buildState,checkFeat,featNameIndex,skillRanks,maxSkillRank,takenFeats} from '../src/lib/builder/legality.js';
import {featOptions} from '../src/lib/wizard/options.js';
import {levelerChoiceSlots} from '../src/lib/leveler-progression.js';
import {proficienciesAt,proficiencyBonus,skillTraining,loreName} from '../src/lib/builder/rules.js';
import * as E from '../src/lib/builder/equipment.js';
import * as G from '../src/lib/builder/grants.js';
import {creationSteps} from '../src/lib/builder/schema.js';
import {emptyCreation,projectView} from '../src/lib/leveler-format.js';

const catalog=indexCatalog(bundle);
const lookup=uuid=>catalog.get(uuid);
const feat=name=>catalog.ofType('feat').find(f=>f.name===name);
const names=featNameIndex(catalog);
function fighter(){
  let d=emptyCreation();
  d=C.setAncestry(d,catalog.ofType('ancestry').find(a=>a.name==='Human'));
  d=C.setHeritage(d,catalog.ofType('heritage').find(h=>h.name==='Versatile Human'));
  d=C.setBackground(d,catalog.ofType('background').find(b=>b.name==='Guard'));
  d=C.setClass(d,catalog.ofType('class').find(c=>c.name==='Fighter'));
  return {...d,skills:['athletics','acrobatics']};
}
const slotsFor=creation=>levelerChoiceSlots(catalog.get(creation.class.uuid),null,{freeArchetype:true}).slots;

test('feat options are filtered to legal by default, with reasons for the rest',()=>{
  const creation=fighter();
  const plan=P.ensurePlan(null,creation);
  const state=buildState(creation,plan,lookup,2,{});
  const options=featOptions(catalog,'class',creation);
  const legal=options.filter(f=>!checkFeat(f,state,{kind:'class',featNames:names}).blocked).map(f=>f.name);
  assert.ok(legal.includes('Intimidating Strike'));
  assert.ok(legal.includes('Scout Dedication'),'archetype dedications are offered in class slots');
  assert.ok(!legal.includes('Reach Spell'),'other classes’ feats are not offered');
  assert.equal(checkFeat(feat('Brutal Finish'),state,{featNames:names}).blocked,'Level 12 feat');
  assert.equal(checkFeat(feat('Medic Dedication'),state,{featNames:names}).blocked,'Needs Trained in Medicine');
  assert.equal(checkFeat(feat('Doctor’s Visitation'),buildState(creation,plan,lookup,4,{}),{featNames:names}).blocked,
    'Level 4 feat'.replace('Level 4 feat','Needs the feat Medic Dedication first'));
});

test('skill ranks follow training and planned increases; caps by level',()=>{
  const creation=fighter();
  let plan=P.ensurePlan(null,creation);
  const slot3=slotsFor(creation).find(s=>s.key==='skill-increase-3');
  plan=P.setSkillIncrease(plan,slot3,'medicine',1);
  assert.equal(skillRanks(creation,plan,lookup,2).get('medicine'),undefined);
  assert.equal(skillRanks(creation,plan,lookup,3).get('medicine'),1);
  assert.equal(skillRanks(creation,plan,lookup,3).get('intimidation'),1,'Guard trains Intimidation');
  assert.equal(skillRanks(creation,plan,lookup,3).get('legal lore'),1);
  assert.deepEqual([maxSkillRank(3),maxSkillRank(7),maxSkillRank(15)],[2,3,4]);
  // Medic Dedication becomes legal once Medicine is trained.
  assert.equal(checkFeat(feat('Medic Dedication'),buildState(creation,plan,lookup,4,{}),{featNames:names}).blocked,null);
});

test('feats taken earlier satisfy prerequisites; repeats and dedication lock are enforced',()=>{
  const creation=C.setFeat(fighter(),'class',feat('Power Attack'));
  let plan=P.ensurePlan(null,creation);
  const slots=slotsFor(creation);
  const class2=slots.find(s=>s.key==='class-2'),arch2={key:'archetype-2',level:2,kind:'archetype'};
  plan=P.setPlanFeat(plan,arch2,feat('Scout Dedication'));
  const state4=buildState(creation,plan,lookup,4,{});
  assert.equal(checkFeat(feat('Power Attack'),state4,{featNames:names}).blocked,'Already taken at level 1');
  assert.equal(checkFeat(feat('General Training'),buildState(C.setFeat(creation,'ancestry',feat('General Training')),plan,lookup,5,{}),
    {kind:'ancestry',featNames:names}).blocked,null,'maxTakable allows repeats');
  assert.equal(checkFeat(feat('Medic Dedication'),state4,{featNames:names}).blocked,'Take two feats from your current archetype first');
  assert.equal(checkFeat(feat('Medic Dedication'),buildState(creation,plan,lookup,4,{ignoreArchetypeDedicationLock:true}),{featNames:names}).blocked,
    'Needs Trained in Medicine','the lock respects Leveler’s setting');
  assert.equal(takenFeats(creation,P.setPlanFeat(plan,class2,feat('Lunge'))).map(f=>f.name).join(),'Power Attack,Lunge,Scout Dedication');
});

test('plan edits keep Leveler shapes: feats, boosts, skill increase sources, spells',()=>{
  const creation=fighter();
  let plan=P.ensurePlan(null,creation);
  assert.equal(plan.classSlug,'fighter');
  const slots=slotsFor(creation);
  const class2=slots.find(s=>s.key==='class-2');
  plan=P.setPlanFeat(plan,class2,feat('Lunge'));
  assert.equal(P.planFeat(plan,class2).name,'Lunge');
  assert.equal(plan.levels[2].classFeats[0].level,2);
  plan=P.setPlanFeat(plan,class2,null);
  assert.deepEqual(plan.levels[2].classFeats,[]);
  for(const a of ['str','dex','con','wis','int'])plan=P.toggleLevelBoost(plan,5,a,4);
  assert.deepEqual(P.planBoosts(plan,5),['str','dex','con','wis'],'a full boost set never replaces a pick');
  const sourced={key:'skill-increase-3-rogue',level:3,kind:'skillIncrease',choiceSource:'Rogue'};
  plan=P.setSkillIncrease(plan,sourced,'stealth',1);
  plan=P.setSkillIncrease(plan,slots.find(s=>s.key==='skill-increase-3'),'athletics',2);
  assert.deepEqual(plan.levels[3].skillIncreases,[{skill:'stealth',toRank:1,source:'Rogue'},{skill:'athletics',toRank:2}]);
  assert.equal(P.planSkillIncrease(plan,sourced).skill,'stealth');
  const fireball=catalog.ofType('spell').find(s=>s.name==='Fireball');
  plan=P.togglePlanSpell(plan,5,fireball,{rank:3,cantrip:false});
  assert.equal(P.planSpells(plan,5)[0].rank,3);
  assert.equal(projectView({leveler:{creation,plan}}).spells['5:rank-3'][0],fireball.uuid);
  plan=P.togglePlanSpell(plan,5,fireball,{rank:3,cantrip:false});
  assert.equal(P.planSpells(plan,5).length,0);
});

test('spells learned at one level are known for the rest of the plan',()=>{
  let plan=P.ensurePlan(null,{class:{slug:'wizard'}});
  const shield=catalog.ofType('spell').find(s=>s.name==='Shield');
  const fireball=catalog.ofType('spell').find(s=>s.name==='Fireball');
  const creation={spells:{cantrips:[{uuid:shield.uuid,name:shield.name}],rank1:[]}};
  plan=P.togglePlanSpell(plan,3,fireball,{rank:3,cantrip:false});
  plan=P.togglePlanSpell(plan,5,fireball,{rank:3,cantrip:false});
  const learned=P.learnedSpellLevels(creation,plan);
  assert.equal(learned.get(shield.uuid),1);
  assert.equal(learned.get(fireball.uuid),3,'the earliest level wins');
});

test('proficiencies rise with class features at the right level',()=>{
  const wizard=catalog.ofType('class').find(c=>c.name==='Wizard');
  const creation={class:{uuid:wizard.uuid,slug:'wizard',name:'Wizard'}};
  assert.equal(proficienciesAt(creation,lookup,1).reflex,1);
  assert.equal(proficienciesAt(creation,lookup,5).reflex,2);
  assert.equal(proficienciesAt(creation,lookup,1).will,2);
  assert.equal(proficiencyBonus(2,5),9);
  assert.equal(proficiencyBonus(0,5),0);
});

test('equipment wishlist: prices, consumables, grouping by target level',()=>{
  const items=E.itemOptions(catalog);
  const potion=items.find(i=>i.name==='Minor Healing Potion');
  const caltrops=items.find(i=>i.name==='Caltrops');
  const bag=items.find(i=>i.name.startsWith('Bag of Holding'));
  assert.equal(E.priceGp(caltrops),0.3);
  assert.equal(E.formatPrice(0.3),'3 sp');
  assert.equal(E.formatPrice(75),'75 gp');
  assert.ok(E.isConsumable(potion)&&!E.isConsumable(bag));
  let planner={modifiers:[],notes:''};
  planner=E.addWish(planner,potion,8);
  planner=E.addWish(planner,bag,4);
  planner=E.addWish(planner,potion,8);
  const potionWish=E.wishlist(planner).find(w=>w.uuid===potion.uuid);
  planner=E.updateWish(planner,potionWish.id,{quantity:3});
  const groups=E.wishesByLevel(planner);
  assert.deepEqual(groups.map(g=>g.level),[4,8]);
  assert.equal(groups[1].items.length,2);
  assert.equal(groups[1].total,16,'3 + 1 potions at 4 gp');
  planner=E.removeWish(planner,potionWish.id);
  assert.equal(E.wishlist(planner).length,2);
  assert.equal(planner.notes,'','other planner fields survive');
});

test('alchemist formulas follow Leveler: 4 + 2 at level 1, 2 per level, filtered and stored as featGrants',()=>{
  let creation=fighter();
  creation=C.setClass(creation,catalog.ofType('class').find(c=>c.name==='Alchemist'));
  const requirements=G.creationGrantRequirements(creation,lookup);
  assert.deepEqual(requirements.map(r=>[r.sourceFeatName,r.count]),[['Alchemical Crafting',4],['Formula Book',2]]);
  const candidates=G.grantCandidates(catalog,requirements[0],{maxLevelCap:1}).map(i=>i.name);
  assert.ok(candidates.includes("Lesser Alchemist's Fire"));
  assert.ok(!candidates.includes("Moderate Alchemist's Fire"),'level-1 formulas only');
  assert.ok(!candidates.includes('Minor Healing Potion'),'alchemical items only');
  const fire=catalog.ofType('consumable').find(i=>i.name==="Lesser Alchemist's Fire");
  creation=G.toggleGrantSelection(creation,requirements[0],fire);
  assert.equal(creation.featGrants[0].requirementId,requirements[0].id);
  assert.equal(creation.featGrants[0].sourceFeatUuid,creation.class.uuid,'Leveler applies grants whose source is the class');
  assert.equal(G.grantSelections(creation,requirements[0])[0].uuid,fire.uuid);
  assert.equal(G.takenFormulas(creation,null).get(fire.uuid),1);
  creation=G.toggleGrantSelection(creation,requirements[0],fire);
  assert.deepEqual(creation.featGrants,[],'empty grants are dropped');
  const steps=creationSteps(creation,lookup,{});
  assert.ok(steps.some(s=>s.id==='grants'&&s.label==='Formulas'&&!s.complete));

  const plan=P.ensurePlan(null,creation);
  const level2=G.levelGrantRequirements(creation,plan,lookup,2);
  assert.deepEqual(level2.map(r=>[r.id,r.count,r.filters.maxLevel]),[['class:alchemist:formula-book-level-2-formula',2,2]]);
});

test('feats that grant formulas ask for them at the level they are taken',()=>{
  const creation=fighter();
  let plan=P.ensurePlan(null,creation);
  const slot=slotsFor(creation).find(s=>s.key==='skill-2');
  plan=P.setPlanFeat(plan,slot,feat('Alchemical Crafting'));
  const requirements=G.levelGrantRequirements(creation,plan,lookup,2);
  assert.equal(requirements.length,1);
  assert.equal(requirements[0].count,4);
  assert.equal(requirements[0].kind,'formula');
});

test('a dual class casts from its own entry, like Leveler',()=>{
  const fighterClass=catalog.ofType('class').find(c=>c.name==='Fighter');
  const wizard=catalog.ofType('class').find(c=>c.name==='Wizard');
  const {slots}=levelerChoiceSlots(fighterClass,wizard,{dualClass:true});
  const dual=slots.filter(s=>s.type==='spells');
  assert.ok(dual.some(s=>s.key==='dual-spells-1'&&s.entryType==='class:wizard'&&s.tradition==='arcane'));
  assert.ok(dual.some(s=>s.key==='dual-spells-3'&&s.entryType==='class:wizard'));
  let plan=P.ensurePlan(null,fighter());
  const shield=catalog.ofType('spell').find(s=>s.name==='Shield');
  plan=P.togglePlanSpell(plan,3,shield,{rank:1,cantrip:false,entryType:'class:wizard'});
  assert.equal(P.planSpells(plan,3).length,0,'not in the primary entry');
  assert.equal(P.planSpells(plan,3,'class:wizard')[0].entryType,'class:wizard');
  assert.equal(P.learnedSpellLevels(null,plan,'class:wizard').get(shield.uuid),3);

  let creation=fighter();
  creation=C.setDualClass(creation,wizard);
  const steps=creationSteps(creation,lookup,{dualClass:true});
  const spellSteps=steps.filter(s=>s.stepId==='spells');
  assert.deepEqual(spellSteps.map(s=>[s.id,s.target]),[['spells-dual','dualClass']]);
  creation=C.toggleSpell(creation,shield,{cantrip:false,max:2,target:'secondary'});
  assert.equal(creation.dualSpells.rank1[0].uuid,shield.uuid);
  assert.equal(P.learnedSpellLevels(creation,null,'class:wizard').get(shield.uuid),1);
});

test('skill picks follow Leveler for dual class; stale picks never block the last one',()=>{
  let creation=fighter();
  creation=C.setBackground(creation,catalog.ofType('background').find(b=>b.name==='Scholar'));
  creation=C.setDualClass(creation,catalog.ofType('class').find(c=>c.name==='Wizard'));
  // Picked before the background/second class made them automatic:
  creation={...creation,skills:['arcana','athletics','acrobatics']};
  const training=skillTraining(creation,lookup,0);
  assert.ok(training.granted.has('arcana'),'the dual class trains its skills too');
  assert.equal(training.duplicates,1,'Scholar repeats a class skill (Arcana), so one more pick');
  assert.equal(training.choices,4,'larger additional count (3) + duplicate');
  assert.deepEqual(training.chosen,['athletics','acrobatics']);
  for(const skill of ['stealth','society'])creation=C.toggleSkill(creation,skill,skillTraining(creation,lookup,0));
  assert.deepEqual(creation.skills,['athletics','acrobatics','stealth','society'],'stale Arcana was dropped, all four picks fit');
  creation=C.toggleSkill(creation,'nature',skillTraining(creation,lookup,0));
  assert.equal(creation.skills.length,4,'no fifth pick');
  creation=C.toggleSkill(creation,'society',skillTraining(creation,lookup,0));
  creation=C.toggleLore(creation,'Warfare Lore',skillTraining(creation,lookup,0));
  assert.deepEqual(creation.selectedLoreSkills,['Warfare Lore'],'an extra lore uses a skill pick');
  assert.equal(skillRanks(creation,null,lookup,1).get('warfare lore'),1);
  assert.equal(loreName('underworld'),'Underworld Lore');
});

test('gradual boosts: one attribute once per set of four levels',()=>{
  let plan=P.ensurePlan(null,fighter());
  plan=P.toggleLevelBoost(plan,2,'str',1,{gradual:true});
  plan=P.toggleLevelBoost(plan,3,'str',1,{gradual:true});
  assert.deepEqual(P.planBoosts(plan,3),[],'Strength was already boosted at level 2 in this set');
  plan=P.toggleLevelBoost(plan,3,'dex',1,{gradual:true});
  assert.deepEqual(P.planBoosts(plan,3),['dex']);
  assert.deepEqual([...P.boostsUsedInSet(plan,4).keys()].sort(),['dex','str']);
  plan=P.toggleLevelBoost(plan,7,'str',1,{gradual:true});
  assert.deepEqual(P.planBoosts(plan,7),['str'],'a new set starts at level 7');
  assert.deepEqual(P.gradualSet(9),[7,8,9,10]);
});

test('extra feats and skill increases from the GM count like any other',()=>{
  const creation=fighter();
  let plan=P.ensurePlan(null,creation);
  plan=P.addCustomFeat(plan,4,feat('Power Attack'));
  plan=P.addCustomSkillIncrease(plan,4,'athletics',2);
  assert.equal(P.customFeats(plan,4)[0].name,'Power Attack');
  assert.deepEqual(plan.levels[4].customSkillIncreases,[{skill:'athletics',toRank:2}]);
  assert.equal(skillRanks(creation,plan,lookup,4).get('athletics'),2);
  // Brutal Finish needs Power Attack: satisfied by the bonus feat.
  const state=buildState(creation,plan,lookup,12,{});
  assert.equal(checkFeat(feat('Brutal Finish'),state,{kind:'class',featNames:names}).blocked,null);
  plan=P.removeCustomFeat(plan,4,0);
  assert.deepEqual(P.customFeats(plan,4),[]);
});
