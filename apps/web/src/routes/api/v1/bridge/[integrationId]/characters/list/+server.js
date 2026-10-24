import {db} from '#lib/server/db.js';
import {bridgeAuth,input,respond} from '#lib/server/api.js';

/** Authorized GM-only listing of campaign builds for "Pull from Planner".
 * Returns names, levels, owners and Foundry link state; no build contents.
 */
export async function POST(event){
  const auth=bridgeAuth(event,event.params.integrationId);
  await input(event.request,1000);
  const rows=db().prepare(`SELECT b.id,b.name,b.level,b.updated_at,u.display_name AS owner_name,
      l.actor_id
    FROM character_builds b JOIN users u ON u.id=b.owner_user_id
    LEFT JOIN foundry_actor_links l ON l.character_id=b.id AND l.integration_id=?
    WHERE b.campaign_id=? ORDER BY b.name COLLATE NOCASE LIMIT 500`)
    .all(event.params.integrationId,auth.campaign_id);
  return respond({characters:rows.map(r=>({id:r.id,name:r.name,level:r.level,
    ownerName:r.owner_name,updatedAt:r.updated_at,linkedActorId:r.actor_id??null}))});
}
