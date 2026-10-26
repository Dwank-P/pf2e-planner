import { credentials } from './credentials.mjs';
import { normalizeWebsiteUrl } from './url.mjs';

/**
 * Planner Bridge (D&D 5e): pairs a dnd5e world with the planner website and syncs every
 * installed Item compendium (there is no Leveler-like pack manager for 5e), with each item's
 * advancement data, class spell lists and the world's rules settings. Plan-only: nothing is
 * written back to Foundry.
 */
export const MODULE_ID = 'planner-bridge-5e';
const LOG = '[Planner Bridge 5e]';

function requireGM(){
  if(!game.user?.isGM||game.system?.id!=='dnd5e')
    throw Error('The 5e Planner Bridge needs a GM in a D&D 5e world.');
}
const API_MESSAGES={
  invalid_world:'The planner website is too old for D&D 5e worlds; update it first.'
};
async function post(base,path,data,bearer=null){
  const response=await fetch(base+path,{
    method:'POST',mode:'cors',cache:'no-store',credentials:'omit',redirect:'error',
    signal:AbortSignal.timeout(90000),
    headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},
    body:JSON.stringify(data)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
    const code=typeof body.message==='string'?body.message:body.error||response.statusText;
    throw Error(API_MESSAGES[code]??('Planner API '+response.status+': '+code));
  }
  return body;
}
export function notify(kind,message){
  const n=ui.notifications;
  (kind==='success'?(n.success??n.info):kind==='error'?n.error:n.info).call(n,'Planner (5e): '+message);
}

export async function testWebsite(url){
  requireGM();
  const base=normalizeWebsiteUrl(url);
  let response;
  try{response=await fetch(base+'/api/v1/bridge/status',{method:'GET',mode:'cors',cache:'no-store',
    credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});}
  catch{throw Error('Cannot reach '+base+' from Foundry. Check DNS, HTTPS and CORS.');}
  if(!response.ok)throw Error('Website returned HTTP '+response.status+'.');
  const status=await response.json().catch(()=>({}));
  if(status.service!=='pf2e-planner-web'||status.status!=='ok')throw Error('This is not a planner website.');
  return {url:base,version:status.version};
}
export async function pairWebsite(url,code){
  requireGM();
  const {url:base}=await testWebsite(url);
  const existing=game.settings.get(MODULE_ID,'integrationId');
  const previousUrl=game.settings.get(MODULE_ID,'websiteUrl');
  if(existing&&previousUrl!==base)throw Error('Disconnect the old website in its campaign settings before changing websites.');
  const path=existing?'/api/v1/bridge/'+encodeURIComponent(existing)+'/authorize':'/api/v1/bridge/pair';
  const result=await post(base,path,{code,worldId:game.world.id,worldTitle:game.world.title,
    systemId:'dnd5e',systemVersion:game.system.version,levelerVersion:null,clientNonce:crypto.randomUUID()});
  await credentials.save(base,result.integrationId,{accessToken:result.accessToken,accessExpiresAt:result.accessExpiresAt,
    refreshToken:result.refreshToken,refreshExpiresAt:result.refreshExpiresAt});
  await game.settings.set(MODULE_ID,'websiteUrl',base);
  await game.settings.set(MODULE_ID,'integrationId',result.integrationId);
  notify('info','World paired. Use Sync Now to send your compendiums.');
  return result;
}
async function authorized(){
  const base=game.settings.get(MODULE_ID,'websiteUrl'),id=game.settings.get(MODULE_ID,'integrationId');
  if(!base||!id)throw Error('Pair this world first.');
  let auth=await credentials.load(base,id);
  if(!auth)throw Error('This GM browser needs a fresh pairing code to authorize it.');
  if(auth.accessExpiresAt<Math.floor(Date.now()/1000)+120){
    auth={...auth,...await post(base,'/api/v1/bridge/'+id+'/refresh',{refreshToken:auth.refreshToken})};
    await credentials.save(base,id,auth);
  }
  return {base,id,auth};
}

// ---- What the world uses -------------------------------------------------------------------

function setting(key){
  if(!game.settings.settings.has('dnd5e.'+key))return null;
  try{return game.settings.get('dnd5e',key);}catch{return null;}
}
const labelOf=value=>{
  const raw=typeof value==='string'?value:value?.label??value?.name??'';
  try{return game.i18n.localize(raw);}catch{return raw;}
};
/** Flatten dnd5e's nested trait configs ({key:{label, children}}) into "parent:child" keys → label. */
function flatten(config,prefix,out={}){
  for(const [key,value] of Object.entries(config??{})){
    const full=prefix+':'+key;
    out[full]=labelOf(value);
    if(value&&typeof value==='object'&&value.children)flatten(value.children,full,out);
  }
  return out;
}
/** A trait's choices with full keys ("languages:standard:common"), via dnd5e's own Trait helper when present. */
async function traitChoices(trait,fallback){
  try{
    const choices=await globalThis.dnd5e?.documents?.Trait?.choices?.(trait,{prefixed:true});
    if(choices){
      const out={};
      const walk=entries=>{for(const [key,value] of Object.entries(entries??{})){
        if(!value||typeof value!=='object')continue;
        out[key]={label:labelOf(value),group:!!value.children};
        if(value.children)walk(value.children);
      }};
      walk(choices);
      if(Object.keys(out).length)return out;
    }
  }catch(error){console.warn(LOG,'Trait choices unavailable for',trait,error.message);}
  return Object.fromEntries(Object.entries(flatten(fallback,trait)).map(([k,label])=>[k,{label,group:false}]));
}
const pick=(object,max=600)=>Object.fromEntries(Object.entries(object).slice(0,max));
/** The world's rules: edition (modern = 2024, legacy = 2014), optional rules and trait vocabularies. */
export async function getVariants(){
  const C=CONFIG.DND5E??{};
  const traits={};
  for(const [trait,fallback] of [['skills',C.skills],['saves',C.abilities],['languages',C.languages],
    ['tool',C.tools??{}],['armor',C.armorProficiencies],['weapon',C.weaponProficiencies]])
    traits[trait]=pick(await traitChoices(trait,fallback));
  return {
    system:'dnd5e',
    rulesVersion:setting('rulesVersion')??'legacy',
    allowFeats:setting('allowFeats')??true,
    honorScore:setting('honorScore')??false,
    sanityScore:setting('sanityScore')??false,
    abilities:Object.fromEntries(Object.entries(C.abilities??{}).map(([k,v])=>[k,{label:labelOf(v),abbreviation:labelOf(v?.abbreviation??k)}])),
    skills:Object.fromEntries(Object.entries(C.skills??{}).map(([k,v])=>[k,{label:labelOf(v),ability:v?.ability??null}])),
    traits
  };
}
/** Every Item compendium installed in the world (no pack manager for 5e). */
export function getSyncedPacks(){
  const excluded=new Set(JSON.parse(game.settings.get(MODULE_ID,'excludedPacks')||'[]'));
  return [...game.packs.values()].filter(p=>p.documentName==='Item'&&!excluded.has(p.collection))
    .map(p=>p.collection).sort();
}

// ---- Items ---------------------------------------------------------------------------------

const values=collection=>collection instanceof Set?[...collection]:Array.isArray(collection)?collection
  :collection&&typeof collection==='object'?Object.values(collection):[];
const plain=value=>{try{return JSON.parse(JSON.stringify(value??null));}catch{return null;}};
/** Advancement entries as stored (type, level, title, configuration, classRestriction). */
function advancement(doc){
  const raw=doc._source?.system?.advancement??doc.system?.advancement;
  return values(raw).map(a=>({_id:a?._id??null,type:a?.type,level:a?.level??null,title:a?.title??'',
    classRestriction:a?.classRestriction??null,hint:a?.hint??'',configuration:plain(a?.configuration)??{}}))
    .filter(a=>typeof a.type==='string').slice(0,120);
}
function price(system){
  const p=system?.price;
  return p&&typeof p==='object'?{value:Number(p.value)||0,denomination:p.denomination??'gp'}:null;
}
function exportItem(doc){
  const s=doc.system??{};
  const out={uuid:doc.uuid,name:String(doc.name||''),type:doc.type,
    img:typeof doc.img==='string'?doc.img.slice(0,300):null,
    identifier:s.identifier??null,
    level:Number.isFinite(Number(s.level))&&doc.type!=='class'?Number(s.level):null,
    rarity:typeof s.rarity==='string'&&s.rarity?s.rarity:'common',
    traits:[],
    description:s.description?.value||'',
    publication:s.source?.book||s.source?.custom||null,
    edition:s.source?.rules?String(s.source.rules):null};
  const adv=advancement(doc);
  if(adv.length)out.advancement=adv;
  switch(doc.type){
    case 'class':
      out.hitDie=s.hd?.denomination??s.hitDice??null;
      out.spellcasting=s.spellcasting?{progression:s.spellcasting.progression??'none',ability:s.spellcasting.ability??null,
        preparation:s.spellcasting.preparation?.formula??null}:null;
      out.primaryAbility={value:values(s.primaryAbility?.value),all:s.primaryAbility?.all!==false};
      out.wealth=s.wealth??null;
      break;
    case 'subclass':
      out.classIdentifier=s.classIdentifier??null;
      out.spellcasting=s.spellcasting?{progression:s.spellcasting.progression??'none',ability:s.spellcasting.ability??null}:null;
      break;
    case 'race':
      out.creatureType=s.type?.value??null;
      out.movement=plain(s.movement);
      out.senses=plain(s.senses);
      break;
    case 'feat':
      out.featType=s.type?.value??null;
      out.featSubtype=s.type?.subtype??null;
      out.requirements=s.requirements??'';
      out.prerequisites={level:s.prerequisites?.level??null,repeatable:!!s.prerequisites?.repeatable,
        items:values(s.prerequisites?.items).slice(0,20)};
      out.level=Number(s.prerequisites?.level)||null;
      break;
    case 'spell':
      out.level=Number(s.level)||0;
      out.school=s.school??null;
      out.properties=values(s.properties).slice(0,20);
      out.traits=out.properties;
      break;
    default:
      out.price=price(s);
      out.itemType=s.type?.value??null;
      out.properties=values(s.properties).slice(0,20);
      out.traits=out.properties;
  }
  return out;
}
/** uuid → ['class:wizard', 'subclass:…'] from dnd5e's spell-list registry, when it has one. */
async function spellLists(){
  const out=new Map();
  try{
    const registry=globalThis.dnd5e?.registry?.spellLists;
    if(!registry)return out;
    // Lists load from journal pages after "ready"; wait (briefly) until they have.
    for(let i=0;i<40&&registry.ready===false;i++)await sleep(250);
    // options: [{value:'class:wizard', type:'class', …}]; forType accepts 'class:wizard' whole.
    for(const option of registry.options??[]){
      const key=String(option.value??'');
      if(!key.includes(':'))continue;
      const list=registry.forType?.(key);
      for(const uuid of values(list?.uuids)){
        if(!out.has(uuid))out.set(uuid,[]);
        out.get(uuid).push(key);
      }
    }
  }catch(error){console.warn(LOG,'Spell lists unavailable:',error.message);}
  return out;
}

// ---- Sync ----------------------------------------------------------------------------------

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let syncing=false;
export async function syncNow(){
  requireGM();
  if(syncing)return {skipped:'already_syncing'};
  syncing=true;
  try{
    let {base,id,auth}=await authorized();
    notify('info','Syncing compendiums…');
    const packs=getSyncedPacks();
    const variants=await getVariants();
    const sources={worldId:game.world.id,systemId:'dnd5e',systemVersion:game.system.version,levelerVersion:null};
    const last=await post(base,'/api/v1/bridge/'+id+'/catalog-import/status',{},auth.accessToken);
    const lists=await spellLists();
    const entries=[],byPack=new Map();
    for(const name of packs){
      const pack=game.packs.get(name);
      const documents=await pack.getDocuments();
      const packEntries=[];
      for(const doc of documents){
        const entry=exportItem(doc);
        if(entry.type==='spell'&&lists.has(entry.uuid))entry.spellLists=lists.get(entry.uuid);
        entries.push(entry);packEntries.push(entry);
      }
      byPack.set(name,packEntries);
      await sleep(0);
    }
    if(!entries.length)throw Error('No Items were found in this world\'s compendiums.');
    if(entries.length>30000)throw Error('More than 30,000 items; exclude some compendiums.');
    const packDigests={},changed=[],reusePacks=[];
    for(const name of packs){
      const packEntries=(byPack.get(name)||[]).sort((a,b)=>a.uuid.localeCompare(b.uuid));
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(packEntries)));
      const sha256=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
      packDigests[name]={sha256,count:packEntries.length};
      const old=last.packDigests?.[name];
      if(last.synced&&old?.sha256===sha256&&old?.count===packEntries.length)reusePacks.push(name);
      else changed.push(...packEntries);
    }
    const nonEmpty=packs.filter(p=>packDigests[p].count>0);
    const digests=Object.fromEntries(nonEmpty.map(p=>[p,packDigests[p]]));
    if(!changed.length&&last.synced&&JSON.stringify(last.variants)===JSON.stringify(variants)&&
       JSON.stringify(last.packs)===JSON.stringify(nonEmpty)){
      const icons=await syncIcons(base,id);
      notify('success','Up to date ('+entries.length.toLocaleString()+' items'+iconNote(icons)+').');
      return {skipped:'unchanged',reused:entries.length,uploaded:0,icons};
    }
    const started=await post(base,'/api/v1/bridge/'+id+'/catalog-import/start',
      {packs:nonEmpty,variants,sourceVersions:sources,expectedCount:entries.length,packDigests:digests,
        reusePacks:reusePacks.filter(p=>digests[p])},auth.accessToken);
    for(let offset=0,batchNumber=0;offset<changed.length;offset+=10,batchNumber++){
      if(auth.accessExpiresAt<Math.floor(Date.now()/1000)+120)auth=(await authorized()).auth;
      await post(base,'/api/v1/bridge/'+id+'/catalog-import/batch',
        {snapshotId:started.snapshotId,batchNumber,items:changed.slice(offset,offset+10)},auth.accessToken);
      await sleep(0);
    }
    const result=await post(base,'/api/v1/bridge/'+id+'/catalog-import/commit',{snapshotId:started.snapshotId},auth.accessToken);
    const icons=await syncIcons(base,id);
    notify('success','Synced '+result.accepted.toLocaleString()+' items ('+changed.length.toLocaleString()+' updated'+iconNote(icons)+').');
    return {...result,uploaded:changed.length,icons};
  }finally{syncing=false;}
}

// ---- Icons (same protocol as the PF2e Bridge) -------------------------------------------------

const iconNote=icons=>{
  const n=(icons?.uploaded??0)+(icons?.linked??0);
  return n?', '+n.toLocaleString()+' icons':'';
};
const toBase64=bytes=>{
  let binary='';
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
};
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
    const result=await call('/icons/link',{icons:read.map(({path,sha256})=>({path,sha256}))});
    linked+=result.linked||0;
    const needed=new Set(result.needed||[]);
    let batch=[],size=0;
    const flush=async()=>{
      if(!batch.length)return;
      const r=await call('/icons/batch',{icons:batch});
      uploaded+=r.stored||0;failed+=(r.rejected||[]).length;batch=[];size=0;
    };
    for(const icon of read){
      if(!needed.has(icon.path))continue;
      const data=toBase64(icon.bytes);
      if(size+data.length>380000)await flush();
      batch.push({path:icon.path,data});size+=data.length;
    }
    await flush();
  }
  if(failed)console.warn(LOG,failed,'icons could not be uploaded');
  return {uploaded,linked,failed};
}
export async function status(){
  return {websiteUrl:game.settings.get(MODULE_ID,'websiteUrl')||null,
    integrationId:game.settings.get(MODULE_ID,'integrationId')||null,packs:getSyncedPacks(),variants:await getVariants()};
}
