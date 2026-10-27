import {db} from '#lib/server/db.js';
import {bridgeAuth,input,respond} from '#lib/server/api.js';
import {characterRights} from '#lib/server/characters.js';

/** Campaign builds for "Pull from Planner": all of them for a GM, those the player can edit for a
 * player's own connection. Names, levels, owners and Foundry link state; no build contents.
 */
export async function POST(event){
  const auth=bridgeAuth(event,event.params.integrationId,{allowPlayer:true});
  await input(event.request,1000);
  const all=db().prepare(`SELECT b.id,b.name,b.level,b.updated_at,b.owner_user_id,b.campaign_id,b.visibility,u.display_name AS owner_name,
      l.actor_id
    FROM character_builds b JOIN users u ON u.id=b.owner_user_id
    LEFT JOIN foundry_actor_links l ON l.character_id=b.id AND l.integration_id=?
    WHERE b.campaign_id=? ORDER BY b.name COLLATE NOCASE LIMIT 500`)
    .all(event.params.integrationId,auth.campaign_id);
  const user={id:auth.user_id,site_role:auth.site_role};
  const rows=auth.player?all.filter(r=>characterRights(user,r).edit):all;
  return respond({characters:rows.map(r=>({id:r.id,name:r.name,level:r.level,
    ownerName:r.owner_name,updatedAt:r.updated_at,linkedActorId:r.actor_id??null}))});
}
