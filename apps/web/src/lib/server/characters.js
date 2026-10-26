import { db } from './db.js';
import {problem} from './api.js';
import {levelerChoiceSlots} from '../leveler-progression.js';
import {applyView,emptyDocument,isCharacterDocument,projectView,viewUuids}
  from '../leveler-format.js';

const UUID=/^Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+$/;
const BASE_KEYS=['classUuid','secondClassUuid','ancestryUuid','heritageUuid','backgroundUuid',
  'subclassUuid','dualSubclassUuid'];
/**
 * Validate a slot-keyed builder view. creationChoices are read-only on the
 * website (they live in the Leveler creation document), so they are accepted
 * only from the bridge's legacy actor import (acceptCreationChoices).
 */
export function validateBuild(value,{acceptCreationChoices=false}={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))problem(400,'invalid_character_build');
  const result={};
  for(const key of BASE_KEYS) {
    const id=value[key]??null;
    if(id!==null && (typeof id!=='string'||!UUID.test(id)))problem(400,'invalid_build_reference');
    result[key]=id;
  }
  const choices=value.feats??{};
  if(!choices||typeof choices!=='object'||Array.isArray(choices)||
      Object.keys(choices).length>120)problem(400,'invalid_feat_choices');
  result.feats={};
  for(const [slot,uuid] of Object.entries(choices)) {
    if(!/^(ancestry|class|skill|general|archetype|dual-class|mythic|bonus)-([1-9]|1\d|20)(?:-[a-z0-9-]{1,22})?$/.test(slot)||
       typeof uuid!=='string'||!UUID.test(uuid))problem(400,'invalid_feat_choice');
    result.feats[slot]=uuid;
  }
  // Leveler stores boosts with their advancement level. Unlike raw ability
  // modifiers, these selections are tied to the specific Leveler choice.
  const boostInput=value.abilityBoosts??{};
  if(!boostInput||typeof boostInput!=='object'||Array.isArray(boostInput)||
      Object.keys(boostInput).length>90)problem(400,'invalid_ability_boosts');
  result.abilityBoosts={};
  for(const [key,boosts] of Object.entries(boostInput)){
    if(!/^(ancestry-boost|background|class|free)-1$|^level-([2-9]|1[0-9]|20)(?:-[2-9])?$/.test(key)||
       !Array.isArray(boosts)||boosts.length>6||
       !boosts.every(x=>['str','dex','con','int','wis','cha'].includes(x))||
       new Set(boosts).size!==boosts.length)problem(400,'invalid_ability_boost_selection');
    result.abilityBoosts[key]=[...boosts];
  }
  const skills=value.skillIncreases??{};
  if(!skills||typeof skills!=='object'||Array.isArray(skills)||
      Object.keys(skills).length>70)problem(400,'invalid_skill_increases');
  result.skillIncreases={};
  for(const [key,skill] of Object.entries(skills)){
    if(!/^skill-increase-([2-9]|1[0-9]|20)(?:-[a-z0-9-]{1,22})?$/.test(key)||
       typeof skill!=='string'||!/^[-a-z0-9]{2,40}$/.test(skill))
      problem(400,'invalid_skill_increase');
    result.skillIncreases[key]=skill;
  }
  const equipment=value.equipment??[];
  if(!Array.isArray(equipment)||equipment.length>120||
     !equipment.every(x=>typeof x==='string'&&UUID.test(x)))problem(400,'invalid_equipment_selection');
  result.equipment=[...new Set(equipment)];
  const spells=value.spells??{};
  if(!spells||typeof spells!=='object'||Array.isArray(spells))problem(400,'invalid_spell_choices');
  result.spells={};
  let spellCount=0;
  for(const [rank,uuids] of Object.entries(spells)){
    // "<level>:<cantrip|rank-N>" (level learned); bare rank keys from older clients.
    if(!/^(?:(?:[1-9]|1\d|20):)?(cantrip|rank-(?:[1-9]|10))$/.test(rank)||
       !Array.isArray(uuids)||uuids.length>30||
       !uuids.every(x=>typeof x==='string'&&UUID.test(x)))
      problem(400,'invalid_spell_choice');
    spellCount+=uuids.length;
    result.spells[rank]=[...new Set(uuids)];
  }
  if(spellCount>200)problem(400,'too_many_spell_choices');
  const modifiers=value.modifiers??{};
  if(!modifiers||typeof modifiers!=='object'||Array.isArray(modifiers))problem(400,'invalid_modifiers');
  result.modifiers={};
  for(const stat of ['str','dex','con','int','wis','cha']) {
    const n=modifiers[stat]??0;
    if(!Number.isInteger(n)||n< -5||n>10)problem(400,'invalid_modifier');
    result.modifiers[stat]=n;
  }
  const creation=acceptCreationChoices?value.creationChoices??{}:{};
  if(!creation||typeof creation!=='object'||Array.isArray(creation)||
     Object.keys(creation).length>32||JSON.stringify(creation).length>18000)
    problem(400,'invalid_leveler_creation_choices');
  const allowed=new Set(['subclass','dualSubclass','deity','sanctification',
    'divineFont','subconsciousMind','thesis','implement','tactics','ikons',
    'innovationItem','innovationModification','kineticGateMode',
    'secondElement','apparitions','primaryApparition','mythicCalling',
    'skills','languages','classSelections','dualClassBoosts']);
  result.creationChoices={};
  for(const [key,selection] of Object.entries(creation)){
    if(!allowed.has(key)||JSON.stringify(selection).length>8000)
      problem(400,'invalid_leveler_creation_choice');
    result.creationChoices[key]=selection;
  }
  const notes=value.notes??'';
  if(typeof notes!=='string'||notes.length>4000)problem(400,'invalid_notes');
  result.notes=notes;
  // The character builder stores choices; it does not claim to verify all
  // prerequisites/boost math or auto-apply Rule Elements.
  return result;
}
/**
 * Reject Item references that are not in the published catalog. Only uuids that
 * are new relative to `previous` are checked, so Leveler entries imported from
 * Foundry whose packs are not synchronized do not block unrelated edits.
 */
export function validateReferences(campaignId, build, previous=null) {
  const before=new Set(previous?viewUuids(previous):[]);
  const ids=viewUuids(build).filter(uuid=>!before.has(uuid));
  if(!ids.length)return;
  const catalog=catalogFor(campaignId);
  if(!catalog)problem(409,'sync_compendiums_before_selecting_items');
  for(const uuid of ids)
    if(!catalog.has(uuid))problem(400,'build_contains_item_not_in_synced_catalog');
}
/** Published-catalog lookups for one campaign, or null before the first sync. */
export function catalogFor(campaignId) {
  const publication=db().prepare(`SELECT p.integration_id,p.snapshot_id,p.variants_json
    FROM catalog_publications p JOIN integrations i ON i.id=p.integration_id
    WHERE i.campaign_id=? AND i.revoked_at IS NULL`).get(campaignId);
  if(!publication)return null;
  const find=db().prepare(`SELECT item_json FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? AND uuid=?`);
  const cache=new Map();
  const resolve=uuid=>{
    if(typeof uuid!=='string'||!UUID.test(uuid))return null;
    if(!cache.has(uuid)){
      const row=find.get(publication.integration_id,publication.snapshot_id,uuid);
      cache.set(uuid,row?JSON.parse(row.item_json):null);
    }
    return cache.get(uuid);
  };
  let variants={};
  try{variants=JSON.parse(publication.variants_json||'{}');}catch{}
  return {resolve,has:uuid=>!!resolve(uuid),variants,
    integrationId:publication.integration_id};
}
/** Leveler schedule/spell context used when writing view edits into a plan. */
function mergeContext(catalog, view) {
  if(!catalog)return {};
  const primary=view.classUuid?catalog.resolve(view.classUuid):null;
  const second=view.secondClassUuid?catalog.resolve(view.secondClassUuid):null;
  return {
    resolve:catalog.resolve,
    slots:levelerChoiceSlots(primary,second,catalog.variants).slots,
    spellSlots:primary?.metadata?.levelerProgression?.spellcasting?.slots??null
  };
}
/** Canonical document of a row; pre-v2 rows hold a bare builder view. */
export function readDocument(row) {
  const stored=JSON.parse(row.build_json);
  if(isDnd5eDocument(stored))return {doc:stored,view:null,dnd5e:true};
  return isCharacterDocument(stored)?{doc:stored,view:projectView(stored)}:{doc:null,view:stored};
}
/** Merge a validated builder view into the row's document (migrating legacy rows). */
export function mergeView(campaignId, current, view) {
  const base=current??emptyDocument();
  return applyView(base,view,mergeContext(catalogFor(campaignId),view));
}
const MAX_LEVELER_BYTES=900000;
function depthOk(value,depth=0){
  if(depth>24)return false;
  if(Array.isArray(value))return value.length<=2000&&value.every(v=>depthOk(v,depth+1));
  if(value&&typeof value==='object'){
    const keys=Object.keys(value);
    return keys.length<=500&&keys.every(k=>k!=='__proto__'&&depthOk(value[k],depth+1));
  }
  return true;
}
/** Leveler creation/plan documents from Foundry: plain bounded JSON, stored verbatim. */
export function validateLevelerDocuments(value) {
  if(value===null||value===undefined)return {creation:null,plan:null};
  if(typeof value!=='object'||Array.isArray(value))problem(400,'invalid_leveler_documents');
  const text=JSON.stringify(value);
  if(text.length>MAX_LEVELER_BYTES)problem(413,'oversized_leveler_documents');
  const parsed=JSON.parse(text);
  if(!depthOk(parsed))problem(400,'invalid_leveler_documents');
  const creation=parsed.creation??null,plan=parsed.plan??null;
  if(creation!==null&&(typeof creation!=='object'||Array.isArray(creation)))
    problem(400,'invalid_leveler_creation');
  if(plan!==null&&(typeof plan!=='object'||Array.isArray(plan)||
     !plan.levels||typeof plan.levels!=='object'||Array.isArray(plan.levels)||
     Object.keys(plan.levels).some(k=>!/^([1-9]|1\d|20)$/.test(k))||
     (plan.classSlug!==null&&plan.classSlug!==undefined&&typeof plan.classSlug!=='string')))
    problem(400,'invalid_leveler_plan');
  return {creation,plan};
}
/**
 * Sharing: the owner and the campaign's GMs (and the server owner) always manage
 * a character. Visibility opens it further: 'private' (owner and GM only),
 * 'campaign-view' / 'campaign-edit' (every campaign member), or 'custom' (the
 * members in character_shares, each with view or edit).
 */
export const VISIBILITY=['private','campaign-view','campaign-edit','custom'];
export function characterRights(user,row){
  const membership=db().prepare('SELECT role FROM memberships WHERE campaign_id=? AND user_id=?')
    .get(row.campaign_id,user.id);
  const manage=user.id===row.owner_user_id||user.site_role==='owner'||membership?.role==='gm';
  if(manage)return {view:true,edit:true,manage:true};
  if(!membership)return {view:false,edit:false,manage:false};
  const visibility=row.visibility??'private';
  if(visibility==='campaign-edit')return {view:true,edit:true,manage:false};
  if(visibility==='campaign-view')return {view:true,edit:false,manage:false};
  if(visibility==='custom'){
    const share=db().prepare('SELECT access FROM character_shares WHERE character_id=? AND user_id=?').get(row.id,user.id);
    if(share)return {view:true,edit:share.access==='edit',manage:false};
  }
  return {view:false,edit:false,manage:false};
}
/** Require `need` ('view', 'edit' or 'manage') on a character; returns the user's rights. */
export function characterAccess(user, row, need='edit') {
  if(!row)problem(404,'character_not_found');
  const rights=characterRights(user,row);
  if(!rights.view)problem(403,'character_owner_or_gm_required');
  if(need==='edit'&&!rights.edit)problem(403,'character_view_only');
  if(need==='manage'&&!rights.manage)problem(403,'character_manager_required');
  return rights;
}
/** Who a character is shared with (for its managers). */
export function characterSharing(row){
  const shares=db().prepare(`SELECT s.user_id AS userId,s.access,u.display_name AS displayName,u.username
    FROM character_shares s JOIN users u ON u.id=s.user_id WHERE s.character_id=? ORDER BY u.display_name`).all(row.id);
  return {visibility:row.visibility??'private',shares};
}
export function toCharacter(row,{includeLeveler=true}={}) {
  const stored=readDocument(row);
  if(stored.dnd5e){
    const s=stored.doc.summary??{},b=stored.doc.build??{};
    return {id:row.id,campaignId:row.campaign_id,ownerUserId:row.owner_user_id,name:row.name,level:row.level,
      visibility:row.visibility??'private',format:'dnd5e',
      summary:{ancestry:s.species??null,heritage:null,background:s.background??null,className:s.classes??null,
        dualClassName:null,subclass:null,plannedTo:b.levels?.length||null,
        created:!!(b.speciesUuid&&b.backgroundUuid&&b.levels?.length)},
      ...(includeLeveler?{dnd5e:b,planner:stored.doc.planner}:{}),
      revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at};
  }
  // Editors work on Leveler documents, so pre-v2 rows are converted for
  // display; they are stored in the new shape on their next save.
  const converted=includeLeveler&&!stored.doc?mergeView(row.campaign_id,null,stored.view):null;
  const doc=stored.doc??converted;
  const view=converted?projectView(converted):stored.view;
  return {id:row.id,campaignId:row.campaign_id,ownerUserId:row.owner_user_id,
    name:row.name,level:row.level,build:view,visibility:row.visibility??'private',
    format:stored.doc?'leveler':'legacy',
    summary:characterSummary(stored.doc,stored.view),
    ...(includeLeveler?{leveler:doc?.leveler??null,planner:doc?.planner??null}:{}),
    revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at};
}
/** Names and progress for roster cards, without loading the catalog. */
function characterSummary(doc,view){
  const creation=doc?.leveler?.creation;
  const name=field=>typeof creation?.[field]?.name==='string'?creation[field].name:null;
  const levels=Object.entries(doc?.leveler?.plan?.levels||{})
    .filter(([,data])=>Object.values(data||{}).some(value=>Array.isArray(value)&&value.length))
    .map(([level])=>Number(level)).filter(Number.isInteger);
  return {ancestry:name('ancestry'),heritage:name('heritage'),background:name('background'),
    className:name('class'),dualClassName:name('dualClass'),subclass:name('subclass'),
    plannedTo:levels.length?Math.max(...levels):null,
    created:!!(creation?.ancestry&&creation?.background&&creation?.class)||
      !!(view?.ancestryUuid&&view?.backgroundUuid&&view?.classUuid)};
}

const COMPENDIUM_UUID=/^Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+$/;
/** Every compendium uuid a document refers to (Leveler stores them under "uuid" keys). */
export function documentUuids(value,out=new Set()){
  if(Array.isArray(value))for(const entry of value)documentUuids(entry,out);
  else if(value&&typeof value==='object'){
    for(const [key,entry] of Object.entries(value)){
      if(key==='uuid'&&typeof entry==='string'&&COMPENDIUM_UUID.test(entry))out.add(entry);
      else if(entry&&typeof entry==='object')documentUuids(entry,out);
    }
  }
  return out;
}
/** Equipment wishlist entries (planner only; never applied to the Foundry actor). */
function validateWishlist(value){
  if(!Array.isArray(value)||value.length>300)problem(400,'invalid_wishlist');
  const text=(v,max)=>typeof v==='string'&&v.length<=max;
  const num=(v,min,max)=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max);
  return value.map(w=>{
    if(!w||typeof w!=='object'||!text(w.id,40)||!/^[a-z0-9]+$/i.test(w.id)||
       typeof w.uuid!=='string'||!COMPENDIUM_UUID.test(w.uuid)||!text(w.name,120)||!text(w.type??'',40)||
       !num(w.level??null,0,30)||!num(w.price??null,0,10000000)||
       !Number.isInteger(w.targetLevel)||w.targetLevel<1||w.targetLevel>20||
       !Number.isInteger(w.quantity)||w.quantity<1||w.quantity>999||
       !['wanted','bought'].includes(w.status)||!text(w.notes??'',500))problem(400,'invalid_wishlist_entry');
    return {id:w.id,uuid:w.uuid,name:w.name,type:w.type??'',level:w.level??null,price:w.price??null,
      consumable:w.consumable===true,targetLevel:w.targetLevel,quantity:w.quantity,status:w.status,notes:w.notes??''};
  });
}
/**
 * Validate a whole character document from the web editors. Leveler documents
 * are bounded JSON stored verbatim; uuids new relative to `current` must exist
 * in the campaign's published catalog.
 */
export function validateDocument(campaignId,current,value){
  if(!value||typeof value!=='object'||Array.isArray(value))problem(400,'invalid_character_document');
  const leveler=validateLevelerDocuments(value.leveler);
  const planner=value.planner??{};
  if(!planner||typeof planner!=='object'||Array.isArray(planner))problem(400,'invalid_planner_data');
  const notes=planner.notes??'';
  if(typeof notes!=='string'||notes.length>4000)problem(400,'invalid_notes');
  const modifiers={};
  for(const stat of ['str','dex','con','int','wis','cha']){
    const n=planner.modifiers?.[stat]??0;
    if(!Number.isInteger(n)||n<-5||n>10)problem(400,'invalid_modifier');
    modifiers[stat]=n;
  }
  const extraFeats=planner.extraFeats??{};
  if(!extraFeats||typeof extraFeats!=='object'||Array.isArray(extraFeats)||
     Object.keys(extraFeats).length>40||!Object.values(extraFeats).every(x=>typeof x==='string'&&COMPENDIUM_UUID.test(x)))
    problem(400,'invalid_extra_feats');
  const wishlist=validateWishlist(planner.wishlist??[]);
  const doc={...emptyDocument(),leveler:{creation:leveler.creation,plan:leveler.plan},
    planner:{modifiers,notes,extraFeats,wishlist}};
  const before=documentUuids(current?.leveler??{});
  const added=[...documentUuids(doc.leveler)].filter(uuid=>!before.has(uuid));
  if(added.length){
    const catalog=catalogFor(campaignId);
    if(!catalog)problem(409,'sync_compendiums_before_selecting_items');
    for(const uuid of added)if(!catalog.has(uuid))problem(400,'build_contains_item_not_in_synced_catalog');
  }
  return doc;
}

// ---- D&D 5e plans ----------------------------------------------------------------------------
// dnd5e worlds have no Leveler: the website stores its own plan (lib/systems/dnd5e) and never
// exports it to Foundry.

export const DND5E_FORMAT='dnd5e-plan';
/** The rules system a campaign was paired with ('pf2e', 'sf2e' or 'dnd5e'). */
export function campaignSystem(campaignId){
  return db().prepare('SELECT system_id FROM campaigns WHERE id=?').get(campaignId)?.system_id??'pf2e';
}
export function emptyDnd5eDocument(){
  return {format:DND5E_FORMAT,schemaVersion:1,
    build:{abilities:{method:'standard',base:{}},speciesUuid:null,backgroundUuid:null,levels:[],
      subclasses:{},choices:{},spells:{},feats:[],hp:'average'},
    summary:{species:null,background:null,classes:null},planner:{notes:'',wishlist:[]}};
}
export const isDnd5eDocument=value=>!!value&&typeof value==='object'&&value.format===DND5E_FORMAT;
const ABILITY=/^[a-z]{3}$/;
const nullableUuid=value=>value===null||value===undefined?null
  :typeof value==='string'&&COMPENDIUM_UUID.test(value)?value:problem(400,'invalid_build_reference');
/** Every compendium uuid anywhere in a 5e build (keys and values). */
function dnd5eUuids(value,out=new Set()){
  if(typeof value==='string'){for(const m of value.matchAll(/Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+/g))out.add(m[0]);}
  else if(Array.isArray(value))for(const entry of value)dnd5eUuids(entry,out);
  else if(value&&typeof value==='object')for(const [key,entry] of Object.entries(value)){dnd5eUuids(key,out);dnd5eUuids(entry,out);}
  return out;
}
/** Validate a whole 5e plan document; uuids new relative to `current` must be in the synced catalog. */
export function validateDnd5eDocument(campaignId,current,value){
  if(!isDnd5eDocument(value))problem(400,'invalid_character_document');
  const b=value.build;
  if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>200000||!depthOk(b))problem(400,'invalid_character_build');
  const method=b.abilities?.method??'standard';
  if(!['standard','pointbuy','manual'].includes(method))problem(400,'invalid_ability_method');
  const base={};
  for(const [key,n] of Object.entries(b.abilities?.base??{})){
    if(!ABILITY.test(key)||!Number.isInteger(n)||n<1||n>30)problem(400,'invalid_ability_score');
    base[key]=n;
  }
  if(!Array.isArray(b.levels)||b.levels.length>20)problem(400,'invalid_class_levels');
  const levels=b.levels.map(nullableUuid);
  if(levels.includes(null))problem(400,'invalid_class_levels');
  const map=(input,check,max,code)=>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>max)problem(400,code);
    return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,check(k,v)]));
  };
  const subclasses=map(b.subclasses??{},(k,v)=>{nullableUuid(k);return nullableUuid(v);},20,'invalid_subclasses');
  const text=v=>typeof v==='string'&&v.length>0&&v.length<=160;
  const choices=map(b.choices??{},(k,v)=>{
    if(!/^[\w.|>:-]{1,600}$/.test(k))problem(400,'invalid_choice');
    if(Array.isArray(v)){
      if(v.length>60||!v.every(text))problem(400,'invalid_choice');
      return [...new Set(v)];
    }
    if(v&&typeof v==='object'&&v.mode==='asi'){
      const points={};
      for(const [a,n] of Object.entries(v.points??{})){
        if(!ABILITY.test(a)||!Number.isInteger(n)||n<0||n>4)problem(400,'invalid_choice');
        if(n)points[a]=n;
      }
      return {mode:'asi',points};
    }
    if(v&&typeof v==='object'&&v.mode==='feat')return {mode:'feat',uuid:nullableUuid(v.uuid)};
    problem(400,'invalid_choice');
  },400,'invalid_choices');
  const spells=map(b.spells??{},(k,v)=>{
    nullableUuid(k);
    if(!Array.isArray(v)||v.length>120)problem(400,'invalid_spell_choices');
    return [...new Set(v.map(nullableUuid))];
  },20,'invalid_spell_choices');
  if(!Array.isArray(b.feats??[])||(b.feats??[]).length>40)problem(400,'invalid_extra_feats');
  const feats=(b.feats??[]).map(nullableUuid);
  const s=value.summary??{};
  const label=v=>typeof v==='string'&&v.length<=160?v:null;
  const planner=value.planner??{};
  if(!planner||typeof planner!=='object'||Array.isArray(planner))problem(400,'invalid_planner_data');
  if(typeof (planner.notes??'')!=='string'||(planner.notes??'').length>4000)problem(400,'invalid_notes');
  const doc={format:DND5E_FORMAT,schemaVersion:1,
    build:{abilities:{method,base},speciesUuid:nullableUuid(b.speciesUuid),backgroundUuid:nullableUuid(b.backgroundUuid),
      levels,subclasses,choices,spells,feats,hp:b.hp==='max'?'max':'average'},
    summary:{species:label(s.species),background:label(s.background),classes:label(s.classes)},
    planner:{notes:planner.notes??'',wishlist:validateWishlist(planner.wishlist??[])}};
  const before=dnd5eUuids(current?.build??{});
  for(const w of current?.planner?.wishlist??[])before.add(w.uuid);
  const added=[...dnd5eUuids(doc.build),...doc.planner.wishlist.map(w=>w.uuid)].filter(uuid=>!before.has(uuid));
  if(added.length){
    const catalog=catalogFor(campaignId);
    if(!catalog)problem(409,'sync_compendiums_before_selecting_items');
    for(const uuid of new Set(added))if(!catalog.has(uuid))problem(400,'build_contains_item_not_in_synced_catalog');
  }
  return doc;
}
