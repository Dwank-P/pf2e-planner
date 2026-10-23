import {db} from '#lib/server/db.js';
import {readPublished} from '#lib/server/catalog-import.js';
import {respond,sessionUser,requireMembership,problem} from '#lib/server/api.js';
export function GET(event){
  const user=sessionUser(event);requireMembership(user,event.params.campaignId);
  const pub=readPublished(event.params.campaignId);
  if(!pub)problem(404,'catalog_not_published');
  const uuid=event.url.searchParams.get('uuid')||'';
  if(!/^Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+$/.test(uuid))
    problem(400,'invalid_compendium_uuid');
  const row=db().prepare(`SELECT item_json FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? AND uuid=?`)
    .get(pub.integration_id,pub.snapshot_id,uuid);
  if(!row)problem(404,'item_not_synchronized');
  return respond({item:JSON.parse(row.item_json)});
}
