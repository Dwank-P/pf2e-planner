import {randomUUID} from 'node:crypto';
import {db,unix} from '#lib/server/db.js';
import {token} from '#lib/server/security.js';
import {input,respond,sessionUser,ownerOrGm,throttle} from '#lib/server/api.js';
import {expiryFor,linkView} from '#lib/server/invite-links.js';

const origin=event=>process.env.PUBLIC_ORIGIN||event.url.origin;
/** The campaign's active invite links (GM). */
export function GET(event){
  const user=sessionUser(event);ownerOrGm(user,event.params.campaignId);
  const rows=db().prepare(`SELECT l.*,u.display_name AS created_by_name FROM campaign_invite_links l
    LEFT JOIN users u ON u.id=l.created_by
    WHERE l.campaign_id=? AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>?)
    ORDER BY l.created_at DESC`).all(event.params.campaignId,unix());
  return respond({links:rows.map(r=>linkView(r,origin(event)))});
}
/** Create a reusable link. Body: {duration:{unit:'hours'|'days'|'months'|'years'|'never', amount}} (default 24 hours). */
export async function POST(event){
  const user=sessionUser(event);ownerOrGm(user,event.params.campaignId);
  throttle(event,'invite-link',30,3600);
  const body=await input(event.request);
  const now=unix(),id=randomUUID(),code=token();
  const expiresAt=expiryFor(body.duration??{unit:'hours',amount:24},now);
  db().prepare(`INSERT INTO campaign_invite_links(id,campaign_id,code,created_by,created_at,expires_at)
    VALUES(?,?,?,?,?,?)`).run(id,event.params.campaignId,code,user.id,now,expiresAt);
  const row=db().prepare('SELECT * FROM campaign_invite_links WHERE id=?').get(id);
  return respond({link:linkView({...row,created_by_name:user.display_name},origin(event))},201);
}
