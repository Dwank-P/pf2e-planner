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
  return variantRules;
}
export function getPackOptions(){
  requireGM();
  return [...game.packs.values()]
    .filter(p=>p.documentName==='Item')
    .map(p=>({collection:p.collection,label:p.metadata?.label||p.collection,
      packageName:p.metadata?.packageName||p.collection.split('.')[0]}))
    .sort((a,b)=>a.label.localeCompare(b.label));
}
export function getSelectedPacks(){
  requireGM();
  let extras=[];
  try{
    const value=JSON.parse(game.settings.get(MODULE_ID,'syncedPacks')||'[]');
    if(Array.isArray(value))extras=value.filter(x=>typeof x==='string');
  }catch{}
  const available=new Set(getPackOptions().map(p=>p.collection));
  const selected=[...new Set([...getRequiredPacks(),...extras])];
  return selected.filter(p=>available.has(p));
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
  return out;
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
      ui.notifications.info('PF2e Planner: Reading '+(pack.metadata?.label||pack.collection)+'…');
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
    ui.notifications.info('PF2e Planner: Exported Leveler advancement schemas for '+
      progression.size+' of '+classDocs.length+' imported classes.');
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
      ui.notifications.info('PF2e Planner: All '+entries.length+' Items unchanged; no upload needed.');
      return {skipped:'unchanged',reused:entries.length,uploaded:0};
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
      if(batchNumber%20===0)
        ui.notifications.info('PF2e Planner: Uploaded '+Math.min(offset+10,changed.length)+
          '/'+changed.length+' changed items; '+(started.reused||0)+' reused.');
      await sleep(0);
    }
    const result=await post(base,'/api/v1/bridge/'+id+'/catalog-import/commit',
      {snapshotId:started.snapshotId},auth.accessToken);
    ui.notifications.info('PF2e Planner: '+result.accepted+' Items published ('+
      changed.length+' uploaded, '+(started.reused||0)+' reused, '+
      bannedSkipped+' disallowed excluded).');
    return {...result,uploaded:changed.length,reused:started.reused||0,bannedSkipped};
  }finally{syncing=false;}
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
  const body={...exportCharacterActor(actor,plan,creation),overwrite,ownerUserId};
  const result=await post(base,'/api/v1/bridge/'+id+'/characters/import',body,auth.accessToken);
  return {...result,url:base+result.editorPath};
}
