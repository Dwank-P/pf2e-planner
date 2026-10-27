import {db} from '#lib/server/db.js';
import {bridgeAuth,respond} from '#lib/server/api.js';

/** Authenticated GM-only directory for assigning imported Foundry PCs to
 * the correct website player account. No emails or authentication secrets.
 */
export function POST(event){
  const auth=bridgeAuth(event,event.params.integrationId,{allowPlayer:true});
  // A player's own connection can only send characters to their own account.
  if(auth.player){
    const me=db().prepare('SELECT id,display_name FROM users WHERE id=?').get(auth.user_id);
    return respond({members:[{id:me.id,displayName:me.display_name,role:'player'}]});
  }
  const members=db().prepare(`SELECT DISTINCT u.id,u.display_name,u.site_role,m.role
    FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.campaign_id=? AND u.status='active' ORDER BY u.display_name`)
    .all(auth.campaign_id);
  const owner=db().prepare('SELECT id,display_name,site_role FROM users WHERE id=?')
    .get(auth.user_id);
  if(owner&&!members.some(u=>u.id===owner.id))
    members.unshift({...owner,role:'gm'});
  return respond({members:members.map(({id,display_name,role})=>
    ({id,displayName:display_name,role}))});
}
