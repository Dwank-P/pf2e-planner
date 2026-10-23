import { createHash } from 'node:crypto';
import { db,unix,transaction } from '#lib/server/db.js';
import { input,respond,problem,bridgeAuth } from '#lib/server/api.js';

export async function POST(event) {
  bridgeAuth(event,event.params.integrationId);
  const payload=await input(event.request,1024*1024);
  if (payload.schemaVersion!==1 ||
      typeof payload.snapshotId!=='string' || payload.snapshotId.length>100 ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(payload.snapshotId) ||
      !Array.isArray(payload.classes) || payload.classes.length>100 ||
      !Array.isArray(payload.feats) || payload.feats.length>1000 ||
      !payload.sourceVersions || typeof payload.sourceVersions!=='object' || Array.isArray(payload.sourceVersions)) problem(400,'invalid_catalog_preview');
  function validItem(item) {
    return item && typeof item==='object' && typeof item.uuid==='string' &&
      item.uuid.startsWith('Compendium.') && item.uuid.length<250 &&
      typeof item.name==='string' && item.name.length<256;
  }
  if (![...payload.classes,...payload.feats].every(validItem)) problem(400,'invalid_catalog_items');
  // Only a bounded metadata preview, not arbitrary full copyrighted item dumps.
  const normalized={
    schemaVersion:1,snapshotId:payload.snapshotId,
    sourceVersions:payload.sourceVersions,
    classes:payload.classes,
    feats:payload.feats
  };
  const json=JSON.stringify(normalized);
  const sha256=createHash('sha256').update(json).digest('hex');
  const result=transaction(sql=>{
    const current=sql.prepare('SELECT snapshot_id,sha256 FROM catalog_previews WHERE integration_id=?')
      .get(event.params.integrationId);
    if (current?.snapshot_id===payload.snapshotId && current.sha256!==sha256) problem(409,'snapshot_id_conflict');
    sql.prepare(`INSERT INTO catalog_previews(integration_id,snapshot_id,sha256,data_json,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(integration_id) DO UPDATE SET
      snapshot_id=excluded.snapshot_id,sha256=excluded.sha256,data_json=excluded.data_json,updated_at=excluded.updated_at`)
      .run(event.params.integrationId,payload.snapshotId,sha256,json,unix());
    return {snapshotId:payload.snapshotId,sha256,classes:payload.classes.length,feats:payload.feats.length};
  });
  return respond(result,201);
}
