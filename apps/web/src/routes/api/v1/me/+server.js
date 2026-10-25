import { db } from '#lib/server/db.js';
import { respond, sessionUser, input, problem, validateUsername, validateDisplay } from '#lib/server/api.js';
export function GET(event) {
  const user = sessionUser(event);
  const campaigns = db().prepare(`
    SELECT c.id,c.title,c.system_id, m.role FROM campaigns c
    LEFT JOIN memberships m ON c.id=m.campaign_id AND m.user_id=?
    WHERE ?='owner' OR m.user_id=? ORDER BY c.created_at DESC
  `).all(user.id,user.site_role,user.id);
  return respond({ user: { id:user.id,username:user.username,displayName:user.display_name,siteRole:user.site_role }, campaigns });
}
/** Change your own username and/or display name. */
export async function PATCH(event) {
  const user = sessionUser(event);
  const body = await input(event.request);
  const username = body.username === undefined ? user.username : validateUsername(body.username);
  const displayName = body.displayName === undefined ? user.display_name : validateDisplay(body.displayName);
  try {
    db().prepare('UPDATE users SET username=?,display_name=? WHERE id=?').run(username, displayName, user.id);
  } catch (error) {
    if (String(error).includes('UNIQUE')) problem(409, 'username_unavailable');
    throw error;
  }
  return respond({ user: { id:user.id, username, displayName, siteRole:user.site_role } });
}
