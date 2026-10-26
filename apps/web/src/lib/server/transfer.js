import {db} from './db.js';
import {problem} from './api.js';

/**
 * Moving a character between places: a personal character into a campaign, or a build exported
 * from one planner (file or public link) into another. Items are matched by uuid, then by name
 * and type, against the target's compendiums; anything the target doesn't have is left out and
 * reported. Variant rules follow the target.
 */
export const EXPORT_FORMAT='planner-character';
const UUIDS=/Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+/g;
export const uuidsIn=value=>new Set([...JSON.stringify(value??null).matchAll(UUIDS)].map(m=>m[0]));
const VARIANT_NAMES={freeArchetype:'Free Archetype',dualClass:'Dual Class',ancestralParagon:'Ancestral Paragon',mythic:'Mythic',
  gradualAbilityBoosts:'Gradual Boosts',proficiencyWithoutLevel:'Proficiency Without Level'};
const ABP_NAMES={noABP:'off',ABPFundamentalPotency:'fundamental potency',ABPRulesAsWritten:'rules as written'};
const PF2E_VARIANT_KEYS=[...Object.keys(VARIANT_NAMES),'ignoreArchetypeDedicationLock','automaticBonusProgression'];

/** The rules a character was built with, keeping only the keys that matter for its system. */
export function variantsFor(system,variants={}){
  if(system==='dnd5e')return {rulesVersion:variants.rulesVersion==='legacy'?'legacy':'modern',allowFeats:variants.allowFeats!==false};
  const out=Object.fromEntries(PF2E_VARIANT_KEYS.filter(k=>k!=='automaticBonusProgression').map(k=>[k,variants[k]===true]));
  out.automaticBonusProgression=['ABPFundamentalPotency','ABPRulesAsWritten'].includes(variants.automaticBonusProgression)
    ?variants.automaticBonusProgression:'noABP';
  return out;
}

/** Drop references to items the target doesn't have (Leveler documents: {uuid,…} entries). */
function pruneLeveler(value,missing){
  if(Array.isArray(value))return value.filter(v=>!(v&&typeof v==='object'&&missing.has(v.uuid))&&!missing.has(v)).map(v=>pruneLeveler(v,missing));
  if(!value||typeof value!=='object')return value;
  const out={};
  for(const [key,entry] of Object.entries(value)){
    if(entry&&typeof entry==='object'&&!Array.isArray(entry)&&missing.has(entry.uuid))out[key]=null;
    else if(typeof entry==='string'&&missing.has(entry))continue;
    else out[key]=pruneLeveler(entry,missing);
  }
  return out;
}
function prune5e(build,missing){
  const has=text=>[...String(text).matchAll(UUIDS)].some(m=>missing.has(m[0]));
  const list=v=>Array.isArray(v)?v.filter(x=>!missing.has(x)):v;
  const object=(o,fn)=>Object.fromEntries(Object.entries(o??{}).filter(([k])=>!has(k)).map(([k,v])=>[k,fn(v)]).filter(([,v])=>v!==undefined));
  return {...build,speciesUuid:missing.has(build.speciesUuid)?null:build.speciesUuid,
    backgroundUuid:missing.has(build.backgroundUuid)?null:build.backgroundUuid,
    levels:list(build.levels??[]),feats:list(build.feats??[]),
    subclasses:object(build.subclasses,v=>missing.has(v)?undefined:v),
    spells:object(build.spells,list),
    choices:object(build.choices,v=>Array.isArray(v)?list(v):v?.mode==='feat'&&missing.has(v.uuid)?undefined:v)};
}

/**
 * Rewrite a character document for a target.
 * source: {system, document, variants, nameOf(uuid) → {name,type}|null}
 * target: {has(uuid), byName(type,name) → uuid|null, variants|null (null = keep the source's), label}
 */
export function transplant(source,target){
  const text=JSON.stringify(source.document);
  const map=new Map(),missing=new Set(),missingNames=new Set();
  let matched=0,renamed=0;
  for(const uuid of uuidsIn(source.document)){
    if(target.has(uuid)){matched++;continue;}
    const item=source.nameOf(uuid);
    const other=item?target.byName(item.type,item.name):null;
    if(other){map.set(uuid,other);renamed++;}
    else{missing.add(uuid);missingNames.add(item?.name??uuid);}
  }
  let doc=JSON.parse(map.size?text.replace(UUIDS,m=>map.get(m)??m):text);
  if(source.system==='dnd5e')doc={...doc,build:prune5e(doc.build??{},missing)};
  else doc={...doc,leveler:pruneLeveler(doc.leveler,missing),
    planner:{...doc.planner,extraFeats:Object.fromEntries(Object.entries(doc.planner?.extraFeats??{}).filter(([,u])=>!missing.has(u)))}};
  if(doc.planner?.wishlist)doc.planner.wishlist=doc.planner.wishlist.filter(w=>!missing.has(w.uuid));
  const differences=[];
  if(target.variants){
    const own=source.variants??{},other=target.variants,where=target.label??'in the campaign';
    if(source.system==='dnd5e'){
      if(own.rulesVersion&&other.rulesVersion&&own.rulesVersion!==other.rulesVersion)
        differences.push(`Rules: ${own.rulesVersion==='modern'?'2024':'2014'} in the build, ${other.rulesVersion==='modern'?'2024':'2014'} ${where}`);
    }else{
      for(const [k,label] of Object.entries(VARIANT_NAMES))if((own[k]===true)!==(other[k]===true))
        differences.push(`${label}: ${own[k]===true?'on':'off'} in the build, ${other[k]===true?'on':'off'} ${where}`);
      const a=own.automaticBonusProgression??'noABP',b=other.automaticBonusProgression??'noABP';
      if(a!==b)differences.push(`Automatic Bonus Progression: ${ABP_NAMES[a]??a} in the build, ${ABP_NAMES[b]??b} ${where}`);
      // Boosts planned for a different schedule (gradual or every five levels) don't carry over.
      if((own.gradualAbilityBoosts===true)!==(other.gradualAbilityBoosts===true)){
        for(const data of Object.values(doc.leveler?.plan?.levels??{}))if(data&&typeof data==='object')delete data.abilityBoosts;
        differences.push('Attribute boosts from level 2 were cleared, since the boost schedules differ');
      }
    }
  }
  return {doc,report:{matched,renamed,missing:[...missingNames].sort(),variantDifferences:differences}};
}

/** Name lookups in a campaign's published catalog. */
export function campaignByName(integrationId){
  const pub=db().prepare('SELECT snapshot_id FROM catalog_publications WHERE integration_id=?').get(integrationId);
  const find=db().prepare(`SELECT uuid FROM catalog_entries WHERE integration_id=? AND snapshot_id=?
    AND type=? AND name=? COLLATE NOCASE LIMIT 1`);
  return (type,name)=>pub&&type&&name?find.get(integrationId,pub.snapshot_id,type,name)?.uuid??null:null;
}

/** The portable export: the document plus each item's name and type, for matching elsewhere. */
export function exportPayload({name,level,system,variants,document,resolve}){
  const items={};
  for(const uuid of uuidsIn(document)){
    const item=resolve(uuid);
    if(item)items[uuid]={name:item.name,type:item.type};
  }
  return {format:EXPORT_FORMAT,version:1,exportedAt:new Date().toISOString(),
    character:{name,level,system,variants:variantsFor(system,variants)},document,items};
}
/** Check an uploaded or fetched export. */
export function readExport(value){
  if(!value||typeof value!=='object'||value.format!==EXPORT_FORMAT||value.version!==1)problem(400,'not_a_planner_character_export');
  const c=value.character??{};
  if(!['pf2e','dnd5e'].includes(c.system)||typeof c.name!=='string'||!c.name.trim()||c.name.length>80)problem(400,'not_a_planner_character_export');
  if(!value.document||typeof value.document!=='object'||Array.isArray(value.document))problem(400,'not_a_planner_character_export');
  const items=value.items&&typeof value.items==='object'&&!Array.isArray(value.items)?value.items:{};
  return {name:c.name.trim(),level:Number.isInteger(c.level)&&c.level>=1&&c.level<=20?c.level:1,system:c.system,
    variants:variantsFor(c.system,c.variants??{}),document:value.document,
    nameOf:uuid=>{const i=items[uuid];return i&&typeof i.name==='string'&&typeof i.type==='string'?{name:i.name.slice(0,240),type:i.type.slice(0,40)}:null;}};
}
