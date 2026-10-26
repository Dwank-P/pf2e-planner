/**
 * Operations on PF2e Leveler's level plan (actor flag pf2e-leveler.plan) for
 * levels 2–20. Shapes follow Leveler's scripts/plan/plan-model.js (MIT, © RoiLeaf).
 * Slots come from levelerChoiceSlots(); every function returns a new plan.
 */
import {emptyPlan,featEntry,spellEntry} from '../leveler-format.js';

export const CATEGORY_FOR_KIND={class:'classFeats',skill:'skillFeats',general:'generalFeats',
  ancestry:'ancestryFeats',archetype:'archetypeFeats','dual-class':'dualClassFeats',mythic:'mythicFeats'};
const clone=value=>JSON.parse(JSON.stringify(value));

/** A plan bound to the creation's class(es); Leveler ignores plans for another class. */
export function ensurePlan(plan,creation){
  const next=plan?clone(plan):emptyPlan(null,null);
  next.version??=1;
  next.classSlug=creation?.class?.slug??null;
  next.dualClassSlug=creation?.dualClass?.slug??null;
  next.levels??={};
  return next;
}
function edit(plan,level,change){
  const next=clone(plan);
  next.levels??={};
  const data=next.levels[level]??={};
  change(data);
  return next;
}
/**
 * Level-1 feats belong in the creation document, not plan.levels[1] (Leveler
 * plans levels 2–20). Imports from v0.13 could put a second level-1 ancestry
 * feat (Ancestral Paragon) there, hidden but counted; move such feats into the
 * empty creation fields and clear them from the plan. Returns null if nothing changed.
 */
export function repairLevelOne(creation,plan){
  const data=plan?.levels?.[1];
  const slotted=['ancestryFeats','classFeats','skillFeats','dualClassFeats','generalFeats','archetypeFeats'];
  if(!data||!slotted.some(k=>data[k]?.length))return null;
  const c=clone(creation),p=clone(plan);
  const fill=(fields,list)=>{for(const entry of list??[]){const field=fields.find(f=>!c[f]);if(field)c[field]=entry;}};
  fill(['ancestryFeat','ancestryParagonFeat'],data.ancestryFeats);
  fill(['classFeat'],data.classFeats);
  fill(['skillFeat'],data.skillFeats);
  fill(['dualClassFeat'],data.dualClassFeats);
  // Extras added at level 1 (customFeats, customSkillIncreases) stay.
  for(const key of slotted)delete p.levels[1][key];
  if(!Object.values(p.levels[1]).some(v=>Array.isArray(v)?v.length:v))delete p.levels[1];
  return {creation:c,plan:p};
}
/** Index of a repeated slot at one level: "ancestry-3-2" is the second ancestry feat. */
export const slotIndex=slot=>{const m=/-(\d+)$/.exec(slot.key.replace(/^[a-z-]+-\d+/,''));return m?Number(m[1])-1:0;};

export function planFeat(plan,slot){
  return plan?.levels?.[slot.level]?.[CATEGORY_FOR_KIND[slot.kind]]?.[slotIndex(slot)]??null;
}
export function setPlanFeat(plan,slot,item){
  const category=CATEGORY_FOR_KIND[slot.kind];
  return edit(plan,slot.level,data=>{
    const list=[...(data[category]??[])];
    const index=Math.min(slotIndex(slot),list.length);
    if(item)list[index]=list[index]?.uuid===item.uuid?list[index]:featEntry(item);
    else list.splice(index,1);
    // Leveler reads these arrays without null checks, so they stay compact.
    data[category]=list.filter(Boolean);
  });
}

export function planBoosts(plan,level){
  return (plan?.levels?.[level]?.abilityBoosts??[]).map(a=>String(a).toLowerCase());
}
/**
 * Extras a GM grants beyond the schedule: Leveler's customFeats (applied as bonus feats) and
 * customSkillIncreases at a level.
 */
export const customFeats=(plan,level)=>plan?.levels?.[level]?.customFeats??[];
export function addCustomFeat(plan,level,item){
  return edit(plan,level,data=>{data.customFeats=[...(data.customFeats??[]),featEntry(item)];});
}
export function removeCustomFeat(plan,level,index){
  return edit(plan,level,data=>{data.customFeats=(data.customFeats??[]).filter((_,i)=>i!==index);});
}
export const customSkillIncreases=(plan,level)=>plan?.levels?.[level]?.customSkillIncreases??[];
export function addCustomSkillIncrease(plan,level,skill,toRank){
  return edit(plan,level,data=>{data.customSkillIncreases=[...(data.customSkillIncreases??[]),{skill:levelerSkill(skill),toRank}];});
}
export function removeCustomSkillIncrease(plan,level,index){
  return edit(plan,level,data=>{data.customSkillIncreases=(data.customSkillIncreases??[]).filter((_,i)=>i!==index);});
}
/**
 * Gradual Ability Boosts: one boost at each of 2–5, 7–10, 12–15 and 17–20; each set of four
 * levels boosts four different attributes (Leveler's GRADUAL_BOOST_LEVELS and groups).
 */
export const GRADUAL_BOOST_LEVELS=[2,3,4,5,7,8,9,10,12,13,14,15,17,18,19,20];
export function gradualSet(level){
  const index=GRADUAL_BOOST_LEVELS.indexOf(level);
  if(index<0)return [];
  const start=Math.floor(index/4)*4;
  return GRADUAL_BOOST_LEVELS.slice(start,start+4);
}
/** Attributes boosted at the other levels of this level's gradual set → the level. */
export function boostsUsedInSet(plan,level){
  const used=new Map();
  for(const other of gradualSet(level))if(other!==level)
    for(const a of planBoosts(plan,other))if(!used.has(a))used.set(a,other);
  return used;
}
export function toggleLevelBoost(plan,level,attribute,count,{gradual=false}={}){
  return edit(plan,level,data=>{
    const picks=[...(data.abilityBoosts??[])];
    const index=picks.indexOf(attribute);
    if(index>=0)picks.splice(index,1);
    else if(picks.length<count&&!(gradual&&boostsUsedInSet(plan,level).has(attribute)))picks.push(attribute);
    data.abilityBoosts=picks;
  });
}

const sourceOf=entry=>String(entry?.source??'').trim();
/** The skill increase stored for a slot: matched by Leveler source, else by position. */
export function planSkillIncrease(plan,slot){
  const list=plan?.levels?.[slot.level]?.skillIncreases??[];
  const source=slot.choiceSource??'';
  if(source)return list.find(e=>sourceOf(e)===source)??null;
  return list.filter(e=>!sourceOf(e))[slotIndex(slot)]??null;
}
/** Leveler's skill slug: lores as "scribing-lore", other skills unchanged. */
export const levelerSkill=skill=>/\slore$/i.test(String(skill??''))
  ?String(skill).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''):skill;
export function setSkillIncrease(plan,slot,skill,toRank){
  skill=skill?levelerSkill(skill):skill;
  return edit(plan,slot.level,data=>{
    const list=[...(data.skillIncreases??[])];
    const source=slot.choiceSource??'';
    const entry=skill?{skill,toRank,...(source?{source}:{})}:null;
    let index=source?list.findIndex(e=>sourceOf(e)===source)
      :list.map((e,i)=>[e,i]).filter(([e])=>!sourceOf(e))[slotIndex(slot)]?.[1]??-1;
    if(index>=0){if(entry)list[index]=entry;else list.splice(index,1);}
    else if(entry)list.push(entry);
    data.skillIncreases=list;
  });
}

/** Signature spell chosen for a rank at a level (Leveler's levelData.signatureSpells). */
export function planSignature(plan,level,rank,entryType=PRIMARY){
  return (plan?.levels?.[level]?.signatureSpells??[])
    .find(s=>entryOf(s)===entryType&&Number(s.rank)===rank)??null;
}
export function setSignatureSpell(plan,level,rank,spell,entryType=PRIMARY){
  return edit(plan,level,data=>{
    const list=(data.signatureSpells??[]).filter(s=>entryOf(s)!==entryType||Number(s.rank)!==rank);
    if(spell)list.push({...(spell.entryType?spell:spellEntry(spell,rank,false)),entryType,rank});
    data.signatureSpells=list;
  });
}
/** Every spell learned by one entry (cantrips included) → the level it is learned at. */
export function learnedSpellLevels(creation,plan,entryType=PRIMARY){
  const out=new Map();
  const start=creationSpells(creation,entryType);
  for(const s of [...(start?.cantrips??[]),...(start?.rank1??[])])if(s?.uuid)out.set(s.uuid,1);
  for(let l=2;l<=20;l++)for(const s of planSpells(plan,l,entryType))if(s?.uuid&&!out.has(s.uuid))out.set(s.uuid,l);
  return out;
}
/**
 * Spellcasting entries follow Leveler: 'primary' for the class, and
 * 'class:<slug>' for a dual class (its level-1 picks live in creation.dualSpells).
 */
export const PRIMARY='primary';
const entryOf=s=>s?.entryType??PRIMARY;
const creationSpells=(creation,entryType)=>entryType===PRIMARY?creation?.spells:creation?.dualSpells;
/** Every spell in the repertoire up to `level`: creation picks plus planned levels. */
export function repertoire(creation,plan,level,entryType=PRIMARY){
  const out=[...(creationSpells(creation,entryType)?.rank1??[]).map(s=>({...s,rank:1}))];
  for(let l=2;l<=level;l++)out.push(...planSpells(plan,l,entryType).filter(s=>!s.isCantrip));
  return out;
}
/** Spells learned at a level for one spellcasting entry. */
export function planSpells(plan,level,entryType=PRIMARY){
  return (plan?.levels?.[level]?.spells??[]).filter(s=>entryOf(s)===entryType);
}
export function togglePlanSpell(plan,level,item,{rank,cantrip,entryType=PRIMARY}){
  return edit(plan,level,data=>{
    const list=[...(data.spells??[])];
    const index=list.findIndex(s=>s.uuid===item.uuid&&entryOf(s)===entryType&&(cantrip?s.isCantrip:Number(s.rank)===rank));
    if(index>=0)list.splice(index,1);
    else list.push(spellEntry(item,rank,cantrip,entryType));
    data.spells=list;
  });
}
