import {transaction} from '#lib/server/db.js';
import {bridgeAuth,input,respond,problem} from '#lib/server/api.js';
import {readDocument,mergeView} from '#lib/server/characters.js';

/**
 * "Pull from Planner": hand a website build to the authorized GM's Foundry as
 * PF2e Leveler creation/plan documents, optionally linking it to an Actor.
 * The website never writes to Foundry itself; the bridge applies the flags
 * only after the GM confirms in Foundry.
 */
export async function POST(event){
  const auth=bridgeAuth(event,event.params.integrationId);
  const b=await input(event.request,2000);
  const characterId=String(b.characterId||'');
  const actorId=b.actorId==null?null:String(b.actorId);
  if(!/^[a-f0-9-]{36}$/.test(characterId))problem(400,'invalid_character_id');
  if(actorId!==null&&!/^[a-zA-Z0-9_-]{8,32}$/.test(actorId))problem(400,'invalid_foundry_actor');
  if(b.link===true&&actorId===null)problem(400,'actor_required_to_link');
  const integrationId=event.params.integrationId;
  const result=transaction(sql=>{
    const row=sql.prepare('SELECT * FROM character_builds WHERE id=? AND campaign_id=?')
      .get(characterId,auth.campaign_id);
    if(!row)problem(404,'character_not_found');
    const current=readDocument(row);
    // Pre-v2 builds are converted on the fly; the stored row is left unchanged.
    const doc=current.doc??mergeView(row.campaign_id,null,current.view);
    if(b.link===true){
      const existing=sql.prepare(`SELECT actor_id FROM foundry_actor_links
        WHERE integration_id=? AND character_id=?`).get(integrationId,row.id);
      if(existing&&existing.actor_id!==actorId&&b.relink!==true)
        problem(409,'character_linked_to_other_actor');
      sql.prepare('DELETE FROM foundry_actor_links WHERE character_id=?').run(row.id);
      sql.prepare(`INSERT INTO foundry_actor_links(integration_id,actor_id,character_id)
        VALUES(?,?,?) ON CONFLICT(integration_id,actor_id)
        DO UPDATE SET character_id=excluded.character_id`).run(integrationId,actorId,row.id);
    }
    return {character:{id:row.id,name:row.name,level:row.level,revision:row.revision},
      leveler:{creation:doc.leveler.creation??null,plan:doc.leveler.plan??null},
      linked:b.link===true};
  });
  return respond(result);
}
