import test from 'node:test';
import assert from 'node:assert/strict';
import {indexCatalog} from '../src/lib/builder/catalog.js';
import {derive,addLevel,setChoice,setSubclass,spellOptions,featOptions,editionMatches,expandPool,summaryLabels}
  from '../src/lib/systems/dnd5e/build.js';
import {casterLevel,slotsForCasterLevel,multiclassRequirement,meetsRequirement,pointBuyCost,scoresValid,proficiencyBonus}
  from '../src/lib/systems/dnd5e/rules.js';

const U=id=>'Compendium.dnd5e.items.Item.'+id;
const item=(id,type,name,metadata={})=>({uuid:U(id),name,type,level:metadata.level??null,traits:[],metadata});
const variants={rulesVersion:'legacy',allowFeats:true,
  skills:{ath:{label:'Athletics',ability:'str'},acr:{label:'Acrobatics',ability:'dex'},prc:{label:'Perception',ability:'wis'},arc:{label:'Arcana',ability:'int'}},
  traits:{skills:{'skills:ath':{label:'Athletics'},'skills:acr':{label:'Acrobatics'},'skills:prc':{label:'Perception'},'skills:arc':{label:'Arcana'}},
    languages:{'languages:standard':{label:'Standard',group:true},'languages:standard:common':{label:'Common'},'languages:standard:elvish':{label:'Elvish'},
      'languages:standard:dwarvish':{label:'Dwarvish'}}}};
const fighter=item('fighter','class','Fighter',{identifier:'fighter',hitDie:'d10',spellcasting:{progression:'none'},
  advancement:[
    {_id:'hp',type:'HitPoints',configuration:{}},
    {_id:'saves',type:'Trait',level:1,classRestriction:'primary',configuration:{grants:['saves:str','saves:con']}},
    {_id:'skills',type:'Trait',level:1,classRestriction:'primary',configuration:{choices:[{count:2,pool:['skills:ath','skills:acr','skills:prc']}]}},
    {_id:'mc',type:'Trait',level:1,classRestriction:'secondary',configuration:{grants:['armor:lgt']}},
    {_id:'sw',type:'ItemGrant',level:1,configuration:{items:[{uuid:U('second-wind')}]}},
    {_id:'sub',type:'Subclass',level:3,configuration:{}},
    {_id:'asi4',type:'AbilityScoreImprovement',level:4,configuration:{points:2,cap:2}},
    {_id:'surge',type:'ScaleValue',configuration:{identifier:'action-surge',type:'number',scale:{2:{value:1},17:{value:2}}}}
  ]});
const wizard=item('wizard','class','Wizard',{identifier:'wizard',hitDie:'d6',spellcasting:{progression:'full',ability:'int'},
  advancement:[{_id:'saves',type:'Trait',level:1,classRestriction:'primary',configuration:{grants:['saves:int','saves:wis']}}]});
const champion=item('champion','subclass','Champion',{classIdentifier:'fighter',advancement:[
  {_id:'crit',type:'ItemGrant',level:3,configuration:{items:[{uuid:U('improved-critical')}]}}]});
const elf=item('elf','race','Elf',{edition:'2014',advancement:[
  {_id:'asi',type:'AbilityScoreImprovement',level:0,configuration:{fixed:{dex:2},points:0}},
  {_id:'lang',type:'Trait',level:0,configuration:{grants:['languages:standard:common','languages:standard:elvish'],
    choices:[{count:1,pool:['languages:standard:*']}]}}]});
const sage=item('sage','background','Sage',{advancement:[{_id:'sk',type:'Trait',level:1,configuration:{grants:['skills:arc']}}]});
const catalog=indexCatalog({items:[fighter,wizard,champion,elf,sage,
  item('second-wind','feat','Second Wind',{featType:'class'}),item('improved-critical','feat','Improved Critical',{featType:'class'}),
  item('alert','feat','Alert',{featType:'feat'}),item('tough','feat','Tough',{featType:'feat',edition:'2024'}),
  item('fire-bolt','spell','Fire Bolt',{level:0,spellLists:['class:wizard']}),
  item('magic-missile','spell','Magic Missile',{level:1,spellLists:['class:wizard']}),
  item('fireball','spell','Fireball',{level:3,spellLists:['class:wizard','class:sorcerer']}),
  item('cure-wounds','spell','Cure Wounds',{level:1,spellLists:['class:cleric']})]});

function plan(){
  let b={abilities:{method:'standard',base:{str:15,dex:13,con:14,int:12,wis:10,cha:8}},
    speciesUuid:elf.uuid,backgroundUuid:sage.uuid,levels:[],subclasses:{},choices:{},spells:{},feats:[],hp:'average'};
  for(let i=0;i<4;i++)b=addLevel(b,fighter.uuid);
  return b;
}

test('ability methods, proficiency and slot tables',()=>{
  assert.equal(pointBuyCost({str:15,dex:15,con:15,int:8,wis:8,cha:8}),27);
  assert.ok(scoresValid('standard',{str:15,dex:14,con:13,int:12,wis:10,cha:8}));
  assert.ok(!scoresValid('standard',{str:15,dex:15,con:13,int:12,wis:10,cha:8}));
  assert.deepEqual([1,4,5,9,13,17].map(proficiencyBonus),[2,2,3,4,5,6]);
  assert.equal(casterLevel('half',1),0,'2014 paladins get slots at 2');
  assert.equal(casterLevel('half',1,{modern:true}),1,'2024 half casters start at 1');
  assert.equal(casterLevel('half',5,{multiclass:true}),2);
  assert.equal(casterLevel('third',3),1);
  assert.equal(casterLevel('third',4,{multiclass:true}),1);
  assert.deepEqual(slotsForCasterLevel(5),[4,3,2]);
});

test('class advancement drives levels: skills, saves, features, subclass, ASI, scale values',()=>{
  let b=plan();
  let d=derive(b,catalog,variants);
  assert.equal(d.level,4);
  assert.deepEqual([...d.proficiencies.saves].sort(),['con','str']);
  assert.ok(!d.proficiencies.armor.has('armor:lgt'),'multiclass-only grants skip the starting class');
  assert.equal(d.proficiencies.skills.get('arc'),1,'background skill');
  const skillCard=d.pages[0].choices.find(c=>c.kind==='trait'&&c.key.includes('|skills|'));
  assert.equal(skillCard.count,2);
  assert.deepEqual(skillCard.options,['skills:ath','skills:acr','skills:prc']);
  b=setChoice(b,skillCard.key,['skills:ath','skills:prc']);
  const langCard=d.pages[0].choices.find(c=>c.kind==='trait'&&c.key.includes('|lang|'));
  assert.deepEqual(langCard.options,['languages:standard:dwarvish'],'already-known languages are not offered');
  assert.ok(d.pages[0].features.some(f=>f.name==='Second Wind'));
  const subCard=d.pages[2].choices.find(c=>c.kind==='subclass');
  assert.ok(subCard&&!subCard.done);
  b=setSubclass(b,fighter.uuid,champion.uuid);
  const asi=d.pages[3].choices.find(c=>c.kind==='asi');
  assert.ok(asi.featAllowed);
  b=setChoice(b,asi.key,{mode:'asi',points:{str:2}});
  d=derive(b,catalog,variants);
  assert.equal(d.scores.str,17);
  assert.equal(d.scores.dex,15,'elf +2 Dex');
  assert.equal(d.proficiencies.skills.get('ath'),1);
  assert.ok(d.pages[2].features.some(f=>f.name==='Improved Critical'));
  assert.equal(d.hp,10+3*6+2*4,'max d10 then average 6, +2 Con per level');
  assert.equal(d.scales.find(s=>s.id==='action-surge').value,'1');
  assert.equal(summaryLabels(d).classes,'Fighter 4 (Champion)');
  b=setChoice(b,asi.key,{mode:'feat',uuid:U('alert')});
  d=derive(b,catalog,variants);
  assert.equal(d.scores.str,15);
  assert.deepEqual(d.feats.map(f=>f.uuid),[U('alert')]);
});

test('multiclassing checks prerequisites and combines spell slots',()=>{
  let b=plan();
  b=addLevel(b,wizard.uuid);
  let d=derive(b,catalog,variants);
  assert.ok(d.pages[4].multiclassProblem,'Int 12 is below 13');
  assert.ok(!d.proficiencies.saves.has('int'),'only the starting class grants saves');
  b={...b,abilities:{...b.abilities,base:{...b.abilities.base,int:13,str:12}}};
  d=derive(b,catalog,variants);
  assert.ok(!d.pages[4].multiclassProblem);
  assert.equal(d.pages[4].classLevel,1);
  assert.deepEqual(d.spellcasting.slots,[2]);
  const wiz=d.classes.find(c=>c.uuid===wizard.uuid);
  assert.deepEqual(spellOptions(catalog,wiz,variants).map(s=>s.name).sort(),['Fire Bolt','Magic Missile']);
  assert.deepEqual(multiclassRequirement(fighter,variants),[['str'],['dex']]);
  assert.ok(meetsRequirement([['str'],['dex']],{str:8,dex:13}));
});

test('editions and wildcard pools',()=>{
  assert.ok(editionMatches(elf,variants));
  assert.ok(!editionMatches(catalog.get(U('tough')),variants));
  assert.ok(editionMatches(catalog.get(U('tough')),{rulesVersion:'modern'}));
  assert.deepEqual(featOptions(catalog,variants,4).map(f=>f.name),['Alert']);
  assert.deepEqual(expandPool(['languages:standard'],variants).length,3);
});
