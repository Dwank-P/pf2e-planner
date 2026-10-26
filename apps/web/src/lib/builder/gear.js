/**
 * Equipped gear from the equipment plan (wishlist entries marked equipped), and what it does to
 * the summary: PF2e armor class and item bonuses. An item counts from the level it's planned for.
 * Stats come from the synced items (metadata.rules: acBonus, dexCap, checkPenalty, strength,
 * runes; metadata.itemBonuses: FlatModifiers of type "item").
 */
import {wishlist} from './equipment.js';

export const EQUIP_TYPES=new Set(['armor','shield']);
/** Items worth equipping: armor, shields, and anything that gives an item bonus. */
export const canEquip=item=>!!item&&(EQUIP_TYPES.has(item.type)||(item.metadata?.itemBonuses?.length??0)>0
  ||!!item.metadata?.armor);

/** Equipped entries (with their items) by the given level. */
export function equipped(planner,lookup,level=20){
  return wishlist(planner).filter(w=>w.equipped&&w.targetLevel<=level)
    .map(w=>({entry:w,item:lookup(w.uuid)})).filter(x=>x.item);
}

const SAVES=['fortitude','reflex','will'];
// ABP (GM Core): defense potency and saving throw potency replace armor runes.
const abpDefense=level=>level>=18?3:level>=11?2:level>=5?1:0;
const abpSaves=level=>level>=20?3:level>=14?2:level>=8?1:0;
const resilient=value=>typeof value==='number'?value:{resilient:1,greaterResilient:2,majorResilient:3}[value]??(Number(value)||0);

/**
 * Item bonuses by selector ("ac", "perception", "fortitude", a skill slug…), the highest of each
 * (item bonuses don't stack), with their sources.
 */
export function itemBonuses(gear,{level=1,variants={}}={}){
  const best=new Map();
  const offer=(selector,value,source)=>{
    if(!value)return;
    const current=best.get(selector);
    if(!current||value>current.value)best.set(selector,{value,source});
  };
  const abp=variants?.automaticBonusProgression&&variants.automaticBonusProgression!=='noABP';
  for(const {item} of gear){
    const rules=item.metadata?.rules??{};
    if(item.type==='armor'&&!abp){
      offer('ac',Number(rules.runes?.potency)||0,item.name);
      const r=resilient(rules.runes?.resilient);
      for(const save of SAVES)offer(save,r,item.name);
    }
    for(const b of item.metadata?.itemBonuses??[]){
      if(b.predicate)continue;// conditional bonuses ("when climbing…") aren't applied to the sheet
      const targets=b.selector==='saving-throw'?SAVES:b.selector==='skill-check'?['skill-check']:[b.selector];
      for(const t of targets)offer(t,Number(b.value)||0,item.name);
    }
  }
  if(abp){
    offer('ac',abpDefense(level),'Automatic bonus progression');
    for(const save of SAVES)offer(save,abpSaves(level),'Automatic bonus progression');
  }
  return best;
}
/** The bonus for a skill: its own selector, or a general skill bonus. */
export const skillBonus=(bonuses,skill)=>Math.max(bonuses.get(skill)?.value??0,bonuses.get('skill-check')?.value??0);

/**
 * PF2e AC: 10 + Dex (capped by armor) + proficiency (armor category) + item bonus; a raised
 * shield adds its bonus. Returns the total, the parts, and the armor's check penalty if the
 * character lacks its Strength.
 */
export function armorClass({gear,mods,ranks,level,proficiency,bonuses}){
  const armor=gear.find(g=>g.item.type==='armor')?.item??null;
  const shield=gear.find(g=>g.item.type==='shield')?.item??null;
  const rules=armor?.metadata?.rules??{};
  const category=armor?String(rules.category??'light'):'unarmored';
  const cap=armor&&rules.dexCap!==undefined&&rules.dexCap!==null?Number(rules.dexCap):Infinity;
  const dex=Math.min(mods.dex??0,cap);
  const rank=Number(ranks[category]??0);
  const prof=proficiency(rank,level);
  const item=(Number(rules.acBonus)||0)+(bonuses.get('ac')?.value??0);
  const total=10+dex+prof+item;
  const strongEnough=!armor||!rules.strength||(mods.str??0)>=Number(rules.strength);
  return {total,armor,shield,category,rank,parts:{dex,prof,item},
    raised:shield?total+(Number(shield.metadata?.rules?.acBonus)||0):null,
    checkPenalty:strongEnough?0:Math.min(0,Number(rules.checkPenalty)||0),
    speedPenalty:Math.min(0,Number(rules.speedPenalty)||0)};
}
