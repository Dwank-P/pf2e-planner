/**
 * Choices inside a feat or feature: PF2e ChoiceSet rule elements (Order Explorer's druid order,
 * Skill Training's skill, Adopted Ancestry's ancestry…), synced by the Bridge as
 * metadata.choiceSets. Picks are stored the way PF2e Leveler stores them, on the feat entry as
 * choices: {flag: value}, which Leveler applies as the item's rulesSelections.
 *
 * A pick can bring more choices: a GrantItem whose uuid is "{item|flags.pf2e.rulesSelections.<flag>}"
 * grants the picked item, and that item's own ChoiceSets are offered too (same choices map, as
 * Leveler's planner does).
 */

import {effectsOf} from './granted.js';
import {SKILLS,titleCase} from './rules.js';

const MAX_DEPTH=3;
const PLACEHOLDER=/\{item\|flags\.(?:pf2e|system)\.rulesSelections\.([^}]+)\}/g;

/** Resolve a GrantItem uuid template with the picks so far (null while a pick is missing). */
export function resolveGrantUuid(template,choices={}){
  let missing=false;
  const uuid=String(template).replace(PLACEHOLDER,(_,flag)=>{
    const value=choices?.[flag];
    if(typeof value!=='string'||!value){missing=true;return '';}
    return value;
  });
  return missing||uuid.includes('{')?null:uuid;
}

// ---- Predicates: three-valued (true, false, unknown); unknown counts as met --------------------

/**
 * ctx: {feats:Set<slug>, class, ancestry, heritage, level} — the roll options a planner can know.
 * Anything else ("self:effect:…", "target:…") is unknown, so the choice is still offered.
 */
function statement(text,ctx){
  const s=String(text);
  const [domain,...rest]=s.split(':');
  const value=rest.join(':');
  switch(domain){
    case 'feat':return value?ctx.feats?.has(value)??null:null;
    case 'class':return ctx.class?value===ctx.class:null;
    case 'ancestry':return ctx.ancestry?value===ctx.ancestry:null;
    case 'heritage':return ctx.heritage?value===ctx.heritage:null;
    default:return null;
  }
}
function evaluate(predicate,ctx){
  if(predicate===undefined||predicate===null)return true;
  if(typeof predicate==='string')return statement(predicate,ctx);
  if(Array.isArray(predicate))return all(predicate.map(p=>evaluate(p,ctx)));
  if(typeof predicate!=='object')return null;
  if(Array.isArray(predicate.and))return all(predicate.and.map(p=>evaluate(p,ctx)));
  if(Array.isArray(predicate.or))return any(predicate.or.map(p=>evaluate(p,ctx)));
  if(Array.isArray(predicate.nor)){const r=any(predicate.nor.map(p=>evaluate(p,ctx)));return r===null?null:!r;}
  if('not' in predicate){const r=evaluate(predicate.not,ctx);return r===null?null:!r;}
  return null;// gte/lte etc. on actor data: unknown
}
const all=results=>results.includes(false)?false:results.every(r=>r===true)?true:null;
const any=results=>results.includes(true)?true:results.every(r=>r===false)?false:null;
export const predicateMet=(predicate,ctx={})=>evaluate(predicate,ctx)!==false;

// ---- Item filters (Leveler's matchesChoiceSetFilters, on synced catalog items) -------------------

function field(item,name){
  const m=item.metadata??{};
  switch(name){
    case 'tag':return m.otherTags??[];
    case 'trait':return item.traits??[];
    case 'type':return item.type;
    case 'level':return item.level;
    case 'slug':return m.slug??null;
    case 'category':return m.featType??m.category??null;
    case 'rarity':return item.rarity??'common';
    case 'ancestry':return m.ancestrySlug??null;
    default:return undefined;
  }
}
/** "item:tag:druid-order" style tests; unknown fields pass (permissive, as for predicates). */
function filterString(item,text){
  const parts=String(text).split(':');
  if(parts[0]!=='item')return true;
  const value=field(item,parts[1]);
  if(value===undefined)return true;
  const wanted=parts.slice(2).join(':');
  if(!wanted)return value!==null&&value!==false;
  return Array.isArray(value)?value.map(String).includes(wanted):String(value)===wanted;
}
function compare(item,op,[a,b]){
  const read=v=>typeof v==='string'&&v.startsWith('item:')?field(item,v.split(':')[1]):v;
  const left=read(a),right=read(b);
  if(left===undefined||left===null||right===undefined||right===null)return true;
  const [x,y]=[Number(left),Number(right)];
  const numeric=Number.isFinite(x)&&Number.isFinite(y);
  const l=numeric?x:String(left).toLowerCase(),r=numeric?y:String(right).toLowerCase();
  return {eq:l===r,ne:l!==r,gt:l>r,gte:l>=r,lt:l<r,lte:l<=r}[op]??true;
}
export function matchesFilter(item,filter){
  if(typeof filter==='string')return filterString(item,filter);
  if(Array.isArray(filter)){
    if(filter.length===2&&typeof filter[0]==='string'&&filter[0].startsWith('item:')&&(typeof filter[1]!=='object'||filter[1]===null))
      return filterString(item,filter[0]+':'+filter[1]);
    return filter.every(f=>matchesFilter(item,f));
  }
  if(!filter||typeof filter!=='object')return true;
  if(Array.isArray(filter.or))return filter.or.some(f=>matchesFilter(item,f));
  if(Array.isArray(filter.and))return filter.and.every(f=>matchesFilter(item,f));
  if(Array.isArray(filter.nor))return filter.nor.every(f=>!matchesFilter(item,f));
  if('not' in filter)return !matchesFilter(item,filter.not);
  for(const op of ['eq','ne','gt','gte','lt','lte'])if(Array.isArray(filter[op]))return compare(item,op,filter[op]);
  return true;
}
/** Fill "{item|flags.pf2e.rulesSelections.x}" from the picks; a filter that still has one is dropped. */
function fillPlaceholders(filter,choices){
  const text=JSON.stringify(filter).replace(PLACEHOLDER,(match,flag)=>{
    const value=choices?.[flag];
    return typeof value==='string'&&value?value.replace(/["\\]/g,''):match;
  });
  return text.includes('{item|')?null:JSON.parse(text);
}
function queryOptions(query,catalog,choices){
  const type=typeof query.itemType==='string'?query.itemType.toLowerCase():null;
  const filters=(Array.isArray(query.filter)?query.filter:[]).map(f=>fillPlaceholders(f,choices)).filter(f=>f!==null);
  const mentionsTag=JSON.stringify(filters).includes('item:tag');
  const pool=type&&type!=='classfeature'?catalog.ofType(type)
    :catalog.types().filter(t=>!['condition','effect','spell','action'].includes(t)||t===type).flatMap(t=>catalog.ofType(t));
  return pool.filter(item=>{
    const category=String(item.metadata?.featType??'').toLowerCase();
    if(type==='classfeature'&&category!=='classfeature')return false;
    if(!type&&category==='classfeature'&&!mentionsTag)return false;
    return filters.every(f=>matchesFilter(item,f));
  }).slice(0,400).map(item=>({value:query.slugsAsValues?item.metadata?.slug??item.uuid:item.uuid,label:item.name,uuid:item.uuid,img:item.img??null}))
    .sort((a,b)=>a.label.localeCompare(b.label));
}

/**
 * "If you would automatically become trained in Survival, you instead become trained in a skill of
 * your choice": one pick per skill the item trains that the character already has (ctx.trainedBefore,
 * the skills trained before this item). Stored as Leveler stores it (levelerSkillFallback1…).
 */
function fallbackSets(source,choices,ctx,seenFlags){
  if(!source.metadata?.skillFallback||!ctx.trainedBefore)return [];
  const trains=effectsOf(source).filter(e=>e.key==='rank'&&!e.predicate&&Number(e.value)>=1)
    .map(e=>/^system\.skills\.([a-z-]+)\.rank$/.exec(e.path)?.[1]).filter(Boolean);
  const overlaps=trains.filter(skill=>ctx.trainedBefore.has(skill));
  return overlaps.map((skill,i)=>{
    const flag='levelerSkillFallback'+(i+1);
    if(seenFlags.has(flag))return null;
    seenFlags.add(flag);
    const options=SKILLS.filter(s=>s===choices?.[flag]||(!ctx.trainedBefore.has(s)&&!trains.includes(s)))
      .map(s=>({value:s,label:titleCase(s),uuid:null,img:null}));
    return {flag,prompt:`Already trained in ${titleCase(skill)}: choose another skill`,source:{uuid:source.uuid,name:source.name},
      depth:0,options,value:choices?.[flag]??null,itemOptions:false};
  }).filter(Boolean);
}

/**
 * The choices an item offers (and those of items its picks grant), with the current picks.
 * Returns {sets:[{flag,prompt,source,options,value,itemOptions}], grants:[{uuid,name}]}.
 */
export function choiceSetsFor(item,choices,catalog,ctx={}){
  const sets=[],grants=[],seenFlags=new Set(),seenItems=new Set();
  const visit=(source,depth)=>{
    if(!source||depth>MAX_DEPTH||seenItems.has(source.uuid))return;
    seenItems.add(source.uuid);
    sets.push(...fallbackSets(source,choices,ctx,seenFlags));
    for(const set of source.metadata?.choiceSets??[]){
      if(!set?.flag||seenFlags.has(set.flag)||!predicateMet(set.predicate,ctx))continue;
      const options=set.query?queryOptions(set.query,catalog,choices)
        :(set.options??[]).filter(o=>predicateMet(o.predicate,ctx)||String(o.value)===String(choices?.[set.flag]??''))
          .map(o=>{const hit=typeof o.value==='string'&&o.value.startsWith('Compendium.')?catalog.get(o.value):null;
            return {value:o.value,label:o.label||hit?.name||String(o.value),uuid:hit?.uuid??null,img:hit?.img??null};});
      if(!options.length)continue;
      seenFlags.add(set.flag);
      sets.push({flag:set.flag,prompt:set.prompt||'Choose',source:{uuid:source.uuid,name:source.name},depth,
        options,value:choices?.[set.flag]??null,itemOptions:options.every(o=>o.uuid)});
    }
    // Picked items: granted by a placeholder GrantItem, or picked directly; follow their choices.
    const next=[];
    // Fixed grants too (a feat that grants another with its own choice), as Leveler's grant preview does.
    for(const grant of effectsOf(source)){
      if(grant.key!=='grant'||String(grant.uuid).includes('{actor|')||!predicateMet(grant.predicate,ctx))continue;
      // Conditional fixed grants show in the item's rules summary and, once met, under "Gained automatically".
      if(grant.predicate&&!String(grant.uuid).includes('{'))continue;
      const uuid=resolveGrantUuid(grant.uuid,choices);
      const granted=uuid?catalog.get(uuid):null;
      if(granted){grants.push({uuid:granted.uuid,name:granted.name,from:source.name});next.push(granted);}
    }
    for(const set of source.metadata?.choiceSets??[]){
      const value=choices?.[set.flag];
      const picked=typeof value==='string'?catalog.get(value):null;
      if(picked)next.push(picked);
    }
    for(const child of next)visit(child,depth+1);
  };
  visit(item,0);
  return {sets,grants};
}
/** Every choice made (for "done" checks): all sets that offer options have a value. */
export const choicesComplete=result=>result.sets.every(s=>s.value!==null&&s.value!==undefined&&s.value!=='');

/** Set or clear one pick; picks that only existed under a different earlier pick are dropped. */
export function setChoice(item,choices,flag,value,catalog,ctx={}){
  const next={...(choices??{})};
  if(value===null||value===undefined||value==='')delete next[flag];else next[flag]=value;
  const live=new Set(choiceSetsFor(item,next,catalog,ctx).sets.map(s=>s.flag));
  for(const key of Object.keys(next))if(!live.has(key))delete next[key];
  return next;
}

/**
 * Leveler's stored form of the sets (creation feats keep choiceSets beside choices; it reads them
 * to add picked spells and skills). Only each set's picked option is kept.
 */
export function storedChoiceSets(item,choices,catalog,ctx={}){
  return choiceSetsFor(item,choices,catalog,ctx).sets.map(set=>{
    const picked=set.options.find(o=>String(o.value)===String(set.value));
    const type=picked?.uuid?catalog.get(picked.uuid)?.type??null:null;
    return {flag:set.flag,prompt:set.prompt,options:picked?[{value:picked.value,label:picked.label,
      ...(picked.uuid?{uuid:picked.uuid}:{}),...(type?{type}:{})}]:[]};
  });
}

/** What predicates can be checked against: class, ancestry, heritage and feats taken. */
export function choiceContext(creation,plan,lookup){
  const slug=entry=>entry?(lookup(entry.uuid)?.metadata?.slug??entry.slug??null):null;
  const feats=new Set();
  const add=entry=>{const s=slug(entry);if(s)feats.add(s);};
  for(const key of ['ancestryFeat','ancestryParagonFeat','classFeat','dualClassFeat','skillFeat'])add(creation?.[key]);
  for(const data of Object.values(plan?.levels??{}))for(const value of Object.values(data??{}))
    if(Array.isArray(value))value.forEach(v=>v&&typeof v==='object'&&v.uuid&&add(v));
  return {feats,class:slug(creation?.class),ancestry:slug(creation?.ancestry),heritage:slug(creation?.heritage)};
}
