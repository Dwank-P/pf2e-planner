/**
 * What a PF2e character owns without picking it, at a level: items granted by GrantItem rules on
 * everything it has (ancestry, heritage, background, class and its features, subclass, deity,
 * feats), followed through placeholders the way the PF2e system does:
 *   Cleric's First Doctrine grants "{actor|flags.system.cleric.firstDoctrine}" (flags.pf2e before PF2e 8); the Warpriest doctrine
 *   sets that flag to "First Doctrine (Warpriest)", which grants Shield Block and Deadly Simplicity.
 * Also the proficiency ranks those items set (ActiveEffectLike upgrades), e.g. Warpriest's armor
 * expertise at 13.
 *
 * Reads metadata.ruleEffects from the Bridge (0.32+); older syncs fall back to grantItems and
 * grantChoices. Predicates this can't read count as not met, so nothing is granted by guesswork.
 */

import {skillRanks} from './legality.js';
import {evaluateFormula} from './formula.js';

const CREATION_FEATS=['ancestryFeat','ancestryParagonFeat','classFeat','dualClassFeat','skillFeat','mythicCalling'];
const PLAN_FEATS=['classFeats','skillFeats','generalFeats','ancestryFeats','archetypeFeats','mythicFeats','dualClassFeats','customFeats'];
const HANDLER_SOURCES=['deity','implement','innovationItem','innovationModification','secondElement','subconsciousMind','thesis',
  'devotionSpell','tactics','ikons','kineticImpulses','apparitions'];
const MAX_PASSES=6;
const slugify=s=>String(s??'').toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const slugOf=item=>item?.metadata?.slug||slugify(item?.name);

/** The rules an item carries, in one shape: ruleEffects, else the older grantItems/grantChoices. */
export function effectsOf(item){
  const m=item?.metadata??{};
  if(Array.isArray(m.ruleEffects))return m.ruleEffects;
  return [...(m.grantItems??[]),...(m.grantChoices??[])].map(g=>({key:'grant',uuid:g.uuid,...(g.predicate?{predicate:g.predicate}:{})}));
}

// ---- Predicates (strict: unknown is not met) ------------------------------------------------

function option(text,ctx){
  const s=String(text);
  if(s==='self:level')return ctx.level;
  const [domain,...rest]=s.split(':');
  const value=rest.join(':');
  // Roll options from picks ("champion-dedication:light-and-medium", "feat:order-explorer:animal-order").
  if(ctx.options?.has(s))return true;
  switch(domain){
    case 'feature':return ctx.features.has(value);
    case 'feat':return ctx.feats.has(value);
    case 'class':return ctx.classes.has(value);
    case 'ancestry':return ctx.ancestry===value;
    case 'heritage':return ctx.heritage===value;
    case 'deity':return !value?!!ctx.deity:value.startsWith('primary:')?ctx.deity===value.slice(8):null;
    // The item that granted this rule's item (a bloodline granted by Crossblooded Evolution).
    case 'parent':return value.startsWith('granter:slug:')?ctx.granter===value.slice(13):null;
    default:
      // A pick's roll option this character could have but doesn't.
      return ctx.optionDomains?.has(domain)?false:null;
  }
}
function numeric(v,ctx){
  if(typeof v==='number')return v;
  // "skill:crafting:rank" (Stonemason's Eye grants Specialty Crafting when trained in Crafting).
  const skill=/^skill:([\w-]+):rank$/.exec(String(v));
  if(skill&&ctx.skillRank)return ctx.skillRank(skill[1].replace(/-/g,' '));
  const r=option(v,ctx);
  return typeof r==='number'?r:Number.isFinite(Number(v))?Number(v):null;
}
export function predicateHolds(predicate,ctx){
  const test=p=>{
    if(typeof p==='string'){const r=option(p,ctx);return r===true||(typeof r==='number'&&r>0);}
    if(Array.isArray(p))return p.every(test);
    if(!p||typeof p!=='object')return false;
    if(Array.isArray(p.and))return p.and.every(test);
    if(Array.isArray(p.or))return p.or.some(test);
    if(Array.isArray(p.nor))return !p.nor.some(test);
    if('not' in p){
      // "not" of something unreadable stays unknown, so not met.
      if(typeof p.not==='string'&&option(p.not,ctx)===null)return false;
      return !test(p.not);
    }
    for(const op of ['gte','gt','lte','lt','eq']){
      if(!Array.isArray(p[op]))continue;
      const [a,b]=p[op].map(v=>numeric(v,ctx));
      if(a===null||b===null)return false;
      return {gte:a>=b,gt:a>b,lte:a<=b,lt:a<b,eq:a===b}[op];
    }
    return false;
  };
  return predicate===undefined||predicate===null?true:test(predicate);
}

// ---- Placeholders -----------------------------------------------------------------------------

const getPath=(object,path)=>path.split('.').reduce((o,k)=>o&&typeof o==='object'?o[k]:undefined,object);
function setPath(object,path,value){
  const keys=path.split('.');
  let o=object;
  for(const k of keys.slice(0,-1)){if(!o[k]||typeof o[k]!=='object')o[k]={};o=o[k];}
  const last=keys.at(-1);
  o[last]=value&&typeof value==='object'&&o[last]&&typeof o[last]==='object'?{...o[last],...value}:value;
}
/** "{item|flags.pf2e.rulesSelections.x}" from the source's picks, "{actor|flags.pf2e.…}" from actor flags. */
export function resolvePlaceholders(uuid,{choices={},flags={}}){
  let missing=false;
  const out=String(uuid).replace(/\{(item|actor)\|([^}]+)\}/g,(_,scope,path)=>{
    const value=scope==='item'
      ?choices?.[path.replace(/^flags\.(?:pf2e|system)\.rulesSelections\./,'')]
      :getPath({flags},path);
    if(typeof value!=='string'||!value){missing=true;return '';}
    return value;
  });
  return missing?null:out;
}

// ---- What the character owns ---------------------------------------------------------------

/** Items the character chose or its classes give, with the picks stored on them. */
function sources(creation,plan,lookup,level,variants){
  const c=creation??{};
  const out=[];
  // Leveler keeps an origin's picks (and a granted feat's) in grantedFeatChoices by uuid.
  const stored=uuid=>c.grantedFeatChoices?.[uuid]??{};
  const add=(entry,from=null)=>{
    const item=entry?.uuid?lookup(entry.uuid):null;
    if(item)out.push({item,choices:{...stored(entry.uuid),...stored(item.uuid),...(entry.choices??{})},from,grantedBy:null});
  };
  const classes=[c.class,variants?.dualClass===false?null:c.dualClass].filter(Boolean);
  for(const entry of classes){
    add(entry);
    const item=lookup(entry.uuid);
    for(const f of item?.metadata?.grantedFeatures??[])
      if(f?.uuid&&Number(f.level)<=level)add({uuid:f.uuid},item?.name??null);
  }
  for(const key of ['ancestry','heritage','background','subclass','dualSubclass'])add(c[key]);
  for(const bucket of [c,c.classSelections?.class,c.classSelections?.dualClass].filter(Boolean))
    for(const key of HANDLER_SOURCES)for(const entry of [].concat(bucket[key]??[]))if(entry&&typeof entry==='object')add(entry);
  for(const key of CREATION_FEATS)add(c[key]);
  for(let l=2;l<=level;l++){
    const data=plan?.levels?.[l]??{};
    for(const key of PLAN_FEATS)for(const entry of data[key]??[])add(entry);
  }
  return out;
}
function context(records,creation,lookup,level,plan=null){
  const features=new Set(),feats=new Set(),classes=new Set(),options=new Set(),optionDomains=new Set();
  for(const {item,choices} of records){
    const slug=slugOf(item);
    let prefix=null;
    if(item.type==='class')classes.add(slug);
    else if(item.type==='feat'){
      const category=String(item.metadata?.featType??item.metadata?.category??'');
      prefix=category==='classfeature'?'feature':'feat';
      (prefix==='feature'?features:feats).add(slug);
    }
    // Each pick adds "<rollOption>:<value>" and "feat:<slug>:<value>", as PF2e does.
    for(const set of item.metadata?.choiceSets??[]){
      if(set.rollOption)optionDomains.add(set.rollOption.split(':')[0]);
      const value=choices?.[set.flag];
      if(typeof value!=='string'||!value)continue;
      const picked=value.startsWith('Compendium.')?lookup(value):null;
      const v=picked?slugOf(picked):slugify(value);
      if(set.rollOption)options.add(set.rollOption+':'+v);
      if(prefix)options.add(prefix+':'+slug+':'+v);
    }
  }
  const slug=entry=>entry?.uuid?slugOf(lookup(entry.uuid)??entry):null;
  // Skill ranks from training and increases (not from grants, which would recurse here).
  let skills=null;
  const skillRank=name=>(skills??=skillRanks(creation,plan,lookup,level,{grants:false})).get(name)??0;
  return {level,features,feats,classes,options,optionDomains,skillRank,ancestry:slug(creation?.ancestry),heritage:slug(creation?.heritage),
    deity:slug(creation?.classSelections?.class?.deity??creation?.deity)};
}

const withGranter=(ctx,record)=>record.grantedBy?{...ctx,granter:slugOf(record.grantedBy)}:ctx;

/**
 * Everything granted at `level`: {granted:[{item, from}], flags, ranks:{perception, fortitude, skill:x, …},
 * lores: Map('catfolk lore' → rank), speed: bonus in feet, suppressed: uuids of class features another
 * item replaces}.
 * `granted` excludes what the character picked itself.
 */
export function grantsAt(creation,plan,lookup,level=1,variants={},{base=()=>0}={}){
  const all0=sources(creation,plan,lookup,level,variants);
  // Features another owned item replaces (a class archetype's suppressedFeatures) aren't owned.
  const suppressed=new Set(all0.flatMap(r=>(r.item.metadata?.suppressedFeatures??[]).map(u=>lookup(u)?.uuid??u)));
  const records=all0.filter(r=>!suppressed.has(r.item.uuid));
  const owned=new Map(records.map(r=>[r.item.uuid,r]));
  const granted=new Map();
  let flags={};
  for(let pass=0;pass<MAX_PASSES;pass++){
    const all=[...owned.values()];
    const ctx=context(all,creation,lookup,level,plan);
    // Flags first: a doctrine's flags decide what First Doctrine grants.
    flags={};
    for(const r of all)for(const e of effectsOf(r.item))
      if(e.key==='flag'&&predicateHolds(e.predicate,withGranter(ctx,r)))setPath({flags},e.path,e.value);
    let added=false;
    for(const r of all)for(const e of effectsOf(r.item)){
      if(e.key!=='grant'||!predicateHolds(e.predicate,withGranter(ctx,r)))continue;
      const uuid=resolvePlaceholders(e.uuid,{choices:r.choices,flags});
      const item=uuid?lookup(uuid):null;
      if(!item||granted.has(item.uuid))continue;
      const own=creation?.grantedFeatChoices?.[item.uuid]??{};
      const record={item,choices:{...r.choices,...own},from:r.item.name,grantedBy:r.item};
      // Also noted when the player picked it too (a wasted pick the website points out).
      granted.set(item.uuid,record);
      if(!owned.has(item.uuid)){owned.set(item.uuid,record);added=true;}
    }
    if(!added)break;
  }
  // Proficiency ranks set by owned items (upgrade = at least this rank). `base` gives the ranks the
  // character has otherwise (class, training), which formulas may read.
  const ctx=context([...owned.values()],creation,lookup,level,plan);
  const ranks={},lores=new Map();
  let speed=0;
  // Training an item gives outright (PF2e subfeatures.proficiencies): owned means it applies.
  for(const r of owned.values())for(const [name,rank] of Object.entries(r.item.metadata?.proficiencies??{})){
    const key=SUBFEATURE_KEYS[name]??(SKILLS.has(name)||/-lore$/.test(name)?'skill:'+name:null);
    if(key)ranks[key]=Math.max(ranks[key]??0,Number(rank)||0);
  }
  // A skill picked because the item would train one the character already has (Leveler's
  // levelerSkillFallback1… choices: Catfolk Lore with Survival already trained).
  for(const r of owned.values())for(const [flag,value] of Object.entries(r.choices??{}))
    if(/^levelerSkillFallback\d+$/.test(flag)&&typeof value==='string'&&value)ranks['skill:'+value]=Math.max(ranks['skill:'+value]??0,1);
  const rules=[];
  for(const r of owned.values())for(const e of effectsOf(r.item)){
    if(!['rank','lore','speed'].includes(e.key)||!predicateHolds(e.predicate,withGranter(ctx,r)))continue;
    if(e.key==='speed'){speed+=Number(e.value)||0;continue;}
    // "system.skills.{item|flags.system.rulesSelections.skill}.rank": the skill picked on this item.
    const path=resolvePlaceholders(e.path,{choices:r.choices,flags});
    if(path)rules.push({e,r,path});
  }
  // Plain numbers first, then formulas (which may read ranks: heavy armor = medium armor).
  rules.sort((a,b)=>(typeof a.e.value==='number'||typeof a.e.rank==='number'?0:1)-(typeof b.e.value==='number'||typeof b.e.rank==='number'?0:1)
    ||(a.e.priority??50)-(b.e.priority??50));
  const current=key=>Math.max(Number(base(key))||0,ranks[key]??0);
  // "@actor.level", "@actor.system…rank", and "@item.flags.system.rulesSelections.rank" (a picked rank).
  const refFor=r=>path=>{
    if(path==='actor.level')return level;
    const pick=/^item\.flags\.(?:pf2e|system)\.rulesSelections\.([\w-]+)$/.exec(path);
    if(pick){const v=Number(r.choices?.[pick[1]]);return Number.isFinite(v)?v:null;}
    const key=path.startsWith('actor.system.')?rankKey(path.slice(6)):null;
    return key?current(key):null;
  };
  // A value that is itself a pick ("{item|flags.system.rulesSelections.deceptionRank}": Dandy Dedication).
  const valueOf=(value,r)=>evaluateFormula(typeof value==='string'&&value.includes('{')
    ?resolvePlaceholders(value,{choices:r.choices,flags})??'':value,refFor(r));
  for(const {e,r,path} of rules){
    if(e.key==='lore'){
      const rank=valueOf(e.rank,r);
      if(rank===null)continue;
      const label=resolvePlaceholders(String(e.label||'').replace('{item|name}',r.item.name),{choices:r.choices,flags})
        ||path.split('.').pop().replace(/-/g,' ');
      const name=String(label).toLowerCase().replace(/\s+lore$/,'')+' lore';
      lores.set(name,Math.max(lores.get(name)??0,rank));
      continue;
    }
    const key=rankKey(path);
    const value=key?valueOf(e.value,r):null;
    if(value===null)continue;
    ranks[key]=e.mode==='override'?value:Math.max(ranks[key]??0,value);
  }
  return {granted:[...granted.values()].map(({item,from})=>({item,from})),flags,ranks,lores,speed,suppressed};
}
const DEFENSES=['unarmored','light','medium','heavy'],ATTACKS=['unarmed','simple','martial','advanced'];
// subfeatures.proficiencies keys: saves, Perception, armor and weapon categories, class DC; skills by slug.
export const SUBFEATURE_KEYS=Object.fromEntries([...DEFENSES,...ATTACKS,'perception','fortitude','reflex','will'].map(k=>[k,k]));
SUBFEATURE_KEYS.classDC=SUBFEATURE_KEYS['class-dc']=SUBFEATURE_KEYS.classdc='classDC';
// Other keys (weapon groups, a deity's favored weapon…) aren't tracked.
const SKILLS=new Set(['acrobatics','arcana','athletics','crafting','deception','diplomacy','intimidation','medicine','nature',
  'occultism','performance','religion','society','stealth','survival','thievery','computers','piloting']);
function rankKey(path){
  let m;
  if(path==='system.perception.rank')return 'perception';
  if((m=/^system\.saves\.(fortitude|reflex|will)\.rank$/.exec(path)))return m[1];
  if((m=/^system\.proficiencies\.defenses\.([\w-]+)\.rank$/.exec(path)))return DEFENSES.includes(m[1])?m[1]:null;
  if((m=/^system\.proficiencies\.attacks\.([\w-]+)\.rank$/.exec(path)))return ATTACKS.includes(m[1])?m[1]:null;
  if(/^system\.proficiencies\.classDCs\.[\w-]+\.rank$/.test(path))return 'classDC';
  if((m=/^system\.skills\.([\w-]+)\.rank$/.exec(path)))return 'skill:'+m[1];
  return null;
}

/** Granted items first gained at `level` (not owned at level − 1). */
export function grantedNewAt(creation,plan,lookup,level,variants={}){
  const now=grantsAt(creation,plan,lookup,level,variants).granted;
  if(level<=1)return now;
  const before=new Set(grantsAt(creation,plan,lookup,level-1,variants).granted.map(g=>g.item.uuid));
  return now.filter(g=>!before.has(g.item.uuid));
}
