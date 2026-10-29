import {db,unix} from '#lib/server/db.js';
import {sessionUser,input,problem,respond} from '#lib/server/api.js';

/**
 * Foundry browsers connected to your account: GM pairings (they sync a world) and player
 * connections (they send and pull your characters). Disconnecting one revokes its tokens.
 */
function list(user){
  return db().prepare(`SELECT bc.id,bc.scope,bc.origin,bc.created_at AS createdAt,bc.refresh_expires_at AS expiresAt,
      c.title AS campaign,c.id AS campaignId
    FROM bridge_credentials bc JOIN integrations i ON i.id=bc.integration_id JOIN campaigns c ON c.id=i.campaign_id
    WHERE bc.user_id=? AND bc.revoked_at IS NULL AND i.revoked_at IS NULL AND bc.refresh_expires_at>?
    ORDER BY bc.created_at DESC`).all(user.id,unix());
}
export function GET(event){
  return respond({connections:list(sessionUser(event))});
}
/** {id}: disconnect one of your own connections. */
export async function DELETE(event){
  const user=sessionUser(event);
  const body=await input(event.request,500);
  const result=db().prepare('UPDATE bridge_credentials SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL')
    .run(unix(),String(body.id??''),user.id);
  if(result.changes!==1)problem(404,'connection_not_found');
  return respond({connections:list(user)});
}
