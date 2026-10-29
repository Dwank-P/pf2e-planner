import {db,transaction} from '#lib/server/db.js';
import {respond,sessionUser,problem} from '#lib/server/api.js';

/**
 * Delete an account (site owner only). Their sessions, memberships and
 * invitations go; their characters, campaigns and pairing records are
 * reassigned to the owner so nothing in a campaign is lost.
 */
export function DELETE(event){
  const actor=sessionUser(event);
  if(actor.site_role!=='owner')problem(403,'owner_required');
  const userId=event.params.userId;
  if(userId===actor.id)problem(409,'cannot_delete_yourself');
  const target=db().prepare('SELECT id,site_role FROM users WHERE id=?').get(userId);
  if(!target)problem(404,'user_not_found');
  if(target.site_role==='owner')problem(403,'cannot_delete_site_owner');
  transaction(sql=>{
    sql.prepare('UPDATE character_builds SET owner_user_id=? WHERE owner_user_id=?').run(actor.id,userId);
    sql.prepare('UPDATE campaigns SET owner_id=? WHERE owner_id=?').run(actor.id,userId);
    sql.prepare('UPDATE invitations SET created_by=? WHERE created_by=?').run(actor.id,userId);
    sql.prepare('DELETE FROM pairing_codes WHERE creator_id=?').run(userId);
    // Their GM browsers stop syncing; another GM re-authorizes with a pairing code.
    sql.prepare('DELETE FROM bridge_credentials WHERE user_id=?').run(userId);
    sql.prepare('DELETE FROM users WHERE id=?').run(userId);
  });
  return respond({deleted:true});
}
