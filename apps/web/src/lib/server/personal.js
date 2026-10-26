import {createHash,randomBytes} from 'node:crypto';
import {db,unix} from './db.js';
import {problem} from './api.js';
import {EXCLUDED_TYPES,BUNDLE_FORMAT,bundleItem} from './bundle.js';
import {documentUuids,dnd5eUuids,toCharacter} from './characters.js';

/**
 * Personal characters: a player's own characters outside any campaign. Each picks a rules
 * family ('pf2e' covers PF2e and SF2e worlds, 'dnd5e'), its own variant rules, and sources:
 * packages (the first part of a compendium id, e.g. "pf2e", "pf2e-battlezoo-…", "world")
 * from worlds the owner belongs to whose GM shares compendiums. Nothing is copied: the
 * character reads those worlds' current syncs. When a source goes away, the items the
 * character picked from it are kept for that character (personal_kept_items).
 */

export const familyOf=systemId=>systemId==='dnd5e'?'dnd5e':'pf2e';
export const packageOf=packOrUuid=>{
  const parts=String(packOrUuid).split('.');
  return parts[0]==='Compendium'?parts[1]:parts[0];
};
const COMPENDIUM=/Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+/g;
const parse=(text,fallback)=>{try{return JSON.parse(text);}catch{return fallback;}};

/** Worlds the user may draw from: member, GM shares compendiums, world paired and synced. */
export function sharedWorlds(userId,system=null){
  const rows=db().prepare(`SELECT i.id AS integrationId,c.id AS campaignId,c.title,c.system_id AS systemId,
      p.snapshot_id AS snapshotId,p.sha256,p.updated_at AS updatedAt,p.variants_json AS variantsJson
    FROM memberships m JOIN campaigns c ON c.id=m.campaign_id
    JOIN integrations i ON i.campaign_id=c.id AND i.revoked_at IS NULL
    JOIN catalog_publications p ON p.integration_id=i.id
    WHERE m.user_id=? AND c.share_compendiums=1 ORDER BY p.updated_at DESC`).all(userId);
  return system?rows.filter(w=>familyOf(w.systemId)===system):rows;
}
/** Packages a user can pick, each with the worlds that have it (most recently synced first). */
export function availableSources(userId,system){
  const byPackage=new Map();
  const counts=db().prepare(`SELECT pack,COUNT(*) AS n FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? GROUP BY pack`);
  for(const w of sharedWorlds(userId,system)){
    const packages=new Map();
    for(const {pack,n} of counts.all(w.integrationId,w.snapshotId)){
      const name=packageOf(pack);
      const entry=packages.get(name)??{items:0,packs:[]};
      entry.items+=Number(n);entry.packs.push(pack);
      packages.set(name,entry);
    }
    for(const [name,entry] of packages){
      if(!byPackage.has(name))byPackage.set(name,[]);
      byPackage.get(name).push({integrationId:w.integrationId,campaignId:w.campaignId,title:w.title,
        systemId:w.systemId,updatedAt:w.updatedAt,items:entry.items,packs:entry.packs.sort()});
    }
  }
  return [...byPackage.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,worlds])=>({package:name,worlds}));
}

/** The character's sources that still resolve for its owner, by package. */
export function activeSources(row){
  const worlds=new Map(sharedWorlds(row.owner_user_id,row.system).map(w=>[w.integrationId,w]));
  const out=new Map();
  for(const s of db().prepare('SELECT package,integration_id FROM personal_sources WHERE character_id=?').all(row.id)){
    const world=worlds.get(s.integration_id);
    if(world)out.set(s.package,world);
  }
  return out;
}
export function listSources(row){
  const active=activeSources(row);
  return db().prepare(`SELECT s.package,s.integration_id AS integrationId,c.title FROM personal_sources s
    JOIN integrations i ON i.id=s.integration_id JOIN campaigns c ON c.id=i.campaign_id
    WHERE s.character_id=? ORDER BY s.package`).all(row.id)
    .map(s=>({...s,available:active.get(s.package)?.integrationId===s.integrationId}));
}
/** Variant rules the character chose, plus the skill list of every source world (SF2e adds skills). */
export function personalVariants(row,sources=activeSources(row)){
  const variants=parse(row.variants_json,{})??{};
  if(row.system!=='dnd5e'){
    const skills=new Set();
    for(const w of sources.values()){
      const list=parse(w.variantsJson,{})?.skills;
      if(Array.isArray(list))for(const s of list)skills.add(s);
    }
    if(skills.size)variants.skills=[...skills];
  }else{
    // 5e builders read the trait vocabularies from the world's sync; merge them across sources.
    for(const w of sources.values()){
      const v=parse(w.variantsJson,{})??{};
      variants.abilities??=v.abilities;variants.skills5e??=v.skills;
      for(const [trait,table] of Object.entries(v.traits??{}))variants.traits={...(variants.traits??{}),[trait]:{...(table??{}),...(variants.traits?.[trait]??{})}};
    }
    if(variants.skills5e){variants.skills=variants.skills5e;delete variants.skills5e;}
  }
  variants.system=row.system;
  return variants;
}

/** Catalog lookups for a personal character: live sources first, then kept items. */
export function personalCatalog(row){
  const sources=activeSources(row);
  const live=db().prepare('SELECT item_json FROM catalog_entries WHERE integration_id=? AND snapshot_id=? AND uuid=?');
  const kept=db().prepare('SELECT item_json FROM personal_kept_items WHERE character_id=? AND uuid=?');
  const cache=new Map();
  const resolve=uuid=>{
    if(typeof uuid!=='string'||!/^Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+$/.test(uuid))return null;
    if(!cache.has(uuid)){
      const source=sources.get(packageOf(uuid));
      const row2=(source&&live.get(source.integrationId,source.snapshotId,uuid))||kept.get(row.id,uuid);
      cache.set(uuid,row2?JSON.parse(row2.item_json):null);
    }
    return cache.get(uuid);
  };
  return {resolve,has:uuid=>!!resolve(uuid),variants:personalVariants(row,sources),integrationId:null,sources};
}

/** Every compendium uuid the character's plan refers to. */
export function pickedUuids(row){
  const doc=parse(row.build_json,{})??{};
  const out=row.system==='dnd5e'?dnd5eUuids(doc.build??{}):documentUuids(doc.leveler??{});
  for(const uuid of Object.values(doc.planner?.extraFeats??{}))if(typeof uuid==='string')out.add(uuid);
  for(const w of doc.planner?.wishlist??[])if(typeof w?.uuid==='string')out.add(w.uuid);
  return out;
}
/**
 * Picked items plus the items their data points at (a class's features, a feat's grants), as
 * resolved by `resolve`: what a character needs to keep displaying its build.
 */
export function neededItems(row,resolve,limit=400){
  const items=new Map();
  for(const uuid of pickedUuids(row)){
    if(items.size>=limit)break;
    const item=resolve(uuid);
    if(item)items.set(uuid,item);
  }
  for(const item of [...items.values()]){
    const {description,...rest}=item;
    for(const [uuid] of JSON.stringify(rest).matchAll(COMPENDIUM)){
      if(items.size>=limit)break;
      if(items.has(uuid))continue;
      const found=resolve(uuid);
      if(found)items.set(uuid,found);
    }
  }
  return items;
}

/**
 * Before a world's compendium data stops being available to personal characters (world
 * disconnected, sharing turned off, a member removed, a re-sync without some packages), keep
 * the items each affected character picked from it, then drop those sources.
 * `packages` limits it to some packages; `ownerId` to one player's characters; `characterId` to one.
 */
export function retainPicks(sql,{integrationId,packages=null,ownerId=null,characterId=null}){
  const rows=sql.prepare(`SELECT s.character_id,s.package,c.* FROM personal_sources s
    JOIN personal_characters c ON c.id=s.character_id WHERE s.integration_id=?`).all(integrationId)
    .filter(r=>(!packages||packages.has(r.package))&&(!ownerId||r.owner_user_id===ownerId)&&(!characterId||r.id===characterId));
  if(!rows.length)return 0;
  const pub=sql.prepare('SELECT snapshot_id FROM catalog_publications WHERE integration_id=?').get(integrationId);
  const title=sql.prepare('SELECT c.title FROM integrations i JOIN campaigns c ON c.id=i.campaign_id WHERE i.id=?')
    .get(integrationId)?.title??'a removed world';
  const find=sql.prepare('SELECT item_json FROM catalog_entries WHERE integration_id=? AND snapshot_id=? AND uuid=?');
  const icon=sql.prepare('SELECT sha256 FROM integration_icons WHERE integration_id=? AND path=?');
  const keep=sql.prepare(`INSERT INTO personal_kept_items(character_id,uuid,item_json,icon_sha256,source,kept_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(character_id,uuid) DO UPDATE SET item_json=excluded.item_json,
    icon_sha256=excluded.icon_sha256,source=excluded.source,kept_at=excluded.kept_at`);
  const drop=sql.prepare('DELETE FROM personal_sources WHERE character_id=? AND package=? AND integration_id=?');
  const byCharacter=new Map();
  for(const r of rows){
    if(!byCharacter.has(r.character_id))byCharacter.set(r.character_id,{row:r,packages:new Set()});
    byCharacter.get(r.character_id).packages.add(r.package);
  }
  let kept=0;
  for(const {row,packages:lost} of byCharacter.values()){
    if(pub){
      const resolve=uuid=>{
        if(!lost.has(packageOf(uuid)))return null;
        const hit=find.get(integrationId,pub.snapshot_id,uuid);
        return hit?JSON.parse(hit.item_json):null;
      };
      for(const [uuid,item] of neededItems(row,resolve)){
        const sha=item.img?icon.get(integrationId,item.img)?.sha256??null:null;
        keep.run(row.id,uuid,JSON.stringify(item),sha,title,unix());kept++;
      }
    }
    for(const name of lost)drop.run(row.id,name,integrationId);
  }
  return kept;
}

// ---- Access ---------------------------------------------------------------------------------

/** Owner manages; people it's shared with view or edit. Nobody else (not GMs, not the server owner). */
export function personalRights(user,row){
  if(!row||!user)return {view:false,edit:false,manage:false};
  if(row.owner_user_id===user.id)return {view:true,edit:true,manage:true};
  const share=db().prepare('SELECT access FROM personal_shares WHERE character_id=? AND user_id=?').get(row.id,user.id);
  return share?{view:true,edit:share.access==='edit',manage:false}:{view:false,edit:false,manage:false};
}
export function loadPersonal(user,id,need='view'){
  const row=typeof id==='string'?db().prepare('SELECT * FROM personal_characters WHERE id=?').get(id):null;
  const rights=personalRights(user,row);
  // Characters someone can't see don't exist for them.
  if(!rights.view)problem(404,'character_not_found');
  if(need==='edit'&&!rights.edit)problem(403,'character_view_only');
  if(need==='manage'&&!rights.manage)problem(403,'character_owner_required');
  return {row,rights};
}
export function publicRow(token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))problem(404,'character_not_found');
  const row=db().prepare('SELECT * FROM personal_characters WHERE public_token=?').get(token);
  if(!row)problem(404,'character_not_found');
  return row;
}
export const newPublicToken=()=>randomBytes(32).toString('base64url');

/** API shape: the campaign character shape plus the personal fields. */
export function toPersonal(row,{rights=null,includeDocument=true,publicView=false}={}){
  const base=toCharacter({...row,campaign_id:null,visibility:'private'},{includeLeveler:includeDocument});
  delete base.campaignId;delete base.visibility;
  const owner=db().prepare('SELECT display_name FROM users WHERE id=?').get(row.owner_user_id);
  return {...base,personal:true,system:row.system,variants:parse(row.variants_json,{}),
    ownerName:owner?.display_name??null,
    access:rights?{edit:rights.edit,manage:rights.manage}:{edit:false,manage:false},
    ...(publicView?{ownerUserId:undefined}:{}),
    ...(rights?.manage&&!publicView?{publicToken:row.public_token??null}:{})};
}

// ---- Combined catalog bundle -------------------------------------------------------------------

const bundles=new Map();
/** Bundle body for a personal character (or, for a public link, only the items its build needs). */
export function personalBundle(row,{onlyNeeded=false}={}){
  const catalog=personalCatalog(row);
  const keptRows=db().prepare('SELECT uuid,item_json,kept_at FROM personal_kept_items WHERE character_id=?').all(row.id);
  const sourceKey=[...catalog.sources.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([p,w])=>p+'@'+w.integrationId+':'+w.sha256).join('|');
  const version=createHash('sha256').update([sourceKey,keptRows.length,Math.max(0,...keptRows.map(k=>k.kept_at)),
    row.variants_json,onlyNeeded?'needed:'+row.revision:'all',BUNDLE_FORMAT].join('\n')).digest('hex');
  const key=row.id+':'+version;
  let body=bundles.get(key);
  if(!body){
    let items;
    if(onlyNeeded){
      items=[...neededItems(row,catalog.resolve).values()].map(bundleItem);
    }else{
      const seen=new Set();
      items=[];
      const select=db().prepare(`SELECT uuid,item_json FROM catalog_entries WHERE integration_id=? AND snapshot_id=?
        AND (pack=? OR pack LIKE ? ESCAPE '\\') AND type NOT IN (${EXCLUDED_TYPES.map(()=>'?').join(',')})`);
      for(const [name,w] of catalog.sources){
        const like=name.replace(/[\\%_]/g,m=>'\\'+m)+'.%';
        for(const r of select.iterate(w.integrationId,w.snapshotId,name,like,...EXCLUDED_TYPES)){
          if(seen.has(r.uuid))continue;
          seen.add(r.uuid);items.push(bundleItem(r.item_json));
        }
      }
      for(const k of keptRows)if(!seen.has(k.uuid)){seen.add(k.uuid);items.push({...bundleItem(k.item_json),kept:true});}
    }
    body=Buffer.from(JSON.stringify({sha256:version,updatedAt:unix(),variants:catalog.variants,
      sources:{systemId:row.system},items}));
    for(const old of bundles.keys())if(old.startsWith(row.id+':'))bundles.delete(old);
    // A handful of personal bundles at a time; they rebuild quickly from the worlds' data.
    while(bundles.size>=8)bundles.delete(bundles.keys().next().value);
    bundles.set(key,body);
  }
  return {sha256:version,body};
}

/** An icon a personal character may show: from one of its live sources, or kept with it. */
export function personalIcon(row,path,{onlyNeeded=false}={}){
  if(onlyNeeded){
    const catalog=personalCatalog(row);
    if(![...neededItems(row,catalog.resolve).values()].some(item=>item.img===path))return null;
  }
  for(const w of activeSources(row).values()){
    const hit=db().prepare(`SELECT b.sha256,b.content_type,b.bytes FROM integration_icons c JOIN icon_blobs b ON b.sha256=c.sha256
      WHERE c.integration_id=? AND c.path=?`).get(w.integrationId,path);
    if(hit)return hit;
  }
  return db().prepare(`SELECT b.sha256,b.content_type,b.bytes FROM personal_kept_items k JOIN icon_blobs b ON b.sha256=k.icon_sha256
    WHERE k.character_id=? AND json_extract(k.item_json,'$.img')=? LIMIT 1`).get(row.id,path);
}
