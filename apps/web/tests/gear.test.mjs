import test from 'node:test';
import assert from 'node:assert/strict';
import {equipped,itemBonuses,skillBonus,armorClass,canEquip,strike,runedName,runesOf} from '../src/lib/builder/gear.js';
import {setEquipped} from '../src/lib/builder/equipment.js';
import {proficiencyBonus} from '../src/lib/builder/rules.js';
import {armorClass5e,weaponAttack5e} from '../src/lib/systems/dnd5e/rules.js';

const items={
  chain:{uuid:'A',name:'Chain Mail',type:'armor',metadata:{rules:{category:'medium',acBonus:4,dexCap:1,checkPenalty:-2,speedPenalty:-5,strength:3,
    runes:{potency:1,resilient:1}}}},
  leather:{uuid:'B',name:'Leather Armor',type:'armor',metadata:{rules:{category:'light',acBonus:1,dexCap:4}}},
  shield:{uuid:'C',name:'Steel Shield',type:'shield',metadata:{rules:{acBonus:2}}},
  goggles:{uuid:'D',name:'Goggles',type:'equipment',metadata:{itemBonuses:[{selector:'perception',value:1},{selector:'athletics',value:2},
    {selector:'stealth',value:3,predicate:['in-darkness']}]}},
  boots:{uuid:'E',name:'Boots',type:'equipment',metadata:{itemBonuses:[{selector:'athletics',value:1}]}},
  rope:{uuid:'F',name:'Rope',type:'equipment',metadata:{}},
  longsword:{uuid:'G',name:'Longsword',type:'weapon',traits:['versatile-p'],metadata:{rules:{category:'martial',damage:{dice:1,die:'d8',damageType:'slashing'}}}},
  rapier:{uuid:'H',name:'Rapier',type:'weapon',traits:['finesse','deadly-d8'],metadata:{rules:{category:'martial',damage:{dice:1,die:'d6',damageType:'piercing'}}}},
  bow:{uuid:'I',name:'Shortbow',type:'weapon',traits:['propulsive'],metadata:{rules:{category:'martial',range:60,damage:{dice:1,die:'d6',damageType:'piercing'}}}},
  flaming:{uuid:'J',name:'Flaming',type:'equipment',metadata:{rules:{usage:{value:'etched-onto-a-weapon'}}}}
};
const lookup=uuid=>Object.values(items).find(i=>i.uuid===uuid)??null;
const wish=(id,uuid,targetLevel,equippedFlag=true,extra={})=>({id,uuid,name:lookup(uuid).name,targetLevel,equipped:equippedFlag,...extra});
const ranks={unarmored:1,light:1,medium:1,heavy:0,unarmed:1,simple:1,martial:2,advanced:0};
const prof=(r,l)=>proficiencyBonus(r,l);

test('equipping: one armor at a time, from its planned level; weapons can stack up',()=>{
  assert.ok(canEquip(items.chain)&&canEquip(items.goggles)&&canEquip(items.longsword)&&!canEquip(items.rope));
  let planner={wishlist:[wish('1','A',3,false),wish('2','B',1,true),wish('3','G',1,true),wish('4','H',1,false)]};
  planner=setEquipped(planner,'1',true,lookup);
  planner=setEquipped(planner,'4',true,lookup);
  assert.deepEqual(planner.wishlist.map(w=>w.equipped),[true,false,true,true],'Chain mail replaces leather; both weapons stay');
  assert.deepEqual(equipped(planner,lookup,2).map(g=>g.item.name),['Longsword','Rapier'],'Armor not until level 3');
});

test('PF2e AC: Dex cap, proficiency, armor and rune bonuses; a shield is not part of AC',()=>{
  const gear=[{item:items.chain},{item:items.shield},{item:items.goggles},{item:items.boots}];
  const bonuses=itemBonuses(gear,{level:5});
  assert.equal(bonuses.get('ac').value,1,'Potency rune');
  assert.equal(bonuses.get('fortitude').value,1,'Resilient rune');
  assert.equal(bonuses.get('athletics').value,2,'Highest item bonus only');
  assert.equal(bonuses.has('stealth'),false,'Conditional bonuses are not applied');
  assert.equal(skillBonus(bonuses,'athletics'),2);
  const ac=armorClass({gear,mods:{dex:3,str:2},ranks,level:5,proficiency:prof,bonuses});
  assert.equal(ac.total,10+1+(2+5)+4+1,'Dex capped at 1, trained medium at level 5');
  assert.equal(ac.checkPenalty,-2,'Str +2 is under the requirement of +3');
  // Planned runes replace the armor's own.
  const planned={entry:{runes:{potency:2,resilient:0,striking:0,property:[]}},item:items.chain};
  assert.equal(itemBonuses([planned],{level:5}).get('ac').value,2);
  assert.equal(itemBonuses([planned],{level:5}).has('fortitude'),false);
  const abp=itemBonuses([{item:items.leather}],{level:11,variants:{automaticBonusProgression:'ABPRulesAsWritten'}});
  assert.equal(abp.get('ac').value,2,'ABP defense potency at 11');
});

test('PF2e Strikes: ability, proficiency, potency, striking dice and Strength damage',()=>{
  const ctx={mods:{str:4,dex:2},ranks,level:5,proficiency:prof,lookup};
  const sword={entry:{runes:{potency:1,striking:1,resilient:0,property:['J']}},item:items.longsword};
  const s=strike(sword,ctx);
  assert.equal(s.attack,4+(4+5)+1,'Str + expert martial at 5 + potency');
  assert.equal(s.damage,'2d8+4 slashing');
  assert.deepEqual(s.properties,['Flaming']);
  assert.equal(runedName(sword,lookup),'+1 Striking Flaming Longsword');
  assert.equal(strike({item:items.rapier},{...ctx,mods:{str:1,dex:4}}).attack,4+9,'Finesse uses the better of Str and Dex');
  const bow=strike({item:items.bow},ctx);
  assert.equal(bow.attack,2+9,'Ranged uses Dex');
  assert.equal(bow.damage,'1d6+2 piercing','Propulsive adds half Strength');
  const abp=strike({item:items.longsword},{...ctx,level:12,variants:{automaticBonusProgression:'ABPRulesAsWritten'}});
  assert.equal(abp.damage.split('+')[0],'3d8','ABP devastating attacks at 12');
  assert.deepEqual(runesOf({entry:{},item:items.chain}),{potency:1,striking:0,resilient:1,property:[]});
});

test('5e AC with armor types, shields and Unarmored Defense; attacks',()=>{
  const g=(type,value,extra={})=>({entry:extra.entry??{},item:{name:type,metadata:{armor:{type,value,dex:null,magicalBonus:0}}}});
  const scores={str:16,dex:16,con:14,wis:12};
  assert.equal(armorClass5e(scores,null,null).total,13);
  assert.equal(armorClass5e(scores,g('light',11),null).total,14);
  assert.equal(armorClass5e({...scores,dex:18},g('medium',14),null).total,16,'Medium caps Dex at +2');
  assert.equal(armorClass5e({...scores,dex:8},g('heavy',16),g('shield',2)).total,18,'Heavy ignores Dex, even negative; shield adds');
  assert.equal(armorClass5e(scores,g('heavy',16,{entry:{bonus:1}}),null).total,17,'Planned +1 armor');
  const barbarian=[{ability:'con',label:'Unarmored Defense'}],monk=[{ability:'wis',noShield:true,label:'Unarmored Defense'}];
  assert.equal(armorClass5e(scores,null,null,barbarian).total,10+3+2,'10 + Dex + Con');
  assert.equal(armorClass5e(scores,null,g('shield',2),barbarian).total,17,'Barbarians keep it with a shield');
  assert.equal(armorClass5e(scores,null,g('shield',2),monk).total,15,'Monks lose it with a shield');
  assert.equal(armorClass5e(scores,g('light',11),null,barbarian).total,14,'Only without armor');
  const longsword={entry:{bonus:1},item:{name:'Longsword',traits:['ver'],metadata:{weapon:{number:1,denomination:8,types:['slashing'],classification:'martialM'}}}};
  const a=weaponAttack5e(longsword,{scores,proficiencyBonus:3,proficient:true});
  assert.equal(a.attack,3+3+1);
  assert.equal(a.damage,'1d8+4 slashing');
  assert.equal(a.name,'+1 Longsword');
});

import {itemStats} from '../src/lib/builder/item-stats.js';
test('item details list armor, shield and weapon stats',()=>{
  const stats=item=>Object.fromEntries(itemStats(item));
  assert.deepEqual(stats(items.chain),{Category:'Medium','AC bonus':'+4','Dex cap':'+1',Strength:'+3','Check penalty':'-2',
    'Speed penalty':'-5 ft.',Runes:'+1 potency, Resilient'});
  assert.equal(stats(items.longsword).Damage,'1d8 slashing');
  assert.equal(stats(items.bow).Range,'60 ft.');
  assert.equal(stats(items.shield)['AC bonus'],'+2 (raised)');
  assert.deepEqual(itemStats(items.rope),[]);
  const plate={name:'Plate',metadata:{armor:{type:'heavy',value:18,dex:0,magicalBonus:0}}};
  assert.equal(stats(plate).AC,'18');
  assert.equal(stats({name:'Longsword',metadata:{weapon:{number:1,denomination:8,types:['slashing'],classification:'martialM'}}}).Damage,'1d8 slashing');
});
