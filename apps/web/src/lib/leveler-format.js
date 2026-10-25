/**
 * Canonical character storage uses PF2e Leveler's own documents:
 *   leveler.creation  — the Character Wizard data (actor flag pf2e-leveler.creation)
 *   leveler.plan      — the Level Planner plan   (actor flag pf2e-leveler.plan)
 * Website-only extras (attribute modifiers, notes, unmapped picks) live in `planner`.
 *
 * The builder UI still edits a slot-keyed "view" ({feats:{'class-2':uuid},...}).
 * projectView() derives that view; applyView() merges an edited view back into
 * the Leveler documents. Entries whose uuid is unchanged are kept verbatim, so
 * metadata written by Leveler inside Foundry (choices, skillRules, grantedItems,
 * toRank, …) survives a website round trip.
 */
export const CHARACTER_FORMAT='pf2e-planner-character';
export const SCHEMA_VERSION=2;
export const LEVELER_DOC_VERSION=1;

const ATTR=['str','dex','con','int','wis','cha'];
// Plan level category ↔ website slot kind (see Leveler plan-model createEmptyLevelData).
export const FEAT_CATEGORIES={
  classFeats:'class',skillFeats:'skill',generalFeats:'general',ancestryFeats:'ancestry',
  archetypeFeats:'archetype',dualClassFeats:'dual-class',mythicFeats:'mythic'
};
const CATEGORY_FOR_KIND=Object.fromEntries(Object.entries(FEAT_CATEGORIES).map(([c,k])=>[k,c]));
// Level-one feats live in the creation document.
const CREATION_FEATS={ancestryFeat:'ancestry-1',ancestryParagonFeat:'ancestry-1-2',
  classFeat:'class-1',dualClassFeat:'dual-class-1',skillFeat:'skill-1',mythicCalling:'mythic-1'};
const CREATION_FEAT_FOR_KEY=Object.fromEntries(Object.entries(CREATION_FEATS).map(([f,k])=>[k,f]));
const CREATION_BOOSTS={ancestry:'ancestry-boost-1',background:'background-1',class:'class-1',free:'free-1'};
// Read-only creation choices shown in the builder (edited inside Leveler for now).
// Subclasses are editable slots (subclassUuid / dualSubclassUuid), not listed here.
export const CREATION_CHOICE_FIELDS=['deity','sanctification',
  'divineFont','subconsciousMind','thesis','implement','tactics','ikons',
  'innovationItem','innovationModification','kineticGateMode','secondElement',
  'apparitions','primaryApparition','skills','languages','classSelections'];
const IDENTITY={classUuid:'class',secondClassUuid:'dualClass',ancestryUuid:'ancestry',
  heritageUuid:'heritage',backgroundUuid:'background'};

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
export const slotSuffix=source=>String(source??'').trim().toLowerCase()
  .replace(/[^a-z0-9-]+/g,'-').slice(0,20);
export function slugify(value){
  return String(value??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

/** Mirrors Leveler's createCreationData() defaults so the wizard opens cleanly. */
export function emptyCreation(){
  const selections=()=>({implement:null,tactics:[],ikons:[],innovationItem:null,
    innovationModification:null,kineticGateMode:null,secondElement:null,kineticImpulses:[],
    subconsciousMind:null,thesis:null,apparitions:[],primaryApparition:null,deity:null,
    sanctification:null,divineFont:null,devotionSpell:null});
  return {version:LEVELER_DOC_VERSION,ancestry:null,heritage:null,mixedAncestry:null,
    background:null,class:null,dualClass:null,flexiblePreparation:false,
    dualFlexiblePreparation:false,subclass:null,dualSubclass:null,
    classSelections:{class:selections(),dualClass:selections()},...selections(),
    alternateAncestryBoosts:false,boosts:{free:[]},languages:[],lores:[],
    selectedLoreSkills:[],skills:[],ancestryFeat:null,ancestryParagonFeat:null,
    classFeat:null,dualClassFeat:null,skillFeat:null,mythicCalling:null,
    grantedFeatSections:[],grantedFeatChoices:{},featGrants:[],
    spells:{cantrips:[],rank1:[]},dualSpells:{cantrips:[],rank1:[]},
    curriculumSpells:{cantrips:[],rank1:[]},dualCurriculumSpells:{cantrips:[],rank1:[]},
    equipment:[]};
}
export function emptyPlan(classSlug,dualClassSlug=null){
  return {version:LEVELER_DOC_VERSION,classSlug,dualClassSlug,levels:{}};
}
export function emptyDocument(){
  return {format:CHARACTER_FORMAT,schemaVersion:SCHEMA_VERSION,
    leveler:{creation:emptyCreation(),plan:null},
    planner:{modifiers:Object.fromEntries(ATTR.map(a=>[a,0])),notes:'',extraFeats:{}}};
}
export function isCharacterDocument(value){
  return isObject(value)&&value.format===CHARACTER_FORMAT&&isObject(value.leveler);
}

/** Wrap Leveler data received from Foundry, without altering its contents. */
export function documentFromLeveler({creation=null,plan=null}={},planner={}){
  const doc=emptyDocument();
  if(isObject(creation))doc.leveler.creation={...emptyCreation(),...clone(creation)};
  if(isObject(plan)&&isObject(plan.levels))doc.leveler.plan=clone(plan);
  Object.assign(doc.planner,clone(planner)||{});
  return doc;
}

function rankKey(entry,fallbackRank){
  if(entry?.isCantrip===true)return 'cantrip';
  const rank=Number(entry?.rank??entry?.baseRank??fallbackRank);
  return Number.isInteger(rank)&&rank>=1&&rank<=10?'rank-'+rank:null;
}
function pushUnique(map,key,uuid){
  if(!key||typeof uuid!=='string')return;
  (map[key]??=[]);
  if(!map[key].includes(uuid))map[key].push(uuid);
}
function skillKey(level,entry,index){
  const source=String(entry?.source??'').trim();
  return 'skill-increase-'+level+(source?'-'+slotSuffix(source):index?'-'+(index+1):'');
}

/** Slot-keyed builder view derived from the canonical Leveler documents. */
export function projectView(doc){
  const creation=doc?.leveler?.creation||{};
  const plan=doc?.leveler?.plan||null;
  const view={classUuid:null,secondClassUuid:null,ancestryUuid:null,heritageUuid:null,
    backgroundUuid:null,feats:{},abilityBoosts:{},skillIncreases:{},equipment:[],spells:{},
    modifiers:{...Object.fromEntries(ATTR.map(a=>[a,0])),...(doc?.planner?.modifiers||{})},
    creationChoices:{},notes:String(doc?.planner?.notes??'')};
  for(const [key,field] of Object.entries(IDENTITY))
    view[key]=typeof creation[field]?.uuid==='string'?creation[field].uuid:null;
  for(const [field,key] of Object.entries(CREATION_FEATS))
    if(typeof creation[field]?.uuid==='string')view.feats[key]=creation[field].uuid;
  for(const [key,uuid] of Object.entries(doc?.planner?.extraFeats||{}))
    if(typeof uuid==='string'&&!view.feats[key])view.feats[key]=uuid;
  for(const [source,key] of Object.entries(CREATION_BOOSTS)){
    const boosts=creation.boosts?.[source];
    if(Array.isArray(boosts)&&boosts.length)
      view.abilityBoosts[key]=[...new Set(boosts.map(x=>String(x).toLowerCase()).filter(x=>ATTR.includes(x)))];
  }
  view.subclassUuid=typeof creation.subclass?.uuid==='string'?creation.subclass.uuid:null;
  view.dualSubclassUuid=typeof creation.dualSubclass?.uuid==='string'?creation.dualSubclass.uuid:null;
  // Spells are keyed by the level they are learned at: "<level>:<cantrip|rank-N>".
  for(const entry of creation.spells?.cantrips||[])pushUnique(view.spells,'1:cantrip',entry?.uuid);
  for(const entry of creation.spells?.rank1||[])pushUnique(view.spells,'1:rank-1',entry?.uuid);
  for(const entry of creation.equipment||[])
    if(typeof entry?.uuid==='string'&&!view.equipment.includes(entry.uuid))view.equipment.push(entry.uuid);
  for(const field of CREATION_CHOICE_FIELDS){
    const value=creation[field];
    if(value===null||value===undefined)continue;
    if(Array.isArray(value)&&!value.length)continue;
    view.creationChoices[field]=clone(value);
  }
  if(Array.isArray(creation.boosts?.dualClass))view.creationChoices.dualClassBoosts=[...creation.boosts.dualClass];
  // Name-only subclasses (older imports) can't fill the slot; show them read-only.
  for(const field of ['subclass','dualSubclass'])
    if(isObject(creation[field])&&typeof creation[field].uuid!=='string')
      view.creationChoices[field]=clone(creation[field]);
  for(const [lvl,data] of Object.entries(plan?.levels||{})){
    const level=Number(lvl);
    if(!Number.isInteger(level)||level<2||level>20||!isObject(data))continue;
    for(const [category,kind] of Object.entries(FEAT_CATEGORIES)){
      (Array.isArray(data[category])?data[category]:[]).forEach((entry,index)=>{
        if(typeof entry?.uuid==='string')
          view.feats[kind+'-'+level+(index?'-'+(index+1):'')]=entry.uuid;
      });
    }
    const boosts=Array.isArray(data.abilityBoosts)?data.abilityBoosts
      .map(x=>String(x).toLowerCase()).filter(x=>ATTR.includes(x)):[];
    if(boosts.length)view.abilityBoosts['level-'+level]=[...new Set(boosts)];
    (Array.isArray(data.skillIncreases)?data.skillIncreases:[]).forEach((entry,index)=>{
      const skill=String(entry?.skill??'').trim().toLowerCase();
      if(/^[-a-z0-9]{2,40}$/.test(skill))view.skillIncreases[skillKey(level,entry,index)]=skill;
    });
    for(const entry of Array.isArray(data.spells)?data.spells:[]){
      const key=rankKey(entry);
      if(key)pushUnique(view.spells,level+':'+key,entry?.uuid);
    }
  }
  return view;
}

function minimalItem(item){
  const out={uuid:item.uuid,name:item.name??null,img:item.img??null,
    slug:item.metadata?.slug??item.slug??slugify(item.name)};
  if(item.unresolved)out.unresolved=true;
  return out;
}
export function featEntry(item){
  return {...minimalItem(item),level:Number.isInteger(item.level)?item.level:null,
    traits:Array.isArray(item.traits)?[...item.traits]:[],choices:{}};
}
function identityEntry(field,item){
  const base=minimalItem(item);
  if(field==='ancestry'||field==='heritage')
    return {...base,traits:Array.isArray(item.traits)?[...item.traits]:[],
      ...(field==='heritage'?{grantedSkills:[]}:{})};
  if(field==='class'||field==='dualClass'){
    const progression=item.metadata?.levelerProgression;
    return {...base,slug:progression?.slug||base.slug,
      publication:item.metadata?.publication??null,sourcePack:item.pack??null,sourcePackage:null,
      keyAbility:Array.isArray(progression?.keyAbility)?[...progression.keyAbility]
        :Array.isArray(item.metadata?.keyAbility)?[...item.metadata.keyAbility]:null,
      subclassTag:null};
  }
  return base;
}
/** Mirrors Leveler's setSubclass() shape; the wizard fills curriculum/choices. */
function subclassEntry(item){
  return {...minimalItem(item),tradition:null,spellUuids:[],grantedSkills:[],grantedLores:[],
    choiceSets:[],choices:{},choiceCurricula:{},curriculum:null};
}
export function spellEntry(item,rank,isCantrip){
  const traits=[...(Array.isArray(item.traits)?item.traits:[]),
    ...(Array.isArray(item.metadata?.spellTraditions)?item.metadata.spellTraditions:[])];
  return {...minimalItem(item),rank:isCantrip?0:rank,
    baseRank:Number(item.metadata?.spellRank??item.level??rank)||rank,
    isCantrip,entryType:'primary',traits};
}
/** First character level whose spell slots include `rank`; default odd-level casting. */
function levelForRank(rank,spellSlots){
  for(let level=2;level<=20;level++){
    const slots=spellSlots?.[level]??spellSlots?.[String(level)];
    if(slots&&Number(slots[rank]??slots[String(rank)])>0)return level;
  }
  return Math.max(2,Math.min(20,rank*2-1));
}
function reuse(existing,uuid,make){
  if(existing?.uuid===uuid)return existing;
  return make();
}

/**
 * Merge an edited builder view into the Leveler documents.
 * @param doc     canonical document (not mutated)
 * @param view    slot-keyed view, already validated by the server
 * @param context resolve(uuid) → catalog entry {uuid,name,level,traits,metadata,…};
 *                slots — Leveler choice slots (for skill-increase sources);
 *                spellSlots — class spellcasting slot table; trainedSkills — baseline.
 */
export function applyView(doc,view,context={}){
  const resolve=uuid=>context.resolve?.(uuid)??{uuid,name:null,unresolved:true};
  const next=clone(doc);
  const creation=next.leveler.creation??=emptyCreation();
  next.planner??={};
  next.planner.modifiers={...Object.fromEntries(ATTR.map(a=>[a,0])),...(view.modifiers||{})};
  next.planner.notes=String(view.notes??'');
  next.planner.extraFeats={};

  for(const [key,field] of Object.entries(IDENTITY)){
    const uuid=view[key]??null;
    creation[field]=uuid?reuse(creation[field],uuid,()=>identityEntry(field,resolve(uuid))):null;
  }
  creation.boosts=isObject(creation.boosts)?creation.boosts:{free:[]};
  for(const [source,key] of Object.entries(CREATION_BOOSTS)){
    const chosen=view.abilityBoosts?.[key];
    if(Array.isArray(chosen))creation.boosts[source]=[...chosen];
    else if(source==='free')creation.boosts.free=[];
    else delete creation.boosts[source];
  }

  // Bucket view feats by Leveler destination.
  const planFeats={};
  for(const [key,uuid] of Object.entries(view.feats||{})){
    if(CREATION_FEAT_FOR_KEY[key]){continue;}
    const match=/^([a-z-]+?)-(\d{1,2})(?:-(\d+))?$/.exec(key);
    const category=match&&CATEGORY_FOR_KIND[match[1]];
    const level=match?Number(match[2]):0;
    if(category&&level>=2&&level<=20){
      ((planFeats[level]??={})[category]??=[])[match[3]?Number(match[3])-1:0]=uuid;
    }else next.planner.extraFeats[key]=uuid;
  }
  for(const [field,key] of Object.entries(CREATION_FEATS)){
    const uuid=view.feats?.[key];
    creation[field]=uuid?reuse(creation[field],uuid,()=>({...featEntry(resolve(uuid)),
      choiceSets:[],grantedSkills:[],grantedLores:[]})):null;
  }

  // Subclass slots. A name-only subclass (no uuid, from older imports) is kept
  // until a catalog subclass is chosen.
  for(const [key,field] of [['subclassUuid','subclass'],['dualSubclassUuid','dualSubclass']]){
    const uuid=view[key]??null;
    if(uuid===(creation[field]?.uuid??null))continue;
    creation[field]=uuid?subclassEntry(resolve(uuid)):null;
  }

  // Spells: view keys "<level>:<cantrip|rank-N>"; pre-0.7.1 keys have no level
  // and are placed by rank. Keep stored entries still chosen; add new ones.
  const wanted=new Map();
  for(const [key,uuids] of Object.entries(view.spells||{})){
    const match=/^(?:(\d{1,2}):)?(cantrip|rank-\d{1,2})$/.exec(key);
    if(match&&Array.isArray(uuids))wanted.set((match[1]??'*')+'|'+match[2],new Set(uuids));
  }
  const placed=new Set();
  const keep=(entry,level,fallbackRank)=>{
    const key=rankKey(entry,fallbackRank);
    if(!key)return false;
    for(const id of [level+'|'+key,'*|'+key]){
      if(wanted.get(id)?.has(entry?.uuid)&&!placed.has(id+'|'+entry.uuid)){
        placed.add(id+'|'+entry.uuid);return true;
      }
    }
    return false;
  };
  creation.spells=isObject(creation.spells)?creation.spells:{cantrips:[],rank1:[]};
  creation.spells.cantrips=(creation.spells.cantrips||[]).filter(e=>keep({...e,isCantrip:true},1));
  creation.spells.rank1=(creation.spells.rank1||[]).filter(e=>keep(e,1,1));

  creation.equipment=(view.equipment||[]).map(uuid=>{
    const old=(creation.equipment||[]).find(e=>e?.uuid===uuid);
    return old??{...minimalItem(resolve(uuid)),quantity:1,price:null,pricePer:1};
  });

  const classSlug=creation.class?.slug??null;
  const dualClassSlug=creation.dualClass?.slug??null;
  const planNeeded=next.leveler.plan||Object.keys(planFeats).length||
    Object.keys(view.skillIncreases||{}).length||
    Object.keys(view.abilityBoosts||{}).some(k=>k.startsWith('level-'))||
    [...wanted.keys()].some(id=>{
      const [level,key]=id.split('|');
      return level==='*'?key!=='cantrip'&&key!=='rank-1':Number(level)>=2;
    });
  // New spells go to the level they were chosen at (level 1 → creation). Legacy
  // rank-only picks: cantrips/rank 1 to creation, higher to the first level with that rank.
  const addNewSpells=plan=>{
    for(const [id,uuids] of wanted){
      const [levelKey,key]=id.split('|');
      const cantrip=key==='cantrip';
      const rank=cantrip?0:Number(key.slice(5));
      const level=levelKey!=='*'?Number(levelKey)
        :cantrip||rank===1?1:levelForRank(rank,context.spellSlots);
      for(const uuid of uuids){
        if(placed.has(id+'|'+uuid))continue;
        placed.add(id+'|'+uuid);
        const entry=spellEntry(resolve(uuid),rank,cantrip);
        if(level<=1){(cantrip?creation.spells.cantrips:creation.spells.rank1).push(entry);continue;}
        const data=plan.levels[level]??={};
        (data.spells??=[]).push(entry);
      }
    }
  };
  if(!planNeeded){addNewSpells(null);return next;}
  // Leveler discards a plan whose classSlug differs from the actor's class;
  // a null slug is kept so choices survive while no class is selected.
  const plan=next.leveler.plan??=emptyPlan(classSlug,dualClassSlug);
  plan.version??=LEVELER_DOC_VERSION;
  plan.classSlug=classSlug;
  plan.dualClassSlug=dualClassSlug;
  plan.levels=isObject(plan.levels)?plan.levels:{};

  // Skill increase sources come from existing entries or Leveler's slot schedule.
  const slotSource=new Map((context.slots||[]).filter(s=>s.type==='skill')
    .map(s=>[s.key,s.choiceSource??'']));
  const ranks={};
  const trained=[...(context.trainedSkills||[]),
    ...[view.classUuid,view.backgroundUuid].flatMap(uuid=>uuid?resolve(uuid)?.metadata?.trainedSkills??[]:[]),
    ...(Array.isArray(creation.skills)?creation.skills:[])];
  for(const skill of trained)
    if(typeof skill==='string')ranks[skill.toLowerCase()]=Math.max(ranks[skill.toLowerCase()]??0,1);

  for(let level=2;level<=20;level++){
    const old=isObject(plan.levels[level])?plan.levels[level]:null;
    const data=old?{...old}:{};
    for(const category of Object.keys(FEAT_CATEGORIES)){
      const uuids=(planFeats[level]?.[category]||[]).filter(Boolean);
      const before=Array.isArray(data[category])?data[category]:[];
      if(!uuids.length){if(before.length)data[category]=[];continue;}
      data[category]=uuids.map((uuid,index)=>before[index]?.uuid===uuid?before[index]
        :before.find(e=>e?.uuid===uuid)??featEntry(resolve(uuid)));
    }
    const boosts=[...(view.abilityBoosts?.['level-'+level]||[]),
      ...Object.entries(view.abilityBoosts||{}).filter(([k])=>k.startsWith('level-'+level+'-'))
        .flatMap(([,v])=>v)];
    if(boosts.length)data.abilityBoosts=[...new Set(boosts)];
    else if(Array.isArray(data.abilityBoosts))data.abilityBoosts=[];

    const beforeSkills=Array.isArray(data.skillIncreases)?data.skillIncreases:[];
    const keyed=new Map(beforeSkills.map((entry,index)=>[skillKey(level,entry,index),entry]));
    const increases=[];
    for(const [key,skill] of Object.entries(view.skillIncreases||{})){
      if(Number(/^skill-increase-(\d{1,2})(?:-|$)/.exec(key)?.[1])!==level)continue;
      const prior=keyed.get(key);
      let entry;
      if(prior&&String(prior.skill).toLowerCase()===skill&&Number.isFinite(Number(prior.toRank))){
        entry=prior;
      }else{
        // Approximate rank: baseline training plus earlier planned increases.
        // Leveler only raises a skill when toRank exceeds the actor's rank.
        const source=prior?.source??slotSource.get(key)??'';
        entry={skill,toRank:Math.min(4,(ranks[skill]??0)+1),...(source?{source}:{})};
      }
      increases.push(entry);
      ranks[skill]=Math.max(ranks[skill]??0,Number(entry.toRank)||0);
    }
    if(increases.length)data.skillIncreases=increases;
    else if(beforeSkills.length)data.skillIncreases=[];

    if(Array.isArray(data.spells))data.spells=data.spells.filter(e=>keep(e,level));
    plan.levels[level]=data;
    if(!old&&!Object.values(data).some(v=>Array.isArray(v)?v.length:v!=null))delete plan.levels[level];
  }

  addNewSpells(plan);
  return next;
}

/**
 * Fill gaps in `primary` from `fallback` (e.g. Leveler documents first, then
 * choices derived from the actor's embedded Items). Keyed maps merge per key.
 */
export function combineViews(primary,fallback){
  const out={...fallback,...primary};
  for(const key of [...Object.keys(IDENTITY),'subclassUuid','dualSubclassUuid'])
    out[key]=primary?.[key]||fallback?.[key]||null;
  for(const key of ['feats','abilityBoosts','skillIncreases','spells','creationChoices'])
    out[key]={...(fallback?.[key]||{}),...(primary?.[key]||{})};
  out.equipment=[...new Set([...(primary?.equipment||[]),...(fallback?.equipment||[])])];
  out.modifiers={...(fallback?.modifiers||{}),...(primary?.modifiers||{})};
  out.notes=primary?.notes||fallback?.notes||'';
  return out;
}

/** All Item uuids referenced by a view (for catalog reference checks). */
export function viewUuids(view){
  return [...new Set([
    ...[...Object.keys(IDENTITY),'subclassUuid','dualSubclassUuid'].map(k=>view?.[k]).filter(Boolean),
    ...Object.values(view?.feats||{}),...(view?.equipment||[]),
    ...Object.values(view?.spells||{}).flat()
  ].filter(x=>typeof x==='string'))];
}

/** Leveler's own import formats (Level Planner → Import / Character Wizard → Import). */
export function levelerPlanExport(doc){return doc?.leveler?.plan?JSON.stringify(doc.leveler.plan,null,2):null;}
export function levelerCreationExport(doc){
  const data=doc?.leveler?.creation;
  return data?JSON.stringify({format:'pf2e-leveler-creation',version:data.version??1,data},null,2):null;
}
