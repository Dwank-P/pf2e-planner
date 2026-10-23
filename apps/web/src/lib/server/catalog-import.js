import {db} from './db.js';
import {ITEM_UUID, sanitizeDescription, verifyCatalogItem} from './rich-text.js';
import {problem} from './api.js';

export {sanitizeDescription} from './rich-text.js';

export function verifyEntry(entry) {
  if (!verifyCatalogItem(entry)) problem(400, 'invalid_catalog_entry');
  const metadata={};
  for(const [key,value] of Object.entries(entry)){
    if(!['uuid','name','type','description','traits'].includes(key))metadata[key]=value;
  }
  const plain=JSON.stringify(metadata);
  if(plain.length>9000)problem(413,'oversized_catalog_metadata');
  const cleaned=entry.name.trim();
  if(!cleaned)problem(400,'invalid_catalog_entry');
  return {
    uuid:entry.uuid, name:cleaned, type:entry.type,
    level:Number.isInteger(entry.level)&&entry.level>=0&&entry.level<=30?entry.level:null,
    rarity:typeof entry.rarity==='string'?entry.rarity.slice(0,32):null,
    traits:Array.isArray(entry.traits)?entry.traits.filter(t=>typeof t==='string').slice(0,60):[],
    description:sanitizeDescription(entry.description),
    pack:entry.uuid.split('.').slice(1,3).join('.'),
    metadata
  };
}

export function readPublished(campaignId) {
  return db().prepare(`SELECT p.*,i.campaign_id FROM catalog_publications p
    JOIN integrations i ON i.id=p.integration_id
    WHERE i.campaign_id=? AND i.revoked_at IS NULL`).get(campaignId);
}
export function stats(campaignId) {
  const pub=readPublished(campaignId);
  if(!pub) return null;
  const rows=db().prepare(`SELECT type,pack,COUNT(*) AS count FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? GROUP BY type,pack ORDER BY type,pack`)
    .all(pub.integration_id,pub.snapshot_id);
  return {pub,rows};
}
