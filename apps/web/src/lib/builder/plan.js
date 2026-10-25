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
export function toggleLevelBoost(plan,level,attribute,count){
  return edit(plan,level,data=>{
    const picks=[...(data.abilityBoosts??[])];
    const index=picks.indexOf(attribute);
    if(index>=0)picks.splice(index,1);
    else if(picks.length<count)picks.push(attribute);
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
export function setSkillIncrease(plan,slot,skill,toRank){
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

/** Spells learned at a level (primary class list). */
export function planSpells(plan,level){
  return (plan?.levels?.[level]?.spells??[]).filter(s=>(s.entryType??'primary')==='primary');
}
export function togglePlanSpell(plan,level,item,{rank,cantrip}){
  return edit(plan,level,data=>{
    const list=[...(data.spells??[])];
    const index=list.findIndex(s=>s.uuid===item.uuid&&(cantrip?s.isCantrip:Number(s.rank)===rank));
    if(index>=0)list.splice(index,1);
    else list.push(spellEntry(item,rank,cantrip));
    data.spells=list;
  });
}
