import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './fixtures/catalog.mjs';
import {indexCatalog} from '../src/lib/builder/catalog.js';
import * as C from '../src/lib/builder/creation.js';
import * as P from '../src/lib/builder/plan.js';
import {buildState,checkFeat,featNameIndex,skillRanks,maxSkillRank,takenFeats} from '../src/lib/builder/legality.js';
import {featOptions} from '../src/lib/wizard/options.js';
import {levelerChoiceSlots} from '../src/lib/leveler-progression.js';
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
