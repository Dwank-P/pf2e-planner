import {db,unix} from '#lib/server/db.js';
import {respond,sessionUser,ownerOrGm,problem} from '#lib/server/api.js';
/** Revoke an invite link; people who already joined keep their access. */
export function DELETE(event){
  const user=sessionUser(event);ownerOrGm(user,event.params.campaignId);
  const r=db().prepare('UPDATE campaign_invite_links SET revoked_at=? WHERE id=? AND campaign_id=? AND revoked_at IS NULL')
    .run(unix(),event.params.linkId,event.params.campaignId);
  if(!r.changes)problem(404,'invite_link_not_found');
  return respond({revoked:true});
}
