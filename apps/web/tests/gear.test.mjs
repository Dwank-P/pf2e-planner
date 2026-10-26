import test from 'node:test';
import assert from 'node:assert/strict';
import {equipped,itemBonuses,skillBonus,armorClass,canEquip} from '../src/lib/builder/gear.js';
import {setEquipped} from '../src/lib/builder/equipment.js';
import {proficiencyBonus} from '../src/lib/builder/rules.js';
import {armorClass5e} from '../src/lib/systems/dnd5e/rules.js';

const items={
  chain:{uuid:'A',name:'Chain Mail',type:'armor',metadata:{rules:{category:'medium',acBonus:4,dexCap:1,checkPenalty:-2,speedPenalty:-5,strength:3,
    runes:{potency:1,resilient:1}}}},
  leather:{uuid:'B',name:'Leather Armor',type:'armor',metadata:{rules:{category:'light',acBonus:1,dexCap:4}}},
  shield:{uuid:'C',name:'Steel Shield',type:'shield',metadata:{rules:{acBonus:2}}},
  goggles:{uuid:'D',name:'Goggles',type:'equipment',metadata:{itemBonuses:[{selector:'perception',value:1},{selector:'athletics',value:2},
    {selector:'stealth',value:3,predicate:['in-darkness']}]}},
  boots:{uuid:'E',name:'Boots',type:'equipment',metadata:{itemBonuses:[{selector:'athletics',value:1}]}},
  rope:{uuid:'F',name:'Rope',type:'equipment',metadata:{}}
};
const lookup=uuid=>Object.values(items).find(i=>i.uuid===uuid)??null;
const wish=(id,uuid,targetLevel,equippedFlag=true)=>({id,uuid,name:lookup(uuid).name,targetLevel,equipped:equippedFlag});
const ranks={unarmored:1,light:1,medium:1,heavy:0};
const prof=(r,l)=>proficiencyBonus(r,l);

test('equipping: one armor at a time, from its planned level',()=>{
  assert.ok(canEquip(items.chain)&&canEquip(items.goggles)&&!canEquip(items.rope));
  let planner={wishlist:[wish('1','A',3,false),wish('2','B',1,true)]};
  planner=setEquipped(planner,'1',true,lookup);
  assert.deepEqual(planner.wishlist.map(w=>w.equipped),[true,false],'Putting on chain mail takes off the leather');
  assert.deepEqual(equipped(planner,lookup,2).map(g=>g.item.name),[],'Not until level 3');
  assert.deepEqual(equipped(planner,lookup,3).map(g=>g.item.name),['Chain Mail']);
});

test('PF2e AC: Dex cap, proficiency, armor and rune item bonuses, shield, Strength',()=>{
  const gear=[{item:items.chain},{item:items.shield},{item:items.goggles},{item:items.boots}];
  const bonuses=itemBonuses(gear,{level:5});
  assert.equal(bonuses.get('ac').value,1,'Potency rune');
  assert.equal(bonuses.get('fortitude').value,1,'Resilient rune');
  assert.equal(bonuses.get('athletics').value,2,'Highest item bonus only');
  assert.equal(bonuses.has('stealth'),false,'Conditional bonuses are not applied');
  assert.equal(skillBonus(bonuses,'athletics'),2);
  const ac=armorClass({gear,mods:{dex:3,str:2},ranks,level:5,proficiency:prof,bonuses});
  assert.equal(ac.total,10+1+(2+5)+4+1,'Dex capped at 1, trained medium at level 5');
  assert.equal(ac.raised,ac.total+2);
  assert.equal(ac.checkPenalty,-2,'Str +2 is under the requirement of +3');
  const unarmored=armorClass({gear:[],mods:{dex:3},ranks,level:1,proficiency:prof,bonuses:new Map()});
  assert.equal(unarmored.total,10+3+3);
  const abp=itemBonuses([{item:items.leather}],{level:11,variants:{automaticBonusProgression:'ABPRulesAsWritten'}});
  assert.equal(abp.get('ac').value,2,'ABP defense potency at 11');
  assert.equal(abp.get('will').value,1,'ABP save potency at 8+');
});

test('5e AC from armor types',()=>{
  const armor=(type,value,dex=null)=>({name:type,metadata:{armor:{type,value,dex,magicalBonus:0}}});
  assert.equal(armorClass5e(16,null,null).total,13);
  assert.equal(armorClass5e(16,armor('light',11),null).total,14);
  assert.equal(armorClass5e(18,armor('medium',14),null).total,16,'Medium caps Dex at +2');
  assert.equal(armorClass5e(8,armor('heavy',16),armor('shield',2)).total,18,'Heavy ignores Dex, even negative; shield adds');
});
