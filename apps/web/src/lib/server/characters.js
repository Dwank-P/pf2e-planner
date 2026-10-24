import { db } from './db.js';
import {problem} from './api.js';
import {levelerChoiceSlots} from '../leveler-progression.js';
import {applyView,emptyDocument,isCharacterDocument,projectView,viewUuids}
  from '../leveler-format.js';

const UUID=/^Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+$/;
const BASE_KEYS=['classUuid','secondClassUuid','ancestryUuid','heritageUuid','backgroundUuid'];
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
    if(!/^(cantrip|rank-(?:[1-9]|10))$/.test(rank)||
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
export function characterAccess(user, row) {
  if(!row)problem(404,'character_not_found');
  if(user.id!==row.owner_user_id && user.site_role!=='owner'){
    const membership=db().prepare('SELECT role FROM memberships WHERE campaign_id=? AND user_id=?')
      .get(row.campaign_id,user.id);
    if(membership?.role!=='gm')problem(403,'character_owner_or_gm_required');
  }
}
export function toCharacter(row,{includeLeveler=true}={}) {
  const {doc,view}=readDocument(row);
  return {id:row.id,campaignId:row.campaign_id,ownerUserId:row.owner_user_id,
    name:row.name,level:row.level,build:view,
    format:doc?'leveler':'legacy',
    ...(includeLeveler?{leveler:doc?.leveler??null}:{}),
    revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at};
}
