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
    if(current.dnd5e)problem(400,'dnd5e_plans_are_not_exported');
    // Pre-v2 builds are converted on the fly; the stored row is left unchanged.
    const doc=current.doc??mergeView(row.campaign_id,null,current.view);
    if(b.link===true){
      // Both ends must be free, or the GM must confirm moving the link (relink): this
      // build may already link to another actor, and the actor to another build.
      const existing=sql.prepare(`SELECT actor_id FROM foundry_actor_links
        WHERE integration_id=? AND character_id=?`).get(integrationId,row.id);
      if(existing&&existing.actor_id!==actorId&&b.relink!==true)
        problem(409,'character_linked_to_other_actor');
      const occupant=sql.prepare(`SELECT character_id FROM foundry_actor_links
        WHERE integration_id=? AND actor_id=?`).get(integrationId,actorId);
      if(occupant&&occupant.character_id!==row.id&&b.relink!==true)
        problem(409,'actor_linked_to_other_character');
      // commit:false only checks the link (the Bridge writes Foundry's flags, then commits).
      if(b.commit===false)return {character:{id:row.id,name:row.name,level:row.level,revision:row.revision},
        leveler:{creation:doc.leveler.creation??null,plan:doc.leveler.plan??null},linked:false,linkAllowed:true};
      sql.prepare('DELETE FROM foundry_actor_links WHERE character_id=?').run(row.id);
      sql.prepare('DELETE FROM foundry_actor_links WHERE integration_id=? AND actor_id=?').run(integrationId,actorId);
      sql.prepare(`INSERT INTO foundry_actor_links(integration_id,actor_id,character_id) VALUES(?,?,?)`)
        .run(integrationId,actorId,row.id);
    }
    return {character:{id:row.id,name:row.name,level:row.level,revision:row.revision},
      leveler:{creation:doc.leveler.creation??null,plan:doc.leveler.plan??null},
      linked:b.link===true};
  });
  return respond(result);
}
