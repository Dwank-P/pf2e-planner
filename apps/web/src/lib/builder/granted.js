/**
 * What a PF2e character owns without picking it, at a level: items granted by GrantItem rules on
 * everything it has (ancestry, heritage, background, class and its features, subclass, deity,
 * feats), followed through placeholders the way the PF2e system does:
 *   Cleric's First Doctrine grants "{actor|flags.pf2e.cleric.firstDoctrine}"; the Warpriest doctrine
 *   sets that flag to "First Doctrine (Warpriest)", which grants Shield Block and Deadly Simplicity.
 * Also the proficiency ranks those items set (ActiveEffectLike upgrades), e.g. Warpriest's armor
 * expertise at 13.
 *
 * Reads metadata.ruleEffects from the Bridge (0.32+); older syncs fall back to grantItems and
 * grantChoices. Predicates this can't read count as not met, so nothing is granted by guesswork.
 */

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
  switch(domain){
    case 'feature':return ctx.features.has(value);
    case 'feat':return ctx.feats.has(value);
    case 'class':return ctx.classes.has(value);
    case 'ancestry':return ctx.ancestry===value;
    case 'heritage':return ctx.heritage===value;
    case 'deity':return value.startsWith('primary:')?ctx.deity===value.slice(8):null;
    default:return null;
  }
}
function numeric(v,ctx){
  if(typeof v==='number')return v;
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
  const add=(entry,from=null)=>{
    const item=entry?.uuid?lookup(entry.uuid):null;
    if(item)out.push({item,choices:entry.choices??{},from});
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
function context(records,creation,lookup,level){
  const features=new Set(),feats=new Set(),classes=new Set();
  for(const {item} of records){
    const slug=slugOf(item);
    if(item.type==='class')classes.add(slug);
    else if(item.type==='feat'){
      const category=String(item.metadata?.featType??item.metadata?.category??'');
      (category==='classfeature'?features:feats).add(slug);
    }
  }
  const slug=entry=>entry?.uuid?slugOf(lookup(entry.uuid)??entry):null;
  return {level,features,feats,classes,ancestry:slug(creation?.ancestry),heritage:slug(creation?.heritage),
    deity:slug(creation?.classSelections?.class?.deity??creation?.deity)};
}

/**
 * Everything granted at `level`: {granted:[{item, from}], flags, ranks:{perception, fortitude, …}}.
 * `granted` excludes what the character picked itself.
 */
export function grantsAt(creation,plan,lookup,level=1,variants={}){
  const records=sources(creation,plan,lookup,level,variants);
  const owned=new Map(records.map(r=>[r.item.uuid,r]));
  const granted=new Map();
  let flags={};
  for(let pass=0;pass<MAX_PASSES;pass++){
    const all=[...owned.values()];
    const ctx=context(all,creation,lookup,level);
    // Flags first: a doctrine's flags decide what First Doctrine grants.
    flags={};
    for(const r of all)for(const e of effectsOf(r.item))
      if(e.key==='flag'&&predicateHolds(e.predicate,ctx))setPath({flags},e.path,e.value);
    let added=false;
    for(const r of all)for(const e of effectsOf(r.item)){
      if(e.key!=='grant'||!predicateHolds(e.predicate,ctx))continue;
      const uuid=resolvePlaceholders(e.uuid,{choices:r.choices,flags});
      const item=uuid?lookup(uuid):null;
      if(!item||granted.has(item.uuid))continue;
      const record={item,choices:r.choices,from:r.item.name};
      // Also noted when the player picked it too (a wasted pick the website points out).
      granted.set(item.uuid,record);
      if(!owned.has(item.uuid)){owned.set(item.uuid,record);added=true;}
    }
    if(!added)break;
  }
  // Proficiency ranks set by owned items (upgrade = at least this rank).
  const ctx=context([...owned.values()],creation,lookup,level);
  const ranks={};
  for(const r of owned.values())for(const e of effectsOf(r.item)){
    if(e.key!=='rank'||!predicateHolds(e.predicate,ctx))continue;
    const key=rankKey(e.path);
    if(!key)continue;
    ranks[key]=e.mode==='override'?Number(e.value):Math.max(ranks[key]??0,Number(e.value));
  }
  return {granted:[...granted.values()].map(({item,from})=>({item,from})),flags,ranks};
}
const DEFENSES=['unarmored','light','medium','heavy'],ATTACKS=['unarmed','simple','martial','advanced'];
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
