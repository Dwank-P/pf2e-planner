/**
 * Equipped gear from the equipment plan (wishlist entries marked equipped), and what it does to
 * the summary: PF2e armor class, Strikes and item bonuses. An item counts from the level it's
 * planned for. Stats come from the synced items (metadata.rules: acBonus, dexCap, checkPenalty,
 * strength, damage, range, runes; metadata.itemBonuses: FlatModifiers of type "item"); runes the
 * player planned on an entry (entry.runes) replace the item's own.
 */
import {wishlist} from './equipment.js';

const EQUIP_TYPES=new Set(['armor','shield','weapon']);
/** Items worth equipping: armor, shields, weapons, and anything that gives an item bonus. */
export const canEquip=item=>!!item&&(EQUIP_TYPES.has(item.type)||(item.metadata?.itemBonuses?.length??0)>0
  ||!!item.metadata?.armor||!!item.metadata?.weapon);
/** Items that take runes (PF2e) or a magic bonus (D&D 5e). */
export const takesRunes=item=>!!item&&(item.type==='weapon'||item.type==='armor')&&!item.metadata?.armor&&!item.metadata?.weapon;
export const takesMagicBonus=item=>!!item&&(!!item.metadata?.weapon||(!!item.metadata?.armor&&item.metadata.armor.type!=='clothing'));

/** Equipped entries (with their items) by the given level. */
export function equipped(planner,lookup,level=20){
  return wishlist(planner).filter(w=>w.equipped&&w.targetLevel<=level)
    .map(w=>({entry:w,item:lookup(w.uuid)})).filter(x=>x.item);
}

const SAVES=['fortitude','reflex','will'];
// ABP (GM Core): the bonuses that replace fundamental runes.
const abpAttack=level=>level>=16?3:level>=10?2:level>=2?1:0;
const abpDice=level=>level>=19?4:level>=12?3:level>=4?2:1;
const abpDefense=level=>level>=18?3:level>=11?2:level>=5?1:0;
const abpSaves=level=>level>=20?3:level>=14?2:level>=8?1:0;
const GRADE={striking:1,greaterStriking:2,majorStriking:3,resilient:1,greaterResilient:2,majorResilient:3};
const grade=value=>typeof value==='number'?value:GRADE[value]??(Number(value)||0);
const isAbp=variants=>!!variants?.automaticBonusProgression&&variants.automaticBonusProgression!=='noABP';

/** A worn or wielded item's runes: the player's planned runes, else the item's own. */
export function runesOf({entry,item}){
  const own=item.metadata?.rules?.runes??{};
  const planned=entry?.runes;
  return {potency:Number(planned?.potency??own.potency)||0,
    striking:grade(planned?.striking??own.striking),resilient:grade(planned?.resilient??own.resilient),
    property:Array.isArray(planned?.property)?planned.property:[]};
}
const STRIKING_NAMES=['','Striking','Greater Striking','Major Striking'];
const RESILIENT_NAMES=['','Resilient','Greater Resilient','Major Resilient'];
/** "+1 Striking Longsword" */
export function runedName(g,lookup=()=>null){
  const r=runesOf(g);
  const props=r.property.map(u=>lookup(u)?.name).filter(Boolean);
  const fundamental=g.item.type==='armor'?RESILIENT_NAMES[r.resilient]:STRIKING_NAMES[r.striking];
  return [r.potency?'+'+r.potency:'',fundamental,...props,g.item.name].filter(Boolean).join(' ');
}

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
  const abp=isAbp(variants);
  for(const g of gear){
    const {item}=g;
    if(item.type==='armor'&&!abp){
      const r=runesOf(g);
      offer('ac',r.potency,item.name);
      for(const save of SAVES)offer(save,r.resilient,item.name);
    }
    for(const b of item.metadata?.itemBonuses??[]){
      if(b.predicate)continue;// conditional bonuses ("when climbing…") aren't applied to the sheet
      const targets=b.selector==='saving-throw'?SAVES:[b.selector];
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
 * PF2e AC: 10 + Dex (capped by armor) + proficiency (armor category) + item bonus. A shield only
 * adds when raised, so it isn't part of the character's AC. Also the armor's check penalty if the
 * character lacks its Strength, and its Speed penalty.
 */
export function armorClass({gear,mods,ranks,level,proficiency,bonuses}){
  const armor=gear.find(g=>g.item.type==='armor')?.item??null;
  const rules=armor?.metadata?.rules??{};
  const category=armor?String(rules.category??'light'):'unarmored';
  const cap=armor&&rules.dexCap!==undefined&&rules.dexCap!==null?Number(rules.dexCap):Infinity;
  const dex=Math.min(mods.dex??0,cap);
  const prof=proficiency(Number(ranks[category]??0),level);
  const item=(Number(rules.acBonus)||0)+(bonuses.get('ac')?.value??0);
  const strongEnough=!armor||!rules.strength||(mods.str??0)>=Number(rules.strength);
  return {total:10+dex+prof+item,armor,category,parts:{dex,prof,item},
    checkPenalty:strongEnough?0:Math.min(0,Number(rules.checkPenalty)||0),
    speedPenalty:Math.min(0,Number(rules.speedPenalty)||0)};
}

/**
 * PF2e Strike with an equipped weapon: attack modifier (Str, Dex if ranged, the better with
 * finesse; + proficiency in its category; + potency) and damage (dice from striking runes;
 * + Str for melee and thrown, half for propulsive).
 */
export function strike(g,{mods,ranks,level,proficiency,variants={},lookup=()=>null}){
  const rules=g.item.metadata?.rules??{};
  const traits=g.item.traits??[];
  // A weapon with a range is fired or thrown (Dex to hit); thrown ones still add Strength to damage.
  const ranged=Number(rules.range)>0;
  const thrown=traits.some(t=>t.startsWith('thrown'));
  const str=mods.str??0,dex=mods.dex??0;
  const ability=ranged?dex:traits.includes('finesse')?Math.max(str,dex):str;
  const category=String(rules.category??'simple');
  const r=runesOf(g);
  const abp=isAbp(variants);
  const potency=abp?abpAttack(level):r.potency;
  const attack=ability+proficiency(Number(ranks[category]??0),level)+potency;
  const dice=abp?abpDice(level):1+r.striking;
  const die=rules.damage?.die??'d4';
  const strDamage=!ranged||thrown?str:traits.includes('propulsive')?(str>0?Math.floor(str/2):str):0;
  const type=rules.damage?.damageType??'';
  return {name:runedName(g,lookup),attack,agile:traits.includes('agile'),
    damage:`${dice}${die}${strDamage?(strDamage>0?'+':'')+strDamage:''}${type?' '+type:''}`,
    properties:r.property.map(u=>lookup(u)?.name).filter(Boolean)};
}
