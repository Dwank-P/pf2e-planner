import {db} from './db.js';
import {indexCatalog} from '../builder/catalog.js';

const TYPES=['ancestry','heritage','background','class','deity','feat','spell',
  'weapon','armor','shield','equipment','consumable','backpack','treasure','kit'];

/**
 * The published catalog of one world (integration) for building characters on
 * the server (Pathbuilder and Foundry imports), without rules text.
 * Returns null when the world hasn't synced.
 */
export function importCatalog(integrationId){
  const pub=db().prepare('SELECT snapshot_id,variants_json FROM catalog_publications WHERE integration_id=?').get(integrationId);
  if(!pub)return null;
  const items=db().prepare(`SELECT item_json FROM catalog_entries WHERE integration_id=? AND snapshot_id=?
    AND type IN (${TYPES.map(()=>'?').join(',')})`).all(integrationId,pub.snapshot_id,...TYPES)
    .map(r=>{const {description,...item}=JSON.parse(r.item_json);return item;});
  let variants={};
  try{variants=JSON.parse(pub.variants_json||'{}');}catch{}
  return {catalog:indexCatalog({items}),variants};
}
/** The same, for a campaign's active world. */
export function campaignImportCatalog(campaignId){
  const row=db().prepare('SELECT id FROM integrations WHERE campaign_id=? AND revoked_at IS NULL').get(campaignId);
  return row?importCatalog(row.id):null;
}
