import {createHash} from 'node:crypto';
import {transaction,unix} from '#lib/server/db.js';
import {input,bridgeAuth,respond,problem} from '#lib/server/api.js';
import {checkpointIfLarge,freeSpace} from '#lib/server/storage.js';
import {retainPicks,packageOf} from '#lib/server/personal.js';
export async function POST(event){
  bridgeAuth(event,event.params.integrationId);
  const b=await input(event.request);
  if(typeof b.snapshotId!=='string')problem(400,'snapshot_id_required');
  const result=transaction(sql=>{
    const i=sql.prepare('SELECT * FROM catalog_imports WHERE id=? AND integration_id=?')
      .get(b.snapshotId,event.params.integrationId);
    if(!i)problem(409,'import_not_found');
    // Counted, copied and hashed inside SQLite / row by row, so a large catalog isn't held in memory.
    const staged=sql.prepare(`SELECT COUNT(*) AS n,COALESCE(SUM(LENGTH(item_json)),0) AS bytes FROM catalog_staging
      WHERE integration_id=? AND snapshot_id=?`).get(event.params.integrationId,b.snapshotId);
    if(staged.n!==i.expected_count)problem(409,'import_incomplete');
    // Publishing writes the catalog again (plus its WAL); refuse rather than fill the disk.
    const free=freeSpace();
    if(free!=null&&free<Number(staged.bytes)*3+64*1024*1024)problem(507,'not_enough_free_space_for_sync');
    const byPack=new Map(sql.prepare(`SELECT json_extract(item_json,'$.pack') AS pack,COUNT(*) AS n FROM catalog_staging
      WHERE integration_id=? AND snapshot_id=? GROUP BY pack`).all(i.integration_id,i.id).map(r=>[r.pack,Number(r.n)]));
    const digestRows=sql.prepare('SELECT pack,sha256,count FROM catalog_import_digests WHERE integration_id=? AND import_id=?')
      .all(i.integration_id,i.id);
    if(digestRows.some(d=>(byPack.get(d.pack)||0)!==d.count))
      problem(409,'import_pack_count_mismatch');
    // Only the complete validated staging set can become a published revision.
    sql.prepare(`INSERT INTO catalog_entries
      (integration_id,snapshot_id,uuid,type,pack,level,rarity,name,traits_json,item_json)
      SELECT integration_id,snapshot_id,uuid,json_extract(item_json,'$.type'),json_extract(item_json,'$.pack'),
        json_extract(item_json,'$.level'),json_extract(item_json,'$.rarity'),json_extract(item_json,'$.name'),
        COALESCE(json_extract(item_json,'$.traits'),'[]'),item_json
      FROM catalog_staging WHERE integration_id=? AND snapshot_id=?`).run(i.integration_id,i.id);
    const hash=createHash('sha256');
    for(const row of sql.prepare(`SELECT item_json FROM catalog_staging
      WHERE integration_id=? AND snapshot_id=? ORDER BY uuid`).iterate(i.integration_id,i.id))
      hash.update(row.item_json).update('\n');
    const sha256=hash.digest('hex');
    const rows={length:Number(staged.n)};
    // Personal characters keep what they picked from packages this sync no longer has
    // (while the previous snapshot is still the published one).
    const kept=new Set([...byPack.keys()].map(packageOf));
    const lost=new Set(sql.prepare('SELECT DISTINCT package FROM personal_sources WHERE integration_id=?')
      .all(i.integration_id).map(r=>r.package).filter(p=>!kept.has(p)));
    if(lost.size)retainPicks(sql,{integrationId:i.integration_id,packages:lost});
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
