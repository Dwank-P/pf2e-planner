import test from 'node:test';
import assert from 'node:assert/strict';
import {applyView,combineViews,documentFromLeveler,emptyDocument,isCharacterDocument,
  levelerCreationExport,levelerPlanExport,projectView,viewUuids} from '../src/lib/leveler-format.js';

const U=name=>'Compendium.pf2e.test.Item.'+name;
const catalog={
  [U('Fighter')]:{uuid:U('Fighter'),name:'Fighter',type:'class',traits:[],
    metadata:{slug:'fighter',trainedSkills:['athletics'],
      levelerProgression:{slug:'fighter',keyAbility:['str','dex']}}},
  [U('Human')]:{uuid:U('Human'),name:'Human',type:'ancestry',traits:['human','humanoid'],metadata:{slug:'human'}},
  [U('PowerAttack')]:{uuid:U('PowerAttack'),name:'Power Attack',type:'feat',level:1,traits:['fighter'],metadata:{slug:'power-attack'}},
  [U('SuddenCharge')]:{uuid:U('SuddenCharge'),name:'Sudden Charge',type:'feat',level:1,traits:['fighter'],metadata:{slug:'sudden-charge'}},
  [U('Toughness')]:{uuid:U('Toughness'),name:'Toughness',type:'feat',level:1,traits:['general'],metadata:{slug:'toughness'}},
  [U('Shield')]:{uuid:U('Shield'),name:'Shield',type:'spell',level:1,traits:['cantrip'],metadata:{spellRank:1,spellTraditions:['arcane']}},
  [U('Fireball')]:{uuid:U('Fireball'),name:'Fireball',type:'spell',level:3,traits:['fire'],metadata:{spellRank:3,spellTraditions:['arcane']}}
};
const resolve=uuid=>catalog[uuid]??null;
const view=extra=>({classUuid:null,secondClassUuid:null,ancestryUuid:null,heritageUuid:null,
  backgroundUuid:null,feats:{},abilityBoosts:{},skillIncreases:{},equipment:[],spells:{},
  modifiers:{str:0,dex:0,con:0,int:0,wis:0,cha:0},creationChoices:{},notes:'',...extra});

test('a builder view becomes Leveler creation + plan documents and projects back',()=>{
  const input=view({classUuid:U('Fighter'),ancestryUuid:U('Human'),
    feats:{'class-1':U('PowerAttack'),'class-2':U('SuddenCharge'),'general-3':U('Toughness')},
    abilityBoosts:{'free-1':['str','dex','con','wis'],'level-5':['str','dex','con','int']},
    skillIncreases:{'skill-increase-3':'athletics','skill-increase-5':'athletics'},
    spells:{'1:cantrip':[U('Shield')],'5:rank-3':[U('Fireball')]},notes:'Shield ally'});
  const doc=applyView(emptyDocument(),input,{resolve});
  assert.ok(isCharacterDocument(doc));
  const {creation,plan}=doc.leveler;
  assert.equal(creation.class.slug,'fighter');
  assert.deepEqual(creation.class.keyAbility,['str','dex']);
  assert.equal(creation.classFeat.uuid,U('PowerAttack'));
  assert.deepEqual(creation.boosts.free,['str','dex','con','wis']);
  assert.equal(creation.spells.cantrips[0].isCantrip,true);
  assert.equal(plan.classSlug,'fighter');
  assert.equal(plan.levels[2].classFeats[0].uuid,U('SuddenCharge'));
  assert.equal(plan.levels[2].classFeats[0].name,'Sudden Charge');
  assert.deepEqual(plan.levels[5].abilityBoosts,['str','dex','con','int']);
  // Fighter trains Athletics: increases go expert (2) then master (3).
  assert.deepEqual(plan.levels[3].skillIncreases,[{skill:'athletics',toRank:2}]);
  assert.deepEqual(plan.levels[5].skillIncreases,[{skill:'athletics',toRank:3}]);
  assert.equal(plan.levels[5].spells[0].rank,3);
  assert.equal(doc.planner.notes,'Shield ally');
  const back=projectView(doc);
  assert.deepEqual(back.feats,input.feats);
  assert.deepEqual(back.abilityBoosts,input.abilityBoosts);
  assert.deepEqual(back.skillIncreases,input.skillIncreases);
  assert.deepEqual(back.spells,input.spells);
  assert.equal(back.classUuid,U('Fighter'));
});

test('Leveler metadata on unchanged entries survives a website edit',()=>{
  const plan={version:1,classSlug:'fighter',dualClassSlug:null,levels:{
    2:{classFeats:[{uuid:U('SuddenCharge'),name:'Sudden Charge',skillRules:[{x:1}],
      coreMetadataVersion:3,choices:{weapon:'longsword'}}],skillFeats:[],reminders:[{featSlug:'x'}]},
    3:{skillIncreases:[{skill:'athletics',toRank:2,source:'Fighter'}],customFeats:[{uuid:'keep'}]}
  }};
  const creation={version:1,class:{uuid:U('Fighter'),slug:'fighter',name:'Fighter'},
    subclass:{name:'Weapon Mastery'},boosts:{free:['str']}};
  const doc=documentFromLeveler({creation,plan});
  const edited=projectView(doc);
  assert.equal(edited.skillIncreases['skill-increase-3-fighter'],'athletics');
  assert.equal(edited.creationChoices.subclass.name,'Weapon Mastery');
  edited.feats['general-3']=U('Toughness');
  const next=applyView(doc,edited,{resolve});
  assert.deepEqual(next.leveler.plan.levels[2].classFeats[0],plan.levels[2].classFeats[0]);
  assert.deepEqual(next.leveler.plan.levels[2].reminders,[{featSlug:'x'}]);
  assert.deepEqual(next.leveler.plan.levels[3].skillIncreases,plan.levels[3].skillIncreases);
  assert.deepEqual(next.leveler.plan.levels[3].customFeats,[{uuid:'keep'}]);
  assert.equal(next.leveler.plan.levels[3].generalFeats[0].uuid,U('Toughness'));
  assert.deepEqual(next.leveler.creation.subclass,{name:'Weapon Mastery'});
  assert.notEqual(next,doc,'input document is not mutated');
  assert.equal(doc.leveler.plan.levels[3].generalFeats,undefined);
});

test('removing and replacing choices updates the plan',()=>{
  const start=applyView(emptyDocument(),view({classUuid:U('Fighter'),
    feats:{'class-2':U('SuddenCharge')},spells:{'rank-3':[U('Fireball')]}}),{resolve});
  const next=applyView(start,view({classUuid:U('Fighter'),feats:{'class-2':U('PowerAttack')}}),{resolve});
  assert.equal(next.leveler.plan.levels[2].classFeats.length,1);
  assert.equal(next.leveler.plan.levels[2].classFeats[0].uuid,U('PowerAttack'));
  assert.deepEqual(projectView(next).spells,{});
});

test('spells are stored at the level they were learned; legacy rank keys still place',()=>{
  const doc=applyView(emptyDocument(),view({classUuid:U('Fighter'),
    spells:{'1:cantrip':[U('Shield')],'7:rank-3':[U('Fireball')]}}),{resolve});
  assert.equal(doc.leveler.creation.spells.cantrips[0].uuid,U('Shield'));
  assert.equal(doc.leveler.plan.levels[7].spells[0].uuid,U('Fireball'));
  assert.deepEqual(projectView(doc).spells,{'1:cantrip':[U('Shield')],'7:rank-3':[U('Fireball')]});
  // Moving a pick to another level moves the Leveler entry.
  const moved=applyView(doc,view({classUuid:U('Fighter'),
    spells:{'1:cantrip':[U('Shield')],'5:rank-3':[U('Fireball')]}}),{resolve});
  assert.equal(moved.leveler.plan.levels[7].spells.length,0);
  assert.equal(moved.leveler.plan.levels[5].spells[0].uuid,U('Fireball'));
  // Pre-0.7.1 views without a level: cantrips to creation, higher ranks by slot table.
  const legacy=applyView(emptyDocument(),view({classUuid:U('Fighter'),
    spells:{cantrip:[U('Shield')],'rank-3':[U('Fireball')]}}),{resolve});
  assert.equal(legacy.leveler.creation.spells.cantrips[0].uuid,U('Shield'));
  assert.equal(legacy.leveler.plan.levels[5].spells[0].uuid,U('Fireball'));
  // Level-1 spells alone (no plan-side choices) are still saved.
  const onlyCreation=applyView(emptyDocument(),view({spells:{'1:cantrip':[U('Shield')]}}),{resolve});
  assert.equal(onlyCreation.leveler.creation.spells.cantrips.length,1);
});

test('subclass slots write Leveler creation.subclass; name-only imports stay read-only',()=>{
  catalog[U('School')]={uuid:U('School'),name:'School of Battle Magic',type:'feat',traits:[],
    metadata:{slug:'school-of-battle-magic',otherTags:['wizard-arcane-school']}};
  const doc=applyView(emptyDocument(),view({classUuid:U('Fighter'),subclassUuid:U('School')}),{resolve});
  assert.equal(doc.leveler.creation.subclass.slug,'school-of-battle-magic');
  assert.deepEqual(doc.leveler.creation.subclass.choices,{});
  assert.equal(projectView(doc).subclassUuid,U('School'));
  const legacy=documentFromLeveler({creation:{version:1,subclass:{name:'Imported only'}}});
  const projected=projectView(legacy);
  assert.equal(projected.subclassUuid,null);
  assert.equal(projected.creationChoices.subclass.name,'Imported only');
  assert.equal(applyView(legacy,projected,{resolve}).leveler.creation.subclass.name,'Imported only');
});

test('skill increase sources come from the Leveler slot schedule',()=>{
  const doc=applyView(emptyDocument(),view({classUuid:U('Fighter'),
    skillIncreases:{'skill-increase-3-rogue-skill':'stealth'}}),
    {resolve,slots:[{type:'skill',key:'skill-increase-3-rogue-skill',choiceSource:'Rogue skill'}]});
  assert.deepEqual(doc.leveler.plan.levels[3].skillIncreases,
    [{skill:'stealth',toRank:1,source:'Rogue skill'}]);
  assert.deepEqual(projectView(doc).skillIncreases,{'skill-increase-3-rogue-skill':'stealth'});
});

test('unresolved references are kept with a marker rather than dropped',()=>{
  const missing='Compendium.pf2e.gone.Item.Missing';
  const doc=applyView(emptyDocument(),view({classUuid:U('Fighter'),feats:{'class-2':missing}}),{resolve});
  assert.equal(doc.leveler.plan.levels[2].classFeats[0].unresolved,true);
  assert.ok(viewUuids(projectView(doc)).includes(missing));
});

test('actor-derived choices only fill gaps in Leveler data',()=>{
  const fromLeveler=view({classUuid:U('Fighter'),feats:{'class-2':U('SuddenCharge')}});
  const fromActor=view({classUuid:U('Other'),ancestryUuid:U('Human'),
    feats:{'class-2':U('PowerAttack'),'general-3':U('Toughness')},equipment:[U('Shield')]});
  const merged=combineViews(fromLeveler,fromActor);
  assert.equal(merged.classUuid,U('Fighter'));
  assert.equal(merged.ancestryUuid,U('Human'));
  assert.deepEqual(merged.feats,{'class-2':U('SuddenCharge'),'general-3':U('Toughness')});
  assert.deepEqual(merged.equipment,[U('Shield')]);
});

test('exports match Leveler import formats',()=>{
  const doc=applyView(emptyDocument(),view({classUuid:U('Fighter'),feats:{'class-2':U('SuddenCharge')}}),{resolve});
  const plan=JSON.parse(levelerPlanExport(doc));
  assert.ok(plan.classSlug&&plan.levels&&plan.version,'passes Leveler importPlan checks');
  const creation=JSON.parse(levelerCreationExport(doc));
  assert.equal(creation.format,'pf2e-leveler-creation');
  assert.equal(typeof creation.data.version,'number');
  assert.equal(levelerPlanExport(emptyDocument()),null);
});
