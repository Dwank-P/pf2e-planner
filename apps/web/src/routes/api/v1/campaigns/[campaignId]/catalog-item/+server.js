import {db} from '#lib/server/db.js';
import {readPublished} from '#lib/server/catalog-import.js';
import {sanitizeDescription} from '#lib/server/rich-text.js';
import {rowByName} from '#lib/server/item-detail.js';
import {respond,sessionUser,requireMembership,problem} from '#lib/server/api.js';
export function GET(event){
  const user=sessionUser(event);requireMembership(user,event.params.campaignId);
  const pub=readPublished(event.params.campaignId);
  if(!pub)problem(404,'catalog_not_published');
  const uuid=event.url.searchParams.get('uuid')||'';
  const slug=event.url.searchParams.get('slug')||'';
  let row;
  if(uuid){
    if(!/^Compendium\.[\w-]+\.[\w-]+\.Item\.[^\x00-\x1f]{1,200}$/.test(uuid))
      problem(400,'invalid_compendium_uuid');
    row=db().prepare(`SELECT item_json FROM catalog_entries
      WHERE integration_id=? AND snapshot_id=? AND uuid=?`)
      .get(pub.integration_id,pub.snapshot_id,uuid)
      ??rowByName(db(),pub.integration_id,pub.snapshot_id,uuid);
  } else if(slug){
    if(!/^[a-z0-9-]{1,100}$/.test(slug))problem(400,'invalid_slug');
    // Explicitly limit action aliases to imported action Items; never execute
    // the Foundry action macro/actor-dependent side effects on the website.
    row=db().prepare(`SELECT item_json FROM catalog_entries
      WHERE integration_id=? AND snapshot_id=? AND type='action'
      AND json_extract(item_json,'$.metadata.slug')=? LIMIT 1`)
      .get(pub.integration_id,pub.snapshot_id,slug);
  } else problem(400,'uuid_or_slug_required');
  if(!row)problem(404,'item_not_synchronized');
  const item=JSON.parse(row.item_json);
  // Re-enrich on read so items synced before newer enrichers (e.g. [[/act …]]) render too.
  item.description=sanitizeDescription(item.description);
  return respond({item});
}
