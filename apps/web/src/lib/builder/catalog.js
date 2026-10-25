/**
 * The campaign's synced compendium catalog in the browser: downloaded once per
 * sync (catalog-bundle), cached in IndexedDB by snapshot hash, searched locally.
 */
const DB_NAME='pf2e-planner-catalog',STORE='bundles';

export function indexCatalog(bundle){
  const items=Array.isArray(bundle?.items)?bundle.items:[];
  const byUuid=new Map(),byType=new Map();
  for(const item of items){
    byUuid.set(item.uuid,item);
    if(!byType.has(item.type))byType.set(item.type,[]);
    byType.get(item.type).push(item);
  }
  for(const list of byType.values())list.sort((a,b)=>a.name.localeCompare(b.name));
  return {sha256:bundle?.sha256??null,variants:bundle?.variants??{},sources:bundle?.sources??{},
    updatedAt:bundle?.updatedAt??null,count:items.length,
    get:uuid=>uuid?byUuid.get(uuid)??null:null,
    ofType:type=>byType.get(type)??[],
    types:()=>[...byType.keys()]};
}

const norm=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'');
/**
 * Filter and rank items. `query` matches name words (prefix) or traits;
 * filters: rarity[], maxLevel, traits[] (all), anyTraits[], tags[] (otherTags any), test(item).
 */
export function searchItems(items,query='',filters={}){
  const words=norm(query).split(/\s+/).filter(Boolean);
  const out=[];
  for(const item of items){
    if(filters.rarity?.length&&!filters.rarity.includes(item.rarity??'common'))continue;
    if(Number.isFinite(filters.maxLevel)&&Number.isFinite(item.level)&&item.level>filters.maxLevel)continue;
    const traits=item.traits??[];
    if(filters.traits?.length&&!filters.traits.every(t=>traits.includes(t)))continue;
    if(filters.anyTraits?.length&&!filters.anyTraits.some(t=>traits.includes(t)))continue;
    if(filters.tags?.length&&!filters.tags.some(t=>(item.metadata?.otherTags??[]).includes(t)))continue;
    if(filters.test&&!filters.test(item))continue;
    let score=0;
    if(words.length){
      const name=norm(item.name);
      const nameWords=name.split(/[^a-z0-9]+/);
      let matched=true;
      for(const word of words){
        if(nameWords.some(w=>w.startsWith(word)))score+=name.startsWith(word)?3:2;
        else if(name.includes(word))score+=1;
        else if(traits.some(t=>norm(t).startsWith(word)))score+=0.5;
        else{matched=false;break;}
      }
      if(!matched)continue;
    }
    out.push({item,score});
  }
  out.sort((a,b)=>b.score-a.score||(a.item.level??0)-(b.item.level??0)||a.item.name.localeCompare(b.item.name));
  return out.map(x=>x.item);
}

function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function cached(campaignId){
  try{
    const db=await openDb();
    return await new Promise(resolve=>{
      const request=db.transaction(STORE).objectStore(STORE).get(campaignId);
      request.onsuccess=()=>resolve(request.result??null);
      request.onerror=()=>resolve(null);
    });
  }catch{return null;}
}
async function store(campaignId,bundle){
  try{
    const db=await openDb();
    db.transaction(STORE,'readwrite').objectStore(STORE).put(bundle,campaignId);
  }catch{}
}

const loaded=new Map();
/** Load the catalog for a campaign, reusing the cached copy when the sync hasn't changed. */
export function loadCatalog(campaignId){
  if(!loaded.has(campaignId)){
    loaded.set(campaignId,(async()=>{
      const previous=await cached(campaignId);
      const url='/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/catalog-bundle'+
        (previous?.sha256?'?known='+encodeURIComponent(previous.sha256):'');
      const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
      if(response.status===404)return indexCatalog({items:[]});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(body.message||'Catalog unavailable (HTTP '+response.status+')');
      if(body.unchanged&&previous)return indexCatalog(previous);
      await store(campaignId,body);
      return indexCatalog(body);
    })().catch(error=>{loaded.delete(campaignId);throw error;}));
  }
  return loaded.get(campaignId);
}
