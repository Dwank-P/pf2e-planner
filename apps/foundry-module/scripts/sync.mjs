import { getWorldMetadata } from './snapshot.mjs';
import { credentials } from './credentials.mjs';
import { normalizeWebsiteUrl } from './url.mjs';
import {getLevelerCatalogPacks,getLevelerGuidance} from './leveler-adapter.mjs';
import { createLevelerProgressions } from './leveler-adapter.mjs';

const MODULE_ID = 'pf2e-planner-bridge';
const CORE_PACKS = ['pf2e.classes','pf2e.feats-srd'];
/** Include official Item packs needed to resolve linked conditions, effects
 * and actions. Third-party packs require explicit GM selection.
 */
let levelerPackCache=null;
export async function refreshLevelerPacks(){
  requireGM();
  const keys=await getLevelerCatalogPacks();
  if(!keys.length)throw Error('PF2e Leveler has no available Item compendium packs.');
  levelerPackCache=keys;
  return keys;
}
export function getRequiredPacks(){
  const installed=new Set(getPackOptions().map(x=>x.collection));
  // Before Leveler's catalog is asynchronously loaded, the settings panel
  // can show official defaults. All real syncs refresh the exact Leveler list.
  // Until Leveler's selection has loaded, nothing third-party is assumed.
  const keys=levelerPackCache??getPackOptions()
    .filter(p=>p.collection.startsWith('pf2e.')).map(p=>p.collection);
  return keys.filter(k=>installed.has(k));
}

function requireGM(){
  if(!game.user?.isGM||!['pf2e','sf2e'].includes(game.system?.id))
    throw Error('Planner synchronization requires a GM in a PF2e or SF2e world.');
  if(!game.modules.get('pf2e-leveler')?.active)throw Error('PF2e Leveler must be active.');
}
async function post(base,path,data,bearer=null){
  const response=await fetch(base+path,{
    method:'POST',mode:'cors',cache:'no-store',credentials:'omit',redirect:'error',
    signal:AbortSignal.timeout(90000),
    headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},
    body:JSON.stringify(data)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error('Planner API '+response.status+': '+
    (typeof body.message==='string'?body.message:body.error||response.statusText));
  return body;
}
const variantKeys = {
  freeArchetype:'freeArchetypeVariant',
  gradualAbilityBoosts:'gradualBoostsVariant',
  automaticBonusProgression:'automaticBonusVariant',
  proficiencyWithoutLevel:'proficiencyVariant',
  mythic:'mythic',
  stamina:'staminaVariant'
};
const levelerKeys = {
  dualClass:'enableDualClassSupport',
  ancestralParagon:'ancestralParagon',
  ignoreArchetypeDedicationLock:'ignoreFreeArchetypeDedicationLock',
  enforcePrerequisites:'enforcePrerequisites'
};
function optionalSetting(packageId,key){
  if(!game.settings.settings.has(packageId+'.'+key))return null;
  try{return game.settings.get(packageId,key);}
  catch{return null;}
}
export function getVariants(){
  requireGM();
  const variantRules={};
  for(const [name,key] of Object.entries(variantKeys)){
    variantRules[name]=optionalSetting('pf2e',key);
  }
  for(const [name,key] of Object.entries(levelerKeys)){
    variantRules[name]=optionalSetting('pf2e-leveler',key);
  }
  // Record precisely what Foundry provided; null means not configured/available.
  variantRules.languages=languageRarities();
  return variantRules;
}
/** The world's language list and rarities (PF2e homebrew setting), for the web wizard. */
function languageRarities(){
  const all=Object.keys(CONFIG.PF2E?.languages??{}).filter(k=>/^[a-z0-9-]{1,40}$/.test(k)).sort();
  if(!all.length)return null;
  const list=value=>[...(value??[])].filter(k=>typeof k==='string').sort();
  let rarities=null;
  try{
    const stored=game.settings.get('pf2e','homebrew.languageRarities');
    rarities=stored?.toObject?.()??stored??null;
  }catch{}
  return {all,commonLanguage:rarities?.commonLanguage??'common',
    common:list(rarities?.common),uncommon:list(rarities?.uncommon),rare:list(rarities?.rare),
    secret:list(rarities?.secret),unavailable:list(rarities?.unavailable)};
}
export function getPackOptions(){
  requireGM();
  return [...game.packs.values()]
    .filter(p=>p.documentName==='Item')
    .map(p=>({collection:p.collection,label:p.metadata?.label||p.collection,
      packageName:p.metadata?.packageName||p.collection.split('.')[0]}))
    .sort((a,b)=>a.label.localeCompare(b.label));
}
/** PF2e reference packs that rules text links to (conditions, actions); always synced. */
const REFERENCE_PACKS=['pf2e.conditionitems','pf2e.actionspf2e'];
/**
 * Exactly the packs assigned in PF2e Leveler's Compendium Manager, plus the PF2e
 * reference packs. Third-party content is synced only when Leveler has it assigned.
 */
export function getSelectedPacks(){
  requireGM();
  const available=new Set(getPackOptions().map(p=>p.collection));
  return [...new Set([...getRequiredPacks(),...REFERENCE_PACKS])].filter(p=>available.has(p));
}
/** Foundry v13+ has a green success toast; older versions fall back to info. */
export function notify(kind,message){
  const n=ui.notifications;
  (kind==='success'?(n.success??n.info):kind==='error'?n.error:n.info).call(n,'PF2e Planner: '+message);
}
export async function savePackSelection(packs){
  requireGM();
  if(!Array.isArray(packs)||packs.length>160)throw Error('Select at most 160 Item compendiums.');
  const available=new Set(getPackOptions().map(p=>p.collection));
  if(!packs.every(p=>typeof p==='string'&&available.has(p)))
    throw Error('Some selected compendiums are not installed in this world.');
  await game.settings.set(MODULE_ID,'syncedPacks',JSON.stringify(
    packs.filter(p=>!getRequiredPacks().includes(p))));
  return getSelectedPacks();
}

export async function testWebsite(url){
  requireGM();
  const base=normalizeWebsiteUrl(url);
  let response;
  try{response=await fetch(base+'/api/v1/bridge/status',{
    method:'GET',mode:'cors',cache:'no-store',credentials:'omit',
    redirect:'error',signal:AbortSignal.timeout(10000)
  });}catch(e){throw Error('Cannot reach '+base+' from Foundry. Check DNS, HTTPS and CORS.');}
  if(!response.ok)throw Error('Website returned HTTP '+response.status+'.');
  const status=await response.json().catch(()=>({}));
  if(status.service!=='pf2e-planner-web'||status.status!=='ok')
    throw Error('This is not a PF2e Planner website.');
  ui.notifications.info('PF2e Planner: Website reachable (v'+String(status.version||'unknown')+').');
  return {url:base,version:status.version};
}
export function status(){
  if(!game.user?.isGM)return {authorized:false};
  return {websiteUrl:game.settings.get(MODULE_ID,'websiteUrl')||null,
    integrationId:game.settings.get(MODULE_ID,'integrationId')||null,
    activeGm:game.users.activeGM?.id===game.user.id,
    selectedPacks:getSelectedPacks(),
    variants:getVariants(),
    levelerActive:Boolean(game.modules.get('pf2e-leveler')?.active)};
}
export async function pairWebsite(url,code){
  requireGM();
  const {url:base}=await testWebsite(url);
  const data=getWorldMetadata();
  const existing=game.settings.get(MODULE_ID,'integrationId');
  const previousUrl=game.settings.get(MODULE_ID,'websiteUrl');
  if(existing&&previousUrl!==base)throw Error('Revoke the old integration before changing websites.');
  const path=existing
    ? '/api/v1/bridge/'+encodeURIComponent(existing)+'/authorize'
    : '/api/v1/bridge/pair';
  const result=await post(base,path,{
    code,worldId:data.world.id,worldTitle:data.world.title,
    systemId:data.system.id,systemVersion:data.system.version,
    levelerVersion:data.leveler.version,clientNonce:crypto.randomUUID()
  });
  await credentials.save(base,result.integrationId,{
    accessToken:result.accessToken,accessExpiresAt:result.accessExpiresAt,
    refreshToken:result.refreshToken,refreshExpiresAt:result.refreshExpiresAt
  });
  await game.settings.set(MODULE_ID,'websiteUrl',base);
  await game.settings.set(MODULE_ID,'integrationId',result.integrationId);
  ui.notifications.info('PF2e Planner paired. Use Sync Now in module settings to import compendiums.');
  return {integrationId:result.integrationId,campaignId:result.campaignId};
}
async function authorized(){
  const base=game.settings.get(MODULE_ID,'websiteUrl'),
    id=game.settings.get(MODULE_ID,'integrationId');
  if(!base||!id)throw Error('Pair this world first.');
  let auth=await credentials.load(base,id);
  if(!auth)throw Error('This GM browser needs a fresh pairing code to authorize it.');
  if(auth.accessExpiresAt<Math.floor(Date.now()/1000)+120){
    auth={...auth,...await post(base,'/api/v1/bridge/'+id+'/refresh',
      {refreshToken:auth.refreshToken})};
    await credentials.save(base,id,auth);
  }
  return {base,id,auth};
}
function exportItem(doc,pack){
  const type=doc.type;
  // Preserve all Item subtypes, including action/condition/effect references.
  if(!/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(type))return null;
  const system=doc.system||{};
  const out={
    uuid:doc.uuid,name:String(doc.name||''),type,
    img:typeof doc.img==='string'?doc.img.slice(0,300):null,
    slug:system.slug||null,
    level:type==='class'?1:(system.level?.value??null),
    rarity:system.traits?.rarity||'common',
    traits:Array.isArray(system.traits?.value)?system.traits.value:[],
    description:system.description?.value||'',
    publication:system.publication?.title||null,
    duration:system.duration?.value??null,
    category:system.category??null
  };
  if(type==='heritage'){
    out.ancestrySlug=system.ancestry?.slug??null;
    out.ancestryUuid=system.ancestry?.uuid??null;
    out.versatile=system.ancestry==null;
  }
  if(type==='background'){
    out.boostChoices=Object.values(system.boosts||{}).map(x=>Array.isArray(x?.value)?x.value:[]);
    out.trainedSkills=system.trainedSkills?.value??[];
    out.loreSkills=system.trainedSkills?.lore??[];
    out.grantedFeats=Object.values(system.items||{}).map(x=>x.name||'').filter(Boolean);
  }
  if(type==='class'){
    out.savingThrows=system.savingThrows??null;
    out.perception=system.perception??null;
    out.trainedSkills=system.trainedSkills?.value??[];
    out.spellcasting=Boolean(system.spellcasting);
    // Features the class grants automatically, by level (PF2e class system.items).
    out.grantedFeatures=Object.values(system.items||{})
      .filter(x=>x&&typeof x.name==='string'&&Number.isInteger(Number(x.level)))
      .map(x=>({name:x.name.slice(0,120),level:Number(x.level),
        uuid:typeof x.uuid==='string'?x.uuid:null}))
      .sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name)).slice(0,80);
    // Specific traditions can also depend on class choices (e.g. sorcerer).
    out.spellTradition={
      bard:'occult',wizard:'arcane',druid:'primal',cleric:'divine',
      oracle:'divine',psychic:'occult',magus:'arcane',
      animist:'divine',summoner:null,sorcerer:null,witch:null
    }[String(system.slug||doc.name).toLowerCase()]??null;
  }
  if(type==='spell'){
    out.spellRank=system.level?.value??null;
    out.spellTraditions=Array.isArray(system.traits?.traditions)?system.traits.traditions:[];
  }
  if(type==='feat'){
    out.featType=system.category||system.featType?.value||null;
    out.actionType=system.actionType?.value||null;
    out.actions=system.actions?.value??null;
    out.prerequisites=Array.isArray(system.prerequisites?.value)?
      system.prerequisites.value.map(p=>p.value||'').filter(Boolean):[];
    // Fixed items this feat grants; Leveler checks them for formula/spell choices too.
    const grants=(system.rules||[]).filter(r=>r?.key==='GrantItem'&&typeof r.uuid==='string'&&!r.uuid.includes('{'))
      .slice(0,10).map(r=>({uuid:r.uuid.slice(0,200),...(r.predicate?{predicate:r.predicate}:{})}));
    if(grants.length&&JSON.stringify(grants).length<4000)out.grantItems=grants;
    if(system.category==='ancestry'){
      // Same ancestry/creature trait classification used by Leveler's
      // feat-filter, including third-party traits registered with the system.
      const creature=CONFIG.PF2E?.creatureTraits||{};
      const ancestry=CONFIG.PF2E?.ancestryTraits||{};
      const tagged=(system.traits?.value||[])
        .filter(t=>Object.hasOwn(creature,t)||Object.hasOwn(ancestry,t));
      out.ancestryAccess={
        restrictedTo:[...new Set(tagged)],
        universal:tagged.length===0||system.traits?.value?.includes('reincarnated')
      };
    }
  }else{
    for(const key of ['classFeatLevels','skillFeatLevels','generalFeatLevels',
      'ancestryFeatLevels','skillIncreaseLevels'])
      out[key]=system[key]?.value??[];
    out.keyAbility=system.keyAbility?.value??[];
  }
  // Leveler finds wizard options by these tags: subclasses (wizard-arcane-school),
  // theses, implements, ikons, apparitions, and commander tactics on action Items.
  const otherTags=system.traits?.otherTags;
  if(Array.isArray(otherTags)&&otherTags.length)
    out.otherTags=otherTags.filter(x=>typeof x==='string').slice(0,20);
  const rules=rulesData(type,system);
  if(rules)out.rules=rules;
  return out;
}
/** Rules fields the web Character Wizard computes with, copied as PF2e stores them. */
const RULE_FIELDS={
  ancestry:['boosts','flaws','hp','size','speed','languages','additionalLanguages','vision','reach'],
  background:['boosts','trainedSkills'],
  class:['hp','keyAbility','trainedSkills','perception','savingThrows','attacks','defenses','classDC','spellcasting'],
  deity:['font','sanctification','domains','skill','weapons','attribute','category'],
  feat:['maxTakable','onlyLevel1'],
  // Targeted defense for spell filters: AC, or a Fortitude/Reflex/Will save.
  spell:['defense'],
  // Equipment wishlist: price, bulk and how it's used.
  weapon:['price','bulk','usage','category','group'],
  armor:['price','bulk','usage','category','group'],
  shield:['price','bulk','usage'],
  equipment:['price','bulk','usage'],
  consumable:['price','bulk','usage','category'],
  backpack:['price','bulk','usage'],
  treasure:['price','bulk'],
  kit:['price']
};
function rulesData(type,system){
  const fields=RULE_FIELDS[type];
  if(!fields)return null;
  const out={};
  for(const key of fields)if(system[key]!==undefined)out[key]=system[key];
  try{
    const text=JSON.stringify(out);
    return text.length<=8000?JSON.parse(text):null;
  }catch{return null;}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let syncing=false;
export async function syncNow({auto=false}={}){
  requireGM();
  if(syncing)return {skipped:'already_syncing'};
  if(game.system.id!=='pf2e')throw Error('SF2e full compendium import is not yet supported.');
  syncing=true;
  try{
    let {base,id,auth}=await authorized();
    notify('info','Syncing compendiums…');
    await refreshLevelerPacks();
    const packs=getSelectedPacks();
    const available=packs.map(name=>game.packs.get(name)).filter(Boolean);
    const variants=getVariants();
    const sources={
      worldId:game.world.id,
      systemId:game.system.id,
      systemVersion:game.system.version,
      levelerVersion:game.modules.get('pf2e-leveler')?.version||null
    };
    const last=await post(base,'/api/v1/bridge/'+id+'/catalog-import/status',
      {},auth.accessToken);
    const guidance=await getLevelerGuidance();
    const entries=[];
    const byPack=new Map();
    const classDocs=[];
    let bannedSkipped=0;
    for(const pack of available){
      const documents=await pack.getDocuments();
      const packEntries=[];
      for(const doc of documents){
        // Leveler's guidance includes item-specific, category and publication
        // rules; a GM-marked disallowed item is never exported.
        const status=guidance(doc);
        if(status==='disallowed'){bannedSkipped++;continue;}
        if(doc.type==='class')classDocs.push(doc);
        const entry=exportItem(doc,pack);
        if(entry){entry.guidance=status;entries.push(entry);packEntries.push(entry);}
      }
      byPack.set(pack.collection,packEntries);
      await sleep(0);
    }
    // Use the installed Leveler to produce class advancement choices.
    // Do not silently replace Leveler's decisions with hand-coded feat schedules.
    const progression=await createLevelerProgressions(classDocs,variants);
    for(const entry of entries) {
      if(entry.type!=='class')continue;
      entry.levelerProgression=progression.get(entry.uuid)??null;
    }
    // Supplement system-configured ancestry trait classification with every
    // imported ancestry slug. This catches third-party ancestries whose traits
    // are not registered in CONFIG.PF2E during compendium import.
    const importedAncestries=new Set(entries.filter(x=>x.type==='ancestry')
      .map(x=>String(x.slug||x.name||'').toLowerCase()
        .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')));
    for(const item of entries){
      if(item.type!=='feat'||item.category!=='ancestry')continue;
      const extra=item.traits.filter(x=>importedAncestries.has(String(x).toLowerCase()));
      if(extra.length){
        item.ancestryAccess={
          restrictedTo:[...new Set([...(item.ancestryAccess?.restrictedTo||[]),...extra])],
          universal:item.traits.includes('reincarnated')
        };
      }
    }
    if(classDocs.length&&!progression.size)
      throw Error('PF2e Leveler did not resolve any class progression definitions.');
    console.info('[PF2e Planner Bridge] Leveler advancement for',progression.size,'of',classDocs.length,'classes');
    if(entries.length===0)throw Error('No permitted Items were found in selected packs.');
    if(entries.length>30000)throw Error('More than 30,000 items selected; reduce pack selection.');
    // Compare hashes of the serialized export, including Leveler progression
    // and GM guidance. Only changed packs are sent over HTTPS.
    const packDigests={};
    const changed=[];
    const reusePacks=[];
    for(const pack of packs){
      const packEntries=(byPack.get(pack)||[]).sort((a,b)=>a.uuid.localeCompare(b.uuid));
      const encoded=new TextEncoder().encode(JSON.stringify(packEntries));
      const hash=await crypto.subtle.digest('SHA-256',encoded);
      const sha256=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
      packDigests[pack]={sha256,count:packEntries.length};
      const old=last.packDigests?.[pack];
      if(last.synced&&old?.sha256===sha256&&old?.count===packEntries.length){
        reusePacks.push(pack);
      }else changed.push(...packEntries);
    }
    if(!changed.length&&last.synced&&
       JSON.stringify(last.sources)===JSON.stringify(sources)&&
       JSON.stringify(last.variants)===JSON.stringify(variants)&&
       JSON.stringify(last.packs)===JSON.stringify(packs)){
      const icons=await syncIcons(base,id);
      notify('success','Up to date ('+entries.length.toLocaleString()+' items'+iconNote(icons)+').');
      return {skipped:'unchanged',reused:entries.length,uploaded:0,icons};
    }
    const started=await post(base,'/api/v1/bridge/'+id+'/catalog-import/start',
      {packs,variants,sourceVersions:sources,expectedCount:entries.length,
        packDigests,reusePacks},auth.accessToken);
    for(let offset=0,batchNumber=0;offset<changed.length;offset+=10,batchNumber++){
      if(auth.accessExpiresAt<Math.floor(Date.now()/1000)+120){
        auth=(await authorized()).auth;
      }
      await post(base,'/api/v1/bridge/'+id+'/catalog-import/batch',
        {snapshotId:started.snapshotId,batchNumber,items:changed.slice(offset,offset+10)},
        auth.accessToken);
      await sleep(0);
    }
    const result=await post(base,'/api/v1/bridge/'+id+'/catalog-import/commit',
      {snapshotId:started.snapshotId},auth.accessToken);
    const icons=await syncIcons(base,id);
    notify('success','Synced '+result.accepted.toLocaleString()+' items ('+
      changed.length.toLocaleString()+' updated'+iconNote(icons)+').');
    return {...result,uploaded:changed.length,reused:started.reused||0,bannedSkipped,icons};
  }finally{syncing=false;}
}
const iconNote=icons=>{
  const n=(icons?.uploaded??0)+(icons?.linked??0);
  return n?', '+n.toLocaleString()+' icons'+(icons.linked?' ('+icons.linked.toLocaleString()+' already on the website)':''):'';
};
const toBase64=bytes=>{
  let binary='';
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
};
/**
 * Upload the icons this world's catalog uses that the website doesn't have yet,
 * read from this Foundry server. Icons are kept per world on the website.
 */
async function readIcon(path){
  try{
    const response=await fetch(foundry.utils.getRoute(path),{cache:'force-cache'});
    if(!response.ok)return null;
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!bytes.length||bytes.length>262144)return null;
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    return {path,bytes,sha256:Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')};
  }catch{return null;}
}
/**
 * Give the website this world's icons. Images are read from this Foundry server
 * and hashed; the website links any image it already has (from any world) and
 * only the rest are uploaded.
 */
async function syncIcons(base,id){
  let {auth}=await authorized();
  const call=async(path,body)=>{
    if(auth.accessExpiresAt<Math.floor(Date.now()/1000)+120)auth=(await authorized()).auth;
    return post(base,'/api/v1/bridge/'+id+path,body,auth.accessToken);
  };
  const {missing=[]}=await call('/icons/missing',{});
  let uploaded=0,linked=0,failed=0;
  for(let start=0;start<missing.length;start+=400){
    const icons=[];
    const chunk=missing.slice(start,start+400);
    for(let i=0;i<chunk.length;i+=8)icons.push(...await Promise.all(chunk.slice(i,i+8).map(readIcon)));
    const read=icons.filter(Boolean);
    failed+=icons.length-read.length;
    let needed=new Set(read.map(i=>i.path));
    try{
      const result=await call('/icons/link',{icons:read.map(({path,sha256})=>({path,sha256}))});
      linked+=result.linked||0;needed=new Set(result.needed||[]);
    }catch{} // Website before 0.14: upload everything.
    let batch=[],size=0;
    const flush=async()=>{
      if(!batch.length)return;
      const result=await call('/icons/batch',{icons:batch});
      uploaded+=result.stored||0;failed+=(result.rejected||[]).length;
      batch=[];size=0;
    };
    for(const icon of read){
      if(!needed.has(icon.path))continue;
      const data=toBase64(icon.bytes);
      if(size+data.length>380000)await flush();
      batch.push({path:icon.path,data});size+=data.length;
    }
    await flush();
  }
  if(failed)console.warn('[PF2e Planner Bridge]',failed,'icons could not be uploaded');
  return {uploaded,linked,failed,missing:missing.length};
}
export async function openPairingDialog(){
  requireGM();
  const {PlannerConnectionMenu}=await import('./menu.mjs');
  return new PlannerConnectionMenu().render({force:true});
}

/** Explicit character sync from Foundry or PF2e Leveler's open planner.
 * Never upload private biography, GM notes, actor flags or embedded item text.
 */
function sourceUuid(item){
  const sources=[item?._stats?.compendiumSource,item?.flags?.core?.sourceId,
    item?.sourceId,item?.uuid];
  return sources.find(x=>typeof x==='string'&&
    /^Compendium\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.Item\.[a-zA-Z0-9_-]+$/.test(x))??null;
}
function slotFromLeveler(feat,kind,level,index){
  return kind+'-'+level+(index?'-'+(index+1):'');
}
export function exportCharacterActor(actor,plan=null,creation=null){
  if(!actor||actor.type!=='character')throw Error('Select a character Actor.');
  const items=[...actor.items.values()];
  const fromType=type=>items.filter(x=>x.type===type);
  const first=type=>sourceUuid(fromType(type)[0]);
  const feats={};
  const boosts={};
  const sourceCreation=creation&&typeof creation==='object'?creation:null;
  const skillIncreases={};
  const cats={classFeats:'class',skillFeats:'skill',generalFeats:'general',
    ancestryFeats:'ancestry',archetypeFeats:'archetype',dualClassFeats:'dual-class',
    mythicFeats:'mythic'};
  if(plan?.levels&&typeof plan.levels==='object'){
    for(const [lvl,selection] of Object.entries(plan.levels)){
      const level=Number(lvl);
      if(!Number.isInteger(level)||level<1||level>20)continue;
      for(const [field,kind] of Object.entries(cats)){
        const selected=selection?.[field];
        if(!Array.isArray(selected))continue;
        selected.forEach((feat,index)=>{
          const uuid=sourceUuid(feat)||feat?.uuid;
          if(typeof uuid==='string'&&uuid.startsWith('Compendium.'))
            feats[slotFromLeveler(feat,kind,level,index)]=uuid;
        });
      }
      const chosen=Array.isArray(selection?.abilityBoosts)?selection.abilityBoosts:[];
      if(chosen.length)boosts['level-'+level]=chosen
        .map(x=>String(x).toLowerCase()).filter(x=>['str','dex','con','int','wis','cha'].includes(x));
      for(const [n,choice] of (selection?.skillIncreases??[]).entries()){
        const key='skill-increase-'+level+(choice?.source?'-'+
          String(choice.source).replace(/[^a-z0-9-]/gi,'-').slice(0,20):n?'-'+(n+1):'');
        const skill=String(choice.skill??'').trim().toLowerCase();
        if(/^[a-z-]{2,40}$/.test(skill))skillIncreases[key]=skill;
      }
    }
  }
  // The Leveler Character Wizard holds un-applied choices in .data.
  // The Level Planner holds progression choices in .plan. Merge only the
  // permitted creation fields, never the actor's unrelated flags or notes.
  const creationFields=['subclass','dualSubclass','deity','sanctification',
    'divineFont','subconsciousMind','thesis','implement','tactics','ikons',
    'innovationItem','innovationModification','kineticGateMode',
    'secondElement','apparitions','primaryApparition','mythicCalling',
    'skills','languages','classSelections'];
  const creationChoices={};
  if(sourceCreation){
    for(const [slot,kind] of [
      ['ancestryFeat','ancestry-1'],['ancestryParagonFeat','ancestry-1-2'],
      ['classFeat','class-1'],['dualClassFeat','dual-class-1'],
      ['skillFeat','skill-1'],['mythicCalling','mythic-1']
    ]){
      const uuid=sourceUuid(sourceCreation[slot])||sourceCreation[slot]?.uuid;
      if(typeof uuid==='string'&&uuid.startsWith('Compendium.'))feats[kind]=uuid;
    }
    for(const [source,value] of Object.entries(sourceCreation.boosts||{})){
      const key={ancestry:'ancestry-boost-1',background:'background-1',
        class:'class-1',free:'free-1'}[source];
      if(key && Array.isArray(value)){
        boosts[key]=[...new Set(value.map(x=>String(x).toLowerCase())
          .filter(x=>['str','dex','con','int','wis','cha'].includes(x)))];
      }
    }
    if(Array.isArray(sourceCreation.boosts?.dualClass))
      creationChoices.dualClassBoosts=[...sourceCreation.boosts.dualClass];
    for(const key of creationFields){
      const value=sourceCreation[key];
      if(value===undefined||value===null)continue;
      const serialized=JSON.stringify(value);
      if(serialized&&serialized.length<8000)
        creationChoices[key]=JSON.parse(serialized);
    }
  }
  const spellRanks={};
  for(const spell of fromType('spell')){
    const uuid=sourceUuid(spell);
    if(!uuid)continue;
    const cantrip=spell.system?.traits?.value?.includes('cantrip');
    const rank=Number(spell.system?.level?.value??0);
    const key=cantrip?'cantrip':'rank-'+rank;
    if(!/^(cantrip|rank-([1-9]|10))$/.test(key))continue;
    (spellRanks[key]??=[]).push(uuid);
  }
  if(sourceCreation?.spells){
    for(const [bucket,key] of [['cantrips','cantrip'],['rank1','rank-1']]){
      for(const entry of sourceCreation.spells[bucket]||[]){
        const uuid=sourceUuid(entry)||entry?.uuid;
        if(typeof uuid==='string'&&uuid.startsWith('Compendium.'))
          (spellRanks[key]??=[]).push(uuid);
      }
    }
  }
  const equipment=items.filter(x=>!['class','ancestry','heritage','background','feat','spell','effect','condition'].includes(x.type))
    .map(sourceUuid).filter(Boolean).slice(0,120);
  const modifiers={};
  for(const k of ['str','dex','con','int','wis','cha'])
    modifiers[k]=Math.max(-5,Math.min(10,Number(actor.system?.abilities?.[k]?.mod)||0));
  return {
    name:String(actor.name||'Imported character').slice(0,80),
    level:Math.max(1,Math.min(20,Number(actor.system?.details?.level?.value)||1)),
    actorId:actor.id,
    build:{
      classUuid:sourceCreation?.class?.uuid||first('class'),
      ancestryUuid:sourceCreation?.ancestry?.uuid||first('ancestry'),
      heritageUuid:sourceCreation?.heritage?.uuid||first('heritage'),
      backgroundUuid:sourceCreation?.background?.uuid||first('background'),
      secondClassUuid:sourceCreation?.dualClass?.uuid||null,
      feats,abilityBoosts:boosts,
      skillIncreases,equipment,spells:spellRanks,modifiers,creationChoices
    }
  };
}
export async function getSiteCharacterOwners(){
  requireGM();
  const {base,id,auth}=await authorized();
  const result=await post(base,'/api/v1/bridge/'+id+'/characters/owners',{},
    auth.accessToken);
  return result.members||[];
}
export async function importActorToPlanner(actor,{plan=null,creation=null,overwrite=false,ownerUserId=null}={}){
  requireGM();
  const {base,id,auth}=await authorized();
  const body={...exportCharacterActor(actor,plan,creation),overwrite,ownerUserId,
    leveler:levelerDocuments(actor,plan,creation),actor:actorSnapshot(actor)};
  const result=await post(base,'/api/v1/bridge/'+id+'/characters/import',body,auth.accessToken);
  return {...result,url:base+result.editorPath};
}
const ATTRS=['str','dex','con','int','wis','cha'];
const attrList=value=>(Array.isArray(value)?value:[]).map(a=>String(a).toLowerCase()).filter(a=>ATTRS.includes(a));
/** Boosts the player chose on an item (fixed boosts are part of the item itself). */
const chosenBoosts=boosts=>Object.values(boosts??{})
  .filter(b=>Array.isArray(b?.value)&&b.value.length>1).map(b=>String(b.selected??'').toLowerCase()).filter(a=>ATTRS.includes(a));
const FEAT_SLOT={ancestry:'Ancestry Feat',class:'Class Feat',skill:'Skill Feat',general:'General Feat',archetype:'Free Archetype'};
/**
 * The character as it is on the actor (not Leveler's wizard data, which can be
 * stale): items as {uuid,name} references, the boosts chosen on its ancestry,
 * background, class and build, skill ranks, feats by the slot they fill, spells
 * per class entry and gear. Same shape as a Pathbuilder export, which the
 * website already turns into Leveler documents. Null until the actor has a class.
 */
export function actorSnapshot(actor){
  const ref=item=>{const uuid=item?sourceUuid(item):null;return uuid?{uuid,name:String(item.name)}:null;};
  if(!actor?.class)return null;
  const system=actor.system??{},source=actor._source?.system??{};
  const ancestry=actor.ancestry,background=actor.background,cls=actor.class;
  const alternate=attrList(ancestry?.system?.alternateAncestryBoosts??ancestry?._source?.system?.alternateAncestryBoosts);
  const levelBoosts=source.build?.attributes?.boosts??system.build?.attributes?.boosts??{};
  // Only the level-1 boosts: PF2e stores later ones per set (all of a gradual set under 5),
  // so which level each was taken at isn't known; the Leveler plan supplies those.
  const mapLevelledBoosts={1:attrList(levelBoosts[1])};
  const key=cls.system?.keyAbility;
  const items=[...actor.items.values()];
  const feats=items.filter(i=>i.type==='feat').map(feat=>{
    const location=String(feat.system?.location??'');
    const match=/^(ancestry|class|skill|general|archetype)(?:-(paragon|bonus))?-(\d+)$/.exec(location);
    const level=Number(feat.system?.level?.taken??match?.[3]??feat.system?.level?.value??1);
    if(!match)return [ref(feat),null,'Awarded Feat',level];
    const label=match[2]==='paragon'?'Ancestry Paragon':FEAT_SLOT[match[1]];
    return [ref(feat),null,FEAT_SLOT[match[1]]==='Free Archetype'?'Archetype Feat':FEAT_SLOT[match[1]],level,label+' '+level];
  }).filter(f=>f[0]);
  const entries=items.filter(i=>i.type==='spellcastingEntry'&&!['innate','focus','items','ritual'].includes(i.system?.prepared?.value));
  const spellCasters=entries.map((entry,index)=>{
    const byRank=new Map();
    for(const spell of items.filter(i=>i.type==='spell'&&i.system?.location?.value===entry.id)){
      const rank=spell.system?.traits?.value?.includes('cantrip')?0:Number(spell.system?.level?.value??1);
      const r=ref(spell);if(!r)continue;
      if(!byRank.has(rank))byRank.set(rank,[]);
      byRank.get(rank).push(r);
    }
    return {name:index===0?cls.name:String(entry.name),innate:false,
      spells:[...byRank].map(([spellLevel,list])=>({spellLevel,list}))};
  });
  const physical=['weapon','armor','shield','equipment','consumable','backpack','treasure'];
  return {name:String(actor.name).slice(0,80),level:Number(system.details?.level?.value)||1,
    class:ref(cls),dualClass:null,ancestry:ref(ancestry),heritage:ref(actor.heritage),background:ref(background),
    deity:ref(actor.deity),
    languages:Array.isArray(system.details?.languages?.value)?system.details.languages.value:[],
    abilities:{breakdown:{alternate:alternate.length>0,
      ancestryFree:alternate.length?alternate:chosenBoosts(ancestry?.system?.boosts),
      backgroundBoosts:chosenBoosts(background?.system?.boosts),
      classBoosts:Array.isArray(key?.value)&&key.value.length>1&&key.selected?[String(key.selected)]:[],
      mapLevelledBoosts}},
    proficiencies:Object.fromEntries(Object.entries(system.skills??{})
      .filter(([,s])=>!s?.lore).map(([slug,s])=>[slug,(Number(s?.rank)||0)*2])),
    lores:items.filter(i=>i.type==='lore').map(i=>[String(i.name).replace(/\s+lore$/i,''),(Number(i.system?.proficient?.value)||0)*2]),
    feats,specials:items.filter(i=>i.type==='feat'&&i.system?.category==='classfeature').map(i=>String(i.name)),
    spellCasters,
    equipment:items.filter(i=>physical.includes(i.type)).map(i=>[ref(i),Number(i.system?.quantity)||1]).filter(e=>e[0]).slice(0,200)};
}
const LEVELER='pf2e-leveler';
const plain=value=>value==null?null:JSON.parse(JSON.stringify(value));
/** Leveler's own documents: an open window's unsaved data wins over actor flags. */
function levelerDocuments(actor,plan=null,creation=null){
  const out={plan:plain(plan??actor.getFlag(LEVELER,'plan')),
    creation:plain(creation??actor.getFlag(LEVELER,'creation'))};
  // The website keys class formula grants by 'class:<slug>', not the actor's item.
  bindClassGrants(actor,out.plan,true);
  return out;
}
export async function listPlannerCharacters(){
  requireGM();
  const {base,id,auth}=await authorized();
  const result=await post(base,'/api/v1/bridge/'+id+'/characters/list',{},auth.accessToken);
  return result.characters||[];
}
/** Website build as Leveler documents, plus warnings for the target actor. */
export async function fetchPlannerCharacter(actor,characterId){
  requireGM();
  if(!actor||actor.type!=='character')throw Error('Select a character Actor.');
  const {base,id,auth}=await authorized();
  const result=await post(base,'/api/v1/bridge/'+id+'/characters/export',
    {characterId,actorId:actor.id},auth.accessToken);
  return {...result,warnings:pullWarnings(actor,result.leveler)};
}
function pullWarnings(actor,{plan,creation}){
  const warnings=[];
  // Leveler discards a stored plan whose classSlug differs from the actor's class.
  const actorClass=String(actor.getFlag(LEVELER,'creation')?.class?.slug??actor.class?.slug??'')
    .trim().toLowerCase()||null;
  if(!plan)warnings.push('The website build has no level plan yet (choose a class and save).');
  else if(!plan.classSlug)warnings.push('The website plan has no class; Leveler will ignore it.');
  else if(actorClass&&plan.classSlug!==actorClass)
    warnings.push('Plan class "'+plan.classSlug+'" differs from this actor\'s class "'+actorClass+
      '"; Leveler will ignore the plan until the class matches.');
  if(!creation?.class&&!creation?.ancestry)warnings.push('The website build has no creation choices.');
  return warnings;
}
/** Set img (and a missing name) on every compendium reference from the world's index. */
function fillIcons(value,depth=0){
  if(!value||typeof value!=='object'||depth>12)return;
  if(Array.isArray(value)){for(const entry of value)fillIcons(entry,depth+1);return;}
  if(typeof value.uuid==='string'&&value.uuid.startsWith('Compendium.')){
    let found=null;
    try{found=fromUuidSync(value.uuid,{strict:false});}catch{}
    if(found?.img)value.img=found.img;
    if(!value.name&&found?.name)value.name=found.name;
  }
  for(const entry of Object.values(value))if(entry&&typeof entry==='object')fillIcons(entry,depth+1);
}
/**
 * The website keys class formula grants as 'class:<slug>' (Leveler's planner does
 * the same until the class is on the actor); Leveler's planner then uses the
 * actor's class item uuid, so rewrite them to match once it exists.
 */
function bindClassGrants(actor,plan,unbind=false){
  const slug=String(plan?.classSlug??'').toLowerCase();
  const classUuid=actor?.class?.uuid;
  if(!slug||!classUuid||String(actor.class.slug??'').toLowerCase()!==slug)return;
  let from='class:'+slug,to=classUuid;
  if(unbind)[from,to]=[to,from];
  const swap=value=>value===from?to:value;
  for(const data of Object.values(plan.levels??{})){
    for(const grant of data?.featGrants??[]){
      if(typeof grant?.requirementId==='string'&&grant.requirementId.startsWith(from+':'))
        grant.requirementId=to+grant.requirementId.slice(from.length);
      if(grant)grant.sourceFeatUuid=swap(grant.sourceFeatUuid);
    }
  }
}
/**
 * Replace this actor's Leveler plan (and optionally creation) flags with a
 * website build and link them. Leveler applies plan levels on level-up as usual.
 */
export async function pullCharacterFromPlanner(actor,characterId,{writeCreation=false,relink=false}={}){
  requireGM();
  if(!actor?.testUserPermission(game.user,'OWNER'))throw Error('Character access denied.');
  const {base,id,auth}=await authorized();
  const result=await post(base,'/api/v1/bridge/'+id+'/characters/export',
    {characterId,actorId:actor.id,link:true,relink},auth.accessToken);
  const {plan,creation}=result.leveler;
  // Leveler shows each choice's stored icon; use this world's compendium icons.
  fillIcons(plan);fillIcons(creation);
  bindClassGrants(actor,plan);
  // unsetFlag first: setFlag merges objects, which would keep removed levels.
  if(plan){
    await actor.unsetFlag(LEVELER,'plan');
    await actor.setFlag(LEVELER,'plan',plan);
  }
  if(writeCreation&&creation){
    await actor.unsetFlag(LEVELER,'creation');
    await actor.setFlag(LEVELER,'creation',creation);
  }
  return {...result,wrotePlan:!!plan,wroteCreation:!!(writeCreation&&creation),
    warnings:pullWarnings(actor,result.leveler)};
}
