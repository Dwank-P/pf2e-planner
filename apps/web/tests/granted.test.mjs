import test from 'node:test';
import assert from 'node:assert/strict';
import {indexCatalog} from '../src/lib/builder/catalog.js';
import {grantsAt,grantedNewAt,predicateHolds} from '../src/lib/builder/granted.js';
import {buildState,checkFeat,skillRanks} from '../src/lib/builder/legality.js';
import {proficienciesAt} from '../src/lib/builder/rules.js';
import {choiceSetsFor} from '../src/lib/builder/choice-sets.js';

const U=id=>'Compendium.pf2e.classfeatures.Item.'+id;
const F=id=>'Compendium.pf2e.feats-srd.Item.'+id;
// The PF2e data as the Bridge exports it (ruleEffects), cleric/Warpriest per the system's packs.
const items=[
  {uuid:'Compendium.pf2e.classes.Item.cleric',name:'Cleric',type:'class',metadata:{slug:'cleric',
    grantedFeatures:[{name:'Doctrine',level:1,uuid:U('doctrine')},{name:'First Doctrine',level:1,uuid:U('first')},
      {name:'Third Doctrine',level:7,uuid:U('third')}],
    rules:{defenses:{unarmored:{rank:1},light:{rank:0},medium:{rank:0}},savingThrows:{fortitude:1,reflex:1,will:2},perception:1}}},
  {uuid:U('doctrine'),name:'Doctrine',type:'feat',metadata:{featType:'classfeature',slug:'doctrine',
    ruleEffects:[{key:'grant',uuid:'{item|flags.pf2e.rulesSelections.doctrine}'}]}},
  {uuid:U('first'),name:'First Doctrine',type:'feat',metadata:{featType:'classfeature',slug:'first-doctrine',
    ruleEffects:[{key:'grant',uuid:'{actor|flags.pf2e.cleric.firstDoctrine}'}]}},
  {uuid:U('third'),name:'Third Doctrine',type:'feat',metadata:{featType:'classfeature',slug:'third-doctrine',
    ruleEffects:[{key:'grant',uuid:'{actor|flags.pf2e.cleric.thirdDoctrine}'}]}},
  {uuid:U('warpriest'),name:'Warpriest',type:'feat',metadata:{featType:'classfeature',slug:'warpriest',
    ruleEffects:[{key:'flag',path:'flags.pf2e.cleric',mode:'override',value:{
      firstDoctrine:'Compendium.pf2e.classfeatures.Item.First Doctrine (Warpriest)',
      thirdDoctrine:'Compendium.pf2e.classfeatures.Item.Third Doctrine (Warpriest)'}}]}},
  {uuid:U('fdw'),name:'First Doctrine (Warpriest)',type:'feat',metadata:{featType:'classfeature',slug:'first-doctrine-warpriest',
    ruleEffects:[{key:'grant',uuid:'Compendium.pf2e.feats-srd.Item.Shield Block'},
      {key:'rank',path:'system.proficiencies.defenses.light.rank',mode:'upgrade',value:2,predicate:[{gte:['self:level',13]},'feature:divine-defense']},
      {key:'rank',path:'system.proficiencies.defenses.medium.rank',mode:'upgrade',value:1},
      {key:'grant',uuid:'Compendium.pf2e.feats-srd.Item.Deadly Simplicity'}]}},
  {uuid:U('tdw'),name:'Third Doctrine (Warpriest)',type:'feat',metadata:{featType:'classfeature',slug:'third-doctrine-warpriest'}},
  {uuid:U('divine-defense'),name:'Divine Defense',type:'feat',metadata:{featType:'classfeature',slug:'divine-defense'}},
  {uuid:F('sb'),name:'Shield Block',type:'feat',level:1,traits:['general'],metadata:{featType:'general',slug:'shield-block'}},
  {uuid:F('ds'),name:'Deadly Simplicity',type:'feat',level:1,metadata:{featType:'classfeature',slug:'deadly-simplicity'}},
  {uuid:F('ra'),name:'Reactive Strike',type:'feat',level:2,metadata:{featType:'general',slug:'reactive-strike',prerequisites:['Shield Block']}},
  {uuid:F('canny'),name:'Canny Acumen',type:'feat',level:3,metadata:{featType:'general',slug:'canny-acumen',
    ruleEffects:[{key:'rank',path:'system.skills.ste.rank',mode:'upgrade',value:2},{key:'grant',uuid:F('picked-later')}]}}
];
const catalog=indexCatalog({items});
const creation={class:{uuid:'Compendium.pf2e.classes.Item.cleric',name:'Cleric'},subclass:{uuid:U('warpriest'),name:'Warpriest'}};

test('Warpriest grants Shield Block through First Doctrine and the cleric flags', () => {
  const at1=grantsAt(creation,null,catalog.get,1);
  assert.deepEqual(at1.granted.map(g=>g.item.name).sort(),['Deadly Simplicity','First Doctrine (Warpriest)','Shield Block']);
  assert.equal(at1.granted.find(g=>g.item.name==='Shield Block').from,'First Doctrine (Warpriest)');
  assert.ok(!grantsAt(creation,null,catalog.get,6).granted.some(g=>g.item.name==='Third Doctrine (Warpriest)'));
  assert.deepEqual(grantedNewAt(creation,null,catalog.get,7).map(g=>g.item.name),['Third Doctrine (Warpriest)']);
  // Without a doctrine nothing is guessed.
  assert.equal(grantsAt({class:creation.class},null,catalog.get,1).granted.length,0);
});

test('granted feats meet prerequisites and are not offered again', () => {
  const state=buildState(creation,null,catalog.get,2);
  const shieldBlock=catalog.get(F('sb'));
  const verdict=checkFeat(shieldBlock,state,{kind:'general'});
  assert.equal(verdict.blocked,'Already granted by First Doctrine (Warpriest)');
  assert.equal(verdict.hard,true);
  assert.equal(checkFeat(catalog.get(F('ra')),state,{kind:'general'}).blocked,null,'Prerequisite Shield Block is met');
  // Picked earlier anyway: shown as a warning, not a hard block.
  const plan={levels:{2:{generalFeats:[{uuid:F('sb'),name:'Shield Block'}]}}};
  const own=checkFeat(shieldBlock,buildState(creation,plan,catalog.get,2),{kind:'general',currentUuid:F('sb')});
  assert.equal(own.hard,false);
});

test('rank upgrades follow predicates', () => {
  assert.equal(proficienciesAt(creation,catalog.get,1).medium,1,'Warpriest medium armor');
  assert.equal(proficienciesAt(creation,catalog.get,13).light,0,'Needs Divine Defense too');
  assert.equal(predicateHolds([{gte:['self:level',13]},'feature:divine-defense'],{level:13,features:new Set(['divine-defense']),feats:new Set(),classes:new Set()}),true);
  assert.equal(predicateHolds('self:effect:raised-shield',{level:5,features:new Set(),feats:new Set(),classes:new Set()}),false);
  const plan={levels:{3:{generalFeats:[{uuid:F('canny'),name:'Canny Acumen'}]}}};
  assert.equal(skillRanks(creation,plan,catalog.get,3).get('stealth'),2,'Legacy skill keys map to names');
});

test('name references resolve and fixed grants show in feat choices', () => {
  assert.equal(catalog.get('Compendium.pf2e.feats-srd.Item.shield block')?.uuid,F('sb'));
  assert.equal(catalog.get('Compendium.pf2e.feats-srd.Item.Nope'),null);
  const result=choiceSetsFor(catalog.get(U('fdw')),{},catalog);
  assert.deepEqual(result.grants.map(g=>g.name),['Shield Block','Deadly Simplicity']);
});
