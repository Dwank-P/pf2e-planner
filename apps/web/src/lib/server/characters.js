import { db } from './db.js';
import {problem} from './api.js';

const UUID=/^Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+$/;
const BASE_KEYS=['classUuid','secondClassUuid','ancestryUuid','heritageUuid','backgroundUuid'];
export function validateBuild(value) {
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
    if(!/^(ancestry|class|skill|general|archetype|bonus)-([1-9]|1\d|20)(?:-[a-z0-9-]{1,22})?$/.test(slot)||
       typeof uuid!=='string'||!UUID.test(uuid))problem(400,'invalid_feat_choice');
    result.feats[slot]=uuid;
  }
  const equipment=value.equipment??[];
  if(!Array.isArray(equipment)||equipment.length>120||
     !equipment.every(x=>typeof x==='string'&&UUID.test(x)))problem(400,'invalid_equipment_selection');
  result.equipment=[...new Set(equipment)];
  const modifiers=value.modifiers??{};
  if(!modifiers||typeof modifiers!=='object'||Array.isArray(modifiers))problem(400,'invalid_modifiers');
  result.modifiers={};
  for(const stat of ['str','dex','con','int','wis','cha']) {
    const n=modifiers[stat]??0;
    if(!Number.isInteger(n)||n< -5||n>10)problem(400,'invalid_modifier');
    result.modifiers[stat]=n;
  }
  const notes=value.notes??'';
  if(typeof notes!=='string'||notes.length>4000)problem(400,'invalid_notes');
  result.notes=notes;
  // The character builder stores choices; it does not claim to verify all
  // prerequisites/boost math or auto-apply Rule Elements.
  return result;
}
export function validateReferences(campaignId, build) {
  const ids=[...new Set([
    ...['classUuid','secondClassUuid','ancestryUuid','heritageUuid','backgroundUuid']
      .map(k=>build[k]).filter(Boolean),
    ...Object.values(build.feats), ...build.equipment
  ])];
  if(!ids.length)return;
  const publication=db().prepare(`SELECT p.integration_id,p.snapshot_id
    FROM catalog_publications p JOIN integrations i ON i.id=p.integration_id
    WHERE i.campaign_id=? AND i.revoked_at IS NULL`).get(campaignId);
  if(!publication)problem(409,'sync_compendiums_before_selecting_items');
  const find=db().prepare(`SELECT 1 FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? AND uuid=?`);
  for(const uuid of ids) {
    if(!find.get(publication.integration_id,publication.snapshot_id,uuid))
      problem(400,'build_contains_item_not_in_synced_catalog');
  }
}
export function characterAccess(user, row) {
  if(!row)problem(404,'character_not_found');
  if(user.id!==row.owner_user_id && user.site_role!=='owner'){
    const membership=db().prepare('SELECT role FROM memberships WHERE campaign_id=? AND user_id=?')
      .get(row.campaign_id,user.id);
    if(membership?.role!=='gm')problem(403,'character_owner_or_gm_required');
  }
}
export function toCharacter(row) {
  return {id:row.id,campaignId:row.campaign_id,ownerUserId:row.owner_user_id,
    name:row.name,level:row.level,build:JSON.parse(row.build_json),
    revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at};
}
