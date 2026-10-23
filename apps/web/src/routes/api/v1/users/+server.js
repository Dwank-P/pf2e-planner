import { db } from '#lib/server/db.js';
import { respond, sessionUser, requireAnyGm } from '#lib/server/api.js';
export function GET(event) {
  const user = sessionUser(event);
  requireAnyGm(user);
  const q = event.url.searchParams.get('q')?.trim().slice(0,60) ?? '';
  if (q.length < 2) return respond({ users: [] });
  const escaped = q.toLowerCase().replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_');
  const users = db().prepare(`SELECT id,display_name AS displayName,username
    FROM users WHERE status='active' AND (lower(display_name) LIKE ? ESCAPE '\\' OR lower(username) LIKE ? ESCAPE '\\')
    ORDER BY display_name LIMIT 20`).all('%'+escaped+'%','%'+escaped+'%');
  return respond({ users });
}
