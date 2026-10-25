import { db } from '#lib/server/db.js';
import { respond, sessionUser, problem } from '#lib/server/api.js';
/** Every account, for the server owner's user management. */
export function GET(event) {
  const user = sessionUser(event);
  if (user.site_role !== 'owner') problem(403, 'owner_required');
  const users = db().prepare(`SELECT u.id,u.username,u.display_name AS displayName,u.status,u.site_role AS siteRole,
      u.created_at AS createdAt,
      (SELECT COUNT(*) FROM memberships m WHERE m.user_id=u.id) AS campaigns,
      (SELECT COUNT(*) FROM character_builds b WHERE b.owner_user_id=u.id) AS characters,
      (SELECT MAX(r.expires_at) FROM password_resets r WHERE r.user_id=u.id AND r.consumed_at IS NULL) AS resetPendingUntil
    FROM users u ORDER BY u.site_role DESC, lower(COALESCE(u.username,u.display_name))`).all();
  return respond({ users });
}
