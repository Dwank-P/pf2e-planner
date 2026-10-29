import test from 'node:test';
import assert from 'node:assert/strict';
import {originSummary} from '../src/lib/builder/origin-summary.js';
import {itemKind,facetsFor,matchesFacets} from '../src/lib/builder/item-filters.js';

const facts=s=>Object.fromEntries(s.facts);
const notes=s=>Object.fromEntries(s.notes);

test('PF2e ancestry and class summaries', () => {
  const elf={type:'ancestry',metadata:{rules:{hp:6,size:'med',speed:30,vision:'low-light-vision',
    boosts:{0:{value:['dex']},1:{value:['int']},2:{value:['str','dex','con','int','wis','cha']}},flaws:{0:{value:['con']}},
    languages:{value:['common','elven']},additionalLanguages:{count:0}}}};
  const s=originSummary(elf);
  assert.deepEqual(facts(s),{'Hit Points':'6',Size:'Medium',Speed:'30 ft.',Vision:'Low Light Vision'});
  assert.equal(notes(s).Boosts,'Dex, Int, Free');
  assert.equal(notes(s).Flaws,'Con');
  const bard={type:'class',metadata:{spellTradition:'occult',classFeatLevels:[1,2,4],skillFeatLevels:[2,4],
    grantedFeatures:[{name:'Muses',level:1},{name:'Signature Spells',level:3}],
    rules:{hp:8,keyAbility:{value:['cha']},perception:2,savingThrows:{fortitude:1,reflex:1,will:2},
      trainedSkills:{value:['occultism','performance'],additional:4},defenses:{unarmored:1,light:1},attacks:{simple:1,unarmed:1}}}};
  const c=originSummary(bard);
  assert.equal(facts(c)['Hit Points'],'8 + Con');
  assert.equal(facts(c)['Key attribute'],'Cha');
  assert.equal(notes(c).Saves,'Fortitude trained, Reflex trained, Will expert');
  assert.equal(facts(c).Spellcasting,'Occult');
  assert.equal(notes(c)['Trained skills'],'Occultism, Performance, 4 more + Int');
  assert.equal(notes(c)['Level 1 features'],'Muses');
  assert.equal(notes(c).Armor,'Unarmored, Light');
  assert.match(notes(c).Feats,/Class feats at 1, 2, 4/);
  assert.deepEqual(originSummary({type:'feat',metadata:{}}),{facts:[],notes:[]});
});

test('D&D 5e class summary from its advancements', () => {
  const wizard={type:'class',metadata:{hitDie:'d6',primaryAbility:{value:['int'],all:true},spellcasting:{progression:'full',ability:'int'},
    advancement:[{type:'Trait',level:1,configuration:{grants:['saves:int','saves:wis']}},
      {type:'Trait',level:1,configuration:{choices:[{count:2,pool:['skills:arc','skills:his']}]}},
      {type:'ItemGrant',level:1,title:'Spellcasting'}]}};
  const s=originSummary(wizard,{abilities:{int:{label:'Intelligence'},wis:{label:'Wisdom'}},skills:{arc:{label:'Arcana'},his:{label:'History'}}});
  assert.equal(facts(s)['Hit die'],'d6');
  assert.equal(facts(s).Saves,'Intelligence, Wisdom');
  assert.equal(facts(s).Spellcasting,'Full (Int)');
  assert.equal(notes(s).Skills,'choose 2 from Arcana, History');
});

test('weapon and armor filters', () => {
  const sword={type:'weapon',traits:['versatile-p'],metadata:{rules:{category:'martial',group:'sword',usage:{value:'held-in-one-hand'},damage:{die:'d8',damageType:'slashing'}}}};
  const bow={type:'weapon',traits:['deadly-d10'],metadata:{rules:{category:'martial',group:'bow',range:100,usage:{value:'held-in-one-plus-hands'},damage:{die:'d8',damageType:'piercing'}}}};
  const club={type:'weapon',traits:[],metadata:{rules:{category:'simple',group:'club',usage:{value:'held-in-one-hand'},damage:{die:'d6',damageType:'bludgeoning'}}}};
  const keys=Object.fromEntries(facetsFor('weapon',[sword,bow,club]).map(f=>[f.key,f.options.map(o=>o[0])]));
  assert.deepEqual(keys.die,['d6','d8']);
  assert.deepEqual(keys.hands.sort(),['1','1+']);
  assert.ok(matchesFacets('weapon',sword,{damage:'piercing'}),'Versatile P counts as piercing');
  assert.ok(!matchesFacets('weapon',club,{damage:'piercing'}));
  assert.ok(matchesFacets('weapon',bow,{reach:'ranged',trait:'deadly'}));
  const chain={type:'equipment',metadata:{armor:{type:'heavy',value:16,dex:null}}};
  const leather={type:'equipment',metadata:{armor:{type:'light',value:11,dex:null}}};
  assert.equal(itemKind(chain),'armor','D&D armor is browsed as armor');
  assert.equal(itemKind({type:'equipment',metadata:{armor:{type:'shield',value:2}}}),'shield');
  const armor=Object.fromEntries(facetsFor('armor',[chain,leather]).map(f=>[f.key,f.options]));
  assert.deepEqual(armor.dex,[['0','No Dex'],['none','No cap']]);
  assert.ok(matchesFacets('armor',chain,{category:'heavy',ac:'16'}));
});
