import {randomUUID} from 'node:crypto';
import { db,unix,transaction } from '#lib/server/db.js';
import {input,bridgeAuth,respond,problem} from '#lib/server/api.js';
export async function POST(event){
  bridgeAuth(event,event.params.integrationId);
  const b=await input(event.request,100000);
  if(!Array.isArray(b.packs)||b.packs.length<1||b.packs.length>160||
     !b.packs.every(p=>typeof p==='string'&&/^[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(p))||
     !Number.isInteger(b.expectedCount)||b.expectedCount<1||b.expectedCount>30000||
     !b.variants||typeof b.variants!=='object'||Array.isArray(b.variants)||
     !b.sourceVersions||typeof b.sourceVersions!=='object'||Array.isArray(b.sourceVersions))
    problem(400,'invalid_import_manifest');
  const variantText=JSON.stringify(b.variants),sourceText=JSON.stringify(b.sourceVersions);
  if(variantText.length>15000||sourceText.length>6000)problem(413,'oversized_import_manifest');
  const id=randomUUID(),integrationId=event.params.integrationId;
  transaction(sql=>{
    sql.prepare('DELETE FROM catalog_staging WHERE integration_id=?').run(integrationId);
    sql.prepare('DELETE FROM catalog_imports WHERE integration_id=?').run(integrationId);
    sql.prepare(`INSERT INTO catalog_imports(id,integration_id,expected_count,packs_json,variants_json,sources_json,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(id,integrationId,b.expectedCount,JSON.stringify(b.packs),variantText,sourceText,unix());
  });
  return respond({snapshotId:id,expectedCount:b.expectedCount},201);
}
