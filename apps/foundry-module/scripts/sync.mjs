import { getWorldMetadata } from './snapshot.mjs';
import { credentials } from './credentials.mjs';
import { normalizeWebsiteUrl } from './url.mjs';

const MODULE_ID = 'pf2e-planner-bridge';
const CORE_PACKS = ['pf2e.classes','pf2e.feats-srd'];
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
    .map(p=>({collection:p.collection,label:p.metadata?.label||p.collection}))
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
  const selected=[...new Set([...CORE_PACKS,...extras])];
  return selected.filter(p=>available.has(p));
}
export async function savePackSelection(packs){
  requireGM();
  if(!Array.isArray(packs)||packs.length>40)throw Error('Select at most 40 compendiums.');
  const available=new Set(getPackOptions().map(p=>p.collection));
  if(!packs.every(p=>typeof p==='string'&&available.has(p)))
    throw Error('Some selected compendiums are not installed in this world.');
  await game.settings.set(MODULE_ID,'syncedPacks',JSON.stringify(
    packs.filter(p=>!CORE_PACKS.includes(p))));
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
  ui.notifications.info('PF2e Planner paired. Starting compendium import.');
  const sync=await syncNow();
  return {integrationId:result.integrationId,campaignId:result.campaignId,sync};
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
  if(!['feat','class'].includes(type))return null;
  const system=doc.system||{};
  const out={
    uuid:doc.uuid,name:String(doc.name||''),type,
    slug:system.slug||null,
    level:type==='class'?1:(system.level?.value??null),
    rarity:system.traits?.rarity||'common',
    traits:Array.isArray(system.traits?.value)?system.traits.value:[],
    description:system.description?.value||'',
    publication:system.publication?.title||null
  };
  if(type==='feat'){
    out.featType=system.category||system.featType?.value||null;
    out.actionType=system.actionType?.value||null;
    out.actions=system.actions?.value??null;
    out.prerequisites=Array.isArray(system.prerequisites?.value)?
      system.prerequisites.value.map(p=>p.value||'').filter(Boolean):[];
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
    const packs=getSelectedPacks();
    const available=packs.map(name=>game.packs.get(name)).filter(Boolean);
    const variants=getVariants();
    const sources={
      worldId:game.world.id,
      systemId:game.system.id,
      systemVersion:game.system.version,
      levelerVersion:game.modules.get('pf2e-leveler')?.version||null
    };
    if(auto){
      const last=await post(base,'/api/v1/bridge/'+id+'/catalog-import/status',
        {},auth.accessToken);
      if(last.synced&&JSON.stringify(last.sources)===JSON.stringify(sources)&&
         JSON.stringify(last.variants)===JSON.stringify(variants)&&
         JSON.stringify(last.packs)===JSON.stringify(packs))
        return {skipped:'unchanged'};
    }
    const entries=[];
    for(const pack of available){
      ui.notifications.info('PF2e Planner: Reading '+(pack.metadata?.label||pack.collection)+'…');
      const documents=await pack.getDocuments();
      for(const doc of documents){
        const entry=exportItem(doc,pack);
        if(entry)entries.push(entry);
      }
      await sleep(0);
    }
    if(entries.length===0)throw Error('No class or feat Items were found in selected packs.');
    if(entries.length>30000)throw Error('More than 30,000 items selected; reduce pack selection.');
    const started=await post(base,'/api/v1/bridge/'+id+'/catalog-import/start',
      {packs,variants,sourceVersions:sources,expectedCount:entries.length},
      auth.accessToken);
    for(let offset=0,batchNumber=0;offset<entries.length;offset+=15,batchNumber++){
      if(auth.accessExpiresAt<Math.floor(Date.now()/1000)+120){
        auth=(await authorized()).auth;
      }
      await post(base,'/api/v1/bridge/'+id+'/catalog-import/batch',
        {snapshotId:started.snapshotId,batchNumber,items:entries.slice(offset,offset+15)},
        auth.accessToken);
      if(batchNumber%20===0)
        ui.notifications.info('PF2e Planner: Uploaded '+Math.min(offset+15,entries.length)+
          '/'+entries.length+' items.');
      await sleep(0);
    }
    const result=await post(base,'/api/v1/bridge/'+id+'/catalog-import/commit',
      {snapshotId:started.snapshotId},auth.accessToken);
    ui.notifications.info('PF2e Planner: Saved '+result.accepted+' Items and campaign variant rules.');
    return result;
  }finally{syncing=false;}
}
export async function openPairingDialog(){
  requireGM();
  const {PlannerConnectionMenu}=await import('./menu.mjs');
  return new PlannerConnectionMenu().render({force:true});
}
