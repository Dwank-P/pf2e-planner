import { db } from '$lib/server/db.js';
import { respond, sessionUser } from '$lib/server/api.js';
export function GET(event) {
  const user = sessionUser(event);
  const campaigns = db().prepare(`
    SELECT c.id,c.title,c.system_id, m.role FROM campaigns c
    LEFT JOIN memberships m ON c.id=m.campaign_id AND m.user_id=?
    WHERE ?='owner' OR m.user_id=? ORDER BY c.created_at DESC
  `).all(user.id,user.site_role,user.id);
  return respond({ user: { id:user.id,username:user.username,displayName:user.display_name,siteRole:user.site_role }, campaigns });
}
