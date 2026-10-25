import {createHash} from 'node:crypto';
import {transaction,unix} from '#lib/server/db.js';
import {input,bridgeAuth,respond,problem} from '#lib/server/api.js';
import {checkpointIfLarge} from '#lib/server/storage.js';
export async function POST(event){
  bridgeAuth(event,event.params.integrationId);
  const b=await input(event.request);
  if(typeof b.snapshotId!=='string')problem(400,'snapshot_id_required');
  const result=transaction(sql=>{
    const i=sql.prepare('SELECT * FROM catalog_imports WHERE id=? AND integration_id=?')
      .get(b.snapshotId,event.params.integrationId);
    if(!i)problem(409,'import_not_found');
    const rows=sql.prepare(`SELECT item_json FROM catalog_staging
      WHERE integration_id=? AND snapshot_id=? ORDER BY uuid`)
      .all(event.params.integrationId,b.snapshotId);
    if(rows.length!==i.expected_count)problem(409,'import_incomplete');
    const hash=createHash('sha256');
    const insert=sql.prepare(`INSERT INTO catalog_entries
      (integration_id,snapshot_id,uuid,type,pack,level,rarity,name,traits_json,item_json)
      VALUES(?,?,?,?,?,?,?,?,?,?)`);
    // Only the complete validated staging set can become a published revision.
    for(const row of rows){
      const item=JSON.parse(row.item_json);
      hash.update(row.item_json).update('\n');
      insert.run(i.integration_id,i.id,item.uuid,item.type,item.pack,item.level,item.rarity,
        item.name,JSON.stringify(item.traits),row.item_json);
    }
    const sha256=hash.digest('hex');
    const digestRows=sql.prepare('SELECT pack,sha256,count FROM catalog_import_digests WHERE integration_id=? AND import_id=?')
      .all(i.integration_id,i.id);
    const byPack=new Map();
    for(const row of rows){
      const pack=JSON.parse(row.item_json).pack;
      byPack.set(pack,(byPack.get(pack)||0)+1);
    }
    if(digestRows.some(d=>(byPack.get(d.pack)||0)!==d.count))
      problem(409,'import_pack_count_mismatch');
    sql.prepare(`INSERT INTO catalog_publications(integration_id,snapshot_id,sha256,entry_count,variants_json,
      packs_json,sources_json,updated_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(integration_id) DO UPDATE SET snapshot_id=excluded.snapshot_id,
      sha256=excluded.sha256,entry_count=excluded.entry_count,
      variants_json=excluded.variants_json,packs_json=excluded.packs_json,
      sources_json=excluded.sources_json,updated_at=excluded.updated_at`)
      .run(i.integration_id,i.id,sha256,rows.length,i.variants_json,i.packs_json,i.sources_json,unix());
    sql.prepare('DELETE FROM catalog_pack_digests WHERE integration_id=?').run(i.integration_id);
    const addDigest=sql.prepare('INSERT INTO catalog_pack_digests(integration_id,pack,sha256,count) VALUES(?,?,?,?)');
    for(const d of digestRows)addDigest.run(i.integration_id,d.pack,d.sha256,d.count);
    sql.prepare('DELETE FROM catalog_import_digests WHERE integration_id=?').run(i.integration_id);
    sql.prepare('DELETE FROM catalog_imports WHERE integration_id=?').run(i.integration_id);
    sql.prepare('DELETE FROM catalog_staging WHERE integration_id=?').run(i.integration_id);
    // Prior published snapshots remain until this transaction succeeds.
    sql.prepare('DELETE FROM catalog_entries WHERE integration_id=? AND snapshot_id<>?')
      .run(i.integration_id,i.id);
    return {snapshotId:i.id,accepted:rows.length,sha256};
  });
  // A big sync writes the whole catalog through the WAL; fold it back into the database.
  checkpointIfLarge();
  return respond(result,201);
}
