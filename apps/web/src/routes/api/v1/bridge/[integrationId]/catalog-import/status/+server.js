import {db} from '#lib/server/db.js';
import {bridgeAuth,respond} from '#lib/server/api.js';
export function POST(event){
  bridgeAuth(event,event.params.integrationId);
  const row=db().prepare(`SELECT snapshot_id,entry_count,variants_json,packs_json,sources_json,updated_at
    FROM catalog_publications WHERE integration_id=?`).get(event.params.integrationId);
  const digests=db().prepare('SELECT pack,sha256,count FROM catalog_pack_digests WHERE integration_id=?')
    .all(event.params.integrationId);
  const packDigests=Object.fromEntries(digests.map(x=>[x.pack,{sha256:x.sha256,count:x.count}]));
  return respond(row?{synced:true,packDigests,snapshotId:row.snapshot_id,count:row.entry_count,
    sources:JSON.parse(row.sources_json),packs:JSON.parse(row.packs_json),
    variants:JSON.parse(row.variants_json),updatedAt:row.updated_at}:{synced:false});
}
