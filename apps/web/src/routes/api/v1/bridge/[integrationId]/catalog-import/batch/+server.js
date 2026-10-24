import {db,transaction} from '#lib/server/db.js';
import {input,bridgeAuth,respond,problem} from '#lib/server/api.js';
import {verifyEntry} from '#lib/server/catalog-import.js';
export async function POST(event){
  bridgeAuth(event,event.params.integrationId);
  const b=await input(event.request,750000);
  if(typeof b.snapshotId!=='string'||!Array.isArray(b.items)||b.items.length<1||
     b.items.length>40||!Number.isInteger(b.batchNumber)||b.batchNumber<0)
    problem(400,'invalid_import_batch');
  const entries=b.items.map(verifyEntry);
  if(new Set(entries.map(e=>e.uuid)).size!==entries.length)problem(400,'duplicate_batch_uuids');
  const result=transaction(sql=>{
    const current=sql.prepare('SELECT * FROM catalog_imports WHERE integration_id=? AND id=?')
      .get(event.params.integrationId,b.snapshotId);
    if(!current)problem(409,'import_not_started');
    // Duplicate POSTs/retries are idempotent, but conflicting batch numbers fail.
    const existing=sql.prepare('SELECT COUNT(*) AS count FROM catalog_staging WHERE integration_id=? AND snapshot_id=? AND batch_number=?')
      .get(event.params.integrationId,b.snapshotId,b.batchNumber).count;
    if(existing)problem(409,'batch_already_received');
    const allowed=new Set(JSON.parse(current.packs_json));
    for(const item of entries)if(!allowed.has(item.pack))problem(400,'unapproved_catalog_pack');
    const stmt=sql.prepare(`INSERT INTO catalog_staging
      (integration_id,snapshot_id,batch_number,uuid,item_json) VALUES(?,?,?,?,?)`);
    for(const item of entries)
      stmt.run(event.params.integrationId,b.snapshotId,b.batchNumber,item.uuid,JSON.stringify(item));
    const count=sql.prepare('SELECT COUNT(*) AS n FROM catalog_staging WHERE integration_id=? AND snapshot_id=?')
      .get(event.params.integrationId,b.snapshotId).n;
    if(count>current.expected_count)problem(409,'import_count_exceeded');
    return {snapshotId:b.snapshotId,accepted:entries.length,staged:count,expected:current.expected_count};
  });
  return respond(result,201);
}
