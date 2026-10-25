/**
 * Formula, item and spell choices granted by feats and classes, stored the way
 * PF2e Leveler stores them: creation.featGrants for level 1 and
 * plan.levels[N].featGrants for later levels ({requirementId, sourceFeatUuid,
 * sourceFeatName, kind, selections}). Requirements come from Leveler's own
 * detection (leveler-feat-grants.js).
 */
import {buildFeatGrantRequirements,buildPlanFormulaProgressionRequirements,getFeatGrantSelections}
  from './leveler-feat-grants.js';
import {attributeModifiers} from './rules.js';
import {skillRanks} from './legality.js';
import {itemOptions} from './equipment.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const CREATION_FEATS=['ancestryFeat','ancestryParagonFeat','classFeat','dualClassFeat','skillFeat','mythicCalling'];
const HANDLER_SOURCES=['implement','innovationItem','innovationModification','secondElement','subconsciousMind','thesis',
  'deity','devotionSpell','tactics','ikons','kineticImpulses','apparitions'];
const PLAN_FEATS=['classFeats','skillFeats','generalFeats','ancestryFeats','archetypeFeats','mythicFeats','dualClassFeats','customFeats'];

function context(creation,plan,lookup,level){
  const {mods}=attributeModifiers(creation,lookup,plan?.levels??{},level);
  return {lookup,int:mods.int??0,craftingRank:skillRanks(creation,plan,lookup,level).get('crafting')??0};
}
const unique=entries=>{
  const seen=new Set();
  return entries.filter(e=>e?.uuid&&!seen.has(e.uuid)&&seen.add(e.uuid));
};
const classEntry=(entry,lookup)=>entry?{...entry,
  slug:entry.slug??lookup(entry.uuid)?.metadata?.levelerProgression?.slug??lookup(entry.uuid)?.metadata?.slug}:null;

/** Level-1 requirements: the Character Wizard's feat-choice sources (Leveler _getCreationFeatGrantSources). */
export function creationGrantRequirements(creation,lookup){
  const c=creation??{};
  const handler=target=>{
    const bucket=c.classSelections?.[target]??(target==='class'?c:{});
    return HANDLER_SOURCES.flatMap(key=>[].concat(bucket[key]??[]));
  };
  const feats=unique([...CREATION_FEATS.map(k=>c[k]),c.subclass,c.dualSubclass,...handler('class'),...handler('dualClass')]);
  return buildFeatGrantRequirements({feats,classEntries:[classEntry(c.class,lookup),classEntry(c.dualClass,lookup)].filter(Boolean),
    level:1,plan:null,...context(c,null,lookup,1)});
}
/**
 * Requirements at a planned level: feats taken there, class formula-book growth
 * and formula progressions from earlier feats. Class requirement ids use
 * 'class:<slug>' as Leveler's planner does before the class is on the actor; the
 * Bridge rewrites them to the actor's class item when pulling.
 */
export function levelGrantRequirements(creation,plan,lookup,level){
  const data=plan?.levels?.[level]??{};
  const ctx={plan,level,...context(creation,plan,lookup,level)};
  const classes=[[creation?.class,plan?.classSlug],[creation?.dualClass,plan?.dualClassSlug]]
    .filter(([entry,slug])=>entry&&slug).map(([entry,slug])=>({slug,name:entry.name,uuid:'class:'+slug}));
  const detected=buildFeatGrantRequirements({feats:PLAN_FEATS.flatMap(k=>data[k]??[]),...ctx});
  const classDefaults=buildFeatGrantRequirements({classEntries:classes,...ctx});
  const progression=buildPlanFormulaProgressionRequirements(ctx);
  const seen=new Set();
  return [...detected,...classDefaults,...progression].filter(r=>!seen.has(r.id)&&seen.add(r.id));
}

export const grantSelections=(store,requirement)=>getFeatGrantSelections(store,requirement);
export function grantSelection(item){
  const rank=Number(item.metadata?.spellRank??item.level??0)||0;
  return {uuid:item.uuid,name:item.name,img:item.img??null,rank,baseRank:rank,itemType:item.type??null,
    traits:[...(item.traits??[]),...(item.metadata?.spellTraditions??[])]};
}
/** Add or remove one selection for a requirement in a featGrants store (creation or level data). */
export function toggleGrantSelection(store,requirement,item){
  const next=clone(store??{});
  const grants=Array.isArray(next.featGrants)?next.featGrants:[];
  let entry=grants.find(g=>g?.requirementId===requirement.id);
  if(!entry){
    entry={requirementId:requirement.id,sourceFeatUuid:requirement.sourceFeatUuid??null,
      sourceFeatName:requirement.sourceFeatName??null,kind:requirement.kind,selections:[]};
    grants.push(entry);
  }
  const index=entry.selections.findIndex(s=>s?.uuid===item.uuid);
  if(index>=0)entry.selections.splice(index,1);
  else if(entry.selections.length<(requirement.count??99))entry.selections.push(grantSelection(item));
  next.featGrants=grants.filter(g=>g.selections?.length||g.manual);
  return next;
}

/** Every formula chosen anywhere in the build (a formula is only learned once). */
export function takenFormulas(creation,plan){
  const out=new Map();
  const add=(grants,level)=>{for(const g of grants??[])if(g?.kind==='formula')
    for(const s of g.selections??[])if(s?.uuid&&!out.has(s.uuid))out.set(s.uuid,level);};
  add(creation?.featGrants,1);
  for(let l=2;l<=20;l++)add(plan?.levels?.[l]?.featGrants,l);
  return out;
}

/** Catalog items a requirement can pick from, following Leveler's picker presets. */
export function grantCandidates(catalog,requirement,{maxLevelCap=null}={}){
  const f=requirement.filters??{};
  const cap=Number.isFinite(Number(maxLevelCap))?Number(maxLevelCap):Number.isFinite(Number(f.maxLevel))?Number(f.maxLevel):null;
  const rarity=Array.isArray(f.rarity)&&f.rarity.length?f.rarity:null;
  if(requirement.kind==='spell'){
    return catalog.ofType('spell').filter(s=>{
      const rank=Number(s.metadata?.spellRank??s.level??0);
      const cantrip=(s.traits??[]).includes('cantrip');
      if(Number.isFinite(Number(f.rank))&&(Number(f.rank)===0?!cantrip:cantrip||rank!==Number(f.rank)))return false;
      if(f.tradition&&!(s.metadata?.spellTraditions??[]).includes(f.tradition))return false;
      return !rarity||rarity.includes(s.rarity??'common');
    });
  }
  const traits=f.traits??[],required=f.requiredTraits??[];
  return itemOptions(catalog).filter(item=>{
    const t=item.traits??[];
    if(cap!=null&&(item.level??0)>cap)return false;
    if(rarity&&!rarity.includes(item.rarity??'common'))return false;
    if(f.itemTypes?.length&&!f.itemTypes.includes(item.type))return false;
    if(!required.every(r=>t.includes(r)))return false;
    if(traits.length&&!(f.traitLogic==='or'?traits.some(r=>t.includes(r)):traits.every(r=>t.includes(r))))return false;
    return true;
  });
}
export const GRANT_KIND_LABEL={formula:'Formulas',item:'Items',spell:'Spells'};
