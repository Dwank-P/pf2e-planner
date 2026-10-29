import {db,unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,respond,problem,throttle} from '#lib/server/api.js';
import {token,digest} from '#lib/server/security.js';

/**
 * A one-time code (valid 15 minutes) that connects the signed-in player's own Foundry browser
 * to this campaign's world, so they can send their characters to the website and pull website
 * plans onto them — no GM needed. Any member can make one for themselves.
 */
export function POST(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  throttle(event,'foundry-code',20,600);
  const integration=db().prepare('SELECT id FROM integrations WHERE campaign_id=? AND revoked_at IS NULL').get(event.params.campaignId);
  if(!integration)problem(409,'no_foundry_world_paired');
  const code=token(),expiresAt=unix()+900;
  db().prepare('DELETE FROM player_link_codes WHERE expires_at<?').run(unix()-86400);
  db().prepare('INSERT INTO player_link_codes(code_hash,user_id,campaign_id,expires_at) VALUES(?,?,?,?)')
    .run(digest(code),user.id,event.params.campaignId,expiresAt);
  return respond({code,expiresAt},201);
}
