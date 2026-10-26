import {db,transaction} from '#lib/server/db.js';
import {respond,sessionUser,ownerOrGm,problem} from '#lib/server/api.js';
import {retainPicks} from '#lib/server/personal.js';

/**
 * Remove a player from this campaign (GM or site owner). An invitation that was
 * never redeemed deletes the placeholder account. Characters stay in the
 * campaign; the GM can still open them.
 */
export function DELETE(event){
  const actor=sessionUser(event),{campaignId,userId}=event.params;
  ownerOrGm(actor,campaignId);
  const target=db().prepare(`SELECT u.id,u.status,u.site_role,m.role FROM users u
    JOIN memberships m ON m.user_id=u.id AND m.campaign_id=? WHERE u.id=?`).get(campaignId,userId);
  if(!target)problem(404,'member_not_found');
  if(target.site_role==='owner')problem(403,'cannot_remove_site_owner');
  if(target.role==='gm'){
    const gms=db().prepare("SELECT COUNT(*) AS n FROM memberships WHERE campaign_id=? AND role='gm'").get(campaignId).n;
    if(gms<=1)problem(409,'campaign_needs_a_gm');
  }
  const result=transaction(sql=>{
    // Unless the world is shared with everyone, their personal characters keep what they picked
    // from it, then stop using it.
    if(!sql.prepare('SELECT share_compendiums FROM campaigns WHERE id=?').get(campaignId)?.share_compendiums)
      for(const i of sql.prepare('SELECT id FROM integrations WHERE campaign_id=?').all(campaignId))
        retainPicks(sql,{integrationId:i.id,ownerId:userId});
    sql.prepare('DELETE FROM memberships WHERE campaign_id=? AND user_id=?').run(campaignId,userId);
    if(target.status==='pending'){
      sql.prepare('DELETE FROM invitations WHERE user_id=?').run(userId);
      sql.prepare("DELETE FROM users WHERE id=? AND status='pending'").run(userId);
      return {removed:true,deletedInvitation:true};
    }
    return {removed:true,deletedInvitation:false};
  });
  return respond(result);
}
