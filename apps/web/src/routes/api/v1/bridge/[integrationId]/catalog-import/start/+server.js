import {randomUUID} from 'node:crypto';
import { db,unix,transaction } from '#lib/server/db.js';
import {input,bridgeAuth,respond,problem} from '#lib/server/api.js';
export async function POST(event){
  bridgeAuth(event,event.params.integrationId);
  const b=await input(event.request,100000);
  if(!Array.isArray(b.packs)||b.packs.length<1||b.packs.length>400||
     !b.packs.every(p=>typeof p==='string'&&/^[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(p))||
     !Number.isInteger(b.expectedCount)||b.expectedCount<1||b.expectedCount>30000||
     !b.variants||typeof b.variants!=='object'||Array.isArray(b.variants)||
     !b.sourceVersions||typeof b.sourceVersions!=='object'||Array.isArray(b.sourceVersions))
    problem(400,'invalid_import_manifest');
  const variantText=JSON.stringify(b.variants),sourceText=JSON.stringify(b.sourceVersions);
  if(variantText.length>60000||sourceText.length>6000)problem(413,'oversized_import_manifest');
  const digests=b.packDigests??{},reuse=b.reusePacks??[];
  if(!digests||typeof digests!=='object'||Array.isArray(digests)||
     Object.keys(digests).length!==b.packs.length||
     !Array.isArray(reuse)||new Set(reuse).size!==reuse.length||
     !reuse.every(p=>b.packs.includes(p))||
     b.packs.some(p=>!digests[p]||!/^[a-f0-9]{64}$/.test(digests[p].sha256)||
       !Number.isInteger(digests[p].count)||digests[p].count<0||digests[p].count>30000)||
     b.packs.reduce((n,p)=>n+digests[p].count,0)!==b.expectedCount)
    problem(400,'invalid_pack_digests');
  const id=randomUUID(),integrationId=event.params.integrationId;
  transaction(sql=>{
    const published=sql.prepare('SELECT snapshot_id FROM catalog_publications WHERE integration_id=?')
      .get(integrationId);
    for(const pack of reuse){
      const prior=sql.prepare('SELECT sha256,count FROM catalog_pack_digests WHERE integration_id=? AND pack=?')
        .get(integrationId,pack);
      const exists=published
        ? sql.prepare('SELECT COUNT(*) AS n FROM catalog_entries WHERE integration_id=? AND snapshot_id=? AND pack=?')
          .get(integrationId,published.snapshot_id,pack).n : -1;
      if(!prior||prior.sha256!==digests[pack].sha256||prior.count!==digests[pack].count||
          exists!==prior.count)problem(409,'reuse_pack_not_matching_published_catalog');
    }
    sql.prepare('DELETE FROM catalog_staging WHERE integration_id=?').run(integrationId);
    sql.prepare('DELETE FROM catalog_import_digests WHERE integration_id=?').run(integrationId);
    sql.prepare('DELETE FROM catalog_imports WHERE integration_id=?').run(integrationId);
    sql.prepare(`INSERT INTO catalog_imports(id,integration_id,expected_count,packs_json,variants_json,sources_json,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(id,integrationId,b.expectedCount,JSON.stringify(b.packs),variantText,sourceText,unix());
    const digestSql=sql.prepare(`INSERT INTO catalog_import_digests(integration_id,import_id,pack,sha256,count)
      VALUES(?,?,?,?,?)`);
    for(const pack of b.packs)digestSql.run(integrationId,id,pack,digests[pack].sha256,digests[pack].count);
    if(published){
      const reuseSql=sql.prepare(`INSERT INTO catalog_staging(integration_id,snapshot_id,batch_number,uuid,item_json)
        SELECT integration_id,?,-1,uuid,item_json FROM catalog_entries
        WHERE integration_id=? AND snapshot_id=? AND pack=?`);
      for(const pack of reuse)reuseSql.run(id,integrationId,published.snapshot_id,pack);
    }
  });
  return respond({snapshotId:id,expectedCount:b.expectedCount,
    reused:reuse.reduce((n,p)=>n+digests[p].count,0)},201);
}
