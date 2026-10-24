import {randomUUID} from 'node:crypto';
import {db,unix,transaction} from '#lib/server/db.js';
import {bridgeAuth,input,respond,problem} from '#lib/server/api.js';
import {validateBuild} from '#lib/server/characters.js';

/**
 * Explicit GM-initiated Foundry actor import. Only metadata and selected Item
 * references are transferred. Private actor notes, biography, secrets, and
 * arbitrary rule data are not exported.
 *
 * Site ownership is the GM account bound to the bridge credential; importing
 * again does not overwrite a website-edited character without overwrite=true.
 */
export async function POST(event) {
  const auth=bridgeAuth(event,event.params.integrationId);
  const b=await input(event.request,30000);
  const actorId=String(b.actorId||'');
  const name=String(b.name||'').trim();
  if(!/^[a-zA-Z0-9_-]{8,32}$/.test(actorId)||!name||name.length>80||
     !Number.isInteger(b.level)||b.level<1||b.level>20)
    problem(400,'invalid_foundry_actor');
  const build=validateBuild(b.build??{});
  const now=unix(),owner=auth.user_id,integrationId=event.params.integrationId;
  const result=transaction(sql=>{
    const published=sql.prepare('SELECT snapshot_id FROM catalog_publications WHERE integration_id=?')
      .get(integrationId);
    if(!published)problem(409,'sync_catalog_before_importing_characters');
    const exists=sql.prepare(`SELECT 1 FROM catalog_entries
      WHERE integration_id=? AND snapshot_id=? AND uuid=?`);
    let skipped=0;
    const allowed=uuid=>{
      if(uuid===null||uuid===undefined)return null;
      if(exists.get(integrationId,published.snapshot_id,uuid))return uuid;
      skipped++;return null;
    };
    for(const key of ['classUuid','secondClassUuid','ancestryUuid','heritageUuid','backgroundUuid'])
      build[key]=allowed(build[key]);
    for(const [key,uuid] of Object.entries(build.feats))
      if(!allowed(uuid))delete build.feats[key];
    build.equipment=build.equipment.filter(uuid=>!!allowed(uuid));
    for(const [rank,uuids] of Object.entries(build.spells))
      build.spells[rank]=uuids.filter(uuid=>!!allowed(uuid));
    const link=sql.prepare(`SELECT character_id FROM foundry_actor_links
      WHERE integration_id=? AND actor_id=?`).get(integrationId,actorId);
    if(link){
      const old=sql.prepare('SELECT * FROM character_builds WHERE id=?').get(link.character_id);
      if(old && !b.overwrite)
        return {characterId:old.id,existing:true,updated:false,skipped,
          message:'Already linked; website changes were preserved.'};
      if(old){
        if(old.owner_user_id!==owner)problem(403,'linked_character_owner_mismatch');
        sql.prepare(`UPDATE character_builds SET name=?,level=?,build_json=?,revision=revision+1,
          updated_at=? WHERE id=?`)
          .run(name,b.level,JSON.stringify(build),now,old.id);
        return {characterId:old.id,existing:true,updated:true,skipped};
      }
    }
    const id=randomUUID();
    sql.prepare(`INSERT INTO character_builds(id,campaign_id,owner_user_id,name,level,
      build_json,revision,created_at,updated_at)
      VALUES(?,?,?,?,?,?,1,?,?)`)
      .run(id,auth.campaign_id,owner,name,b.level,JSON.stringify(build),now,now);
    sql.prepare(`INSERT INTO foundry_actor_links(integration_id,actor_id,character_id)
      VALUES(?,?,?) ON CONFLICT(integration_id,actor_id)
      DO UPDATE SET character_id=excluded.character_id`).run(integrationId,actorId,id);
    return {characterId:id,existing:false,updated:true,skipped};
  });
  return respond({
    ...result,
    editorPath:'/campaigns/'+encodeURIComponent(auth.campaign_id)+'/characters/'+result.characterId
  },result.existing?200:201);
}
