import { db } from '$lib/server/db.js';
import { passwordVerify, setSession, digest } from '$lib/server/security.js';
import { input, problem, respond, throttle } from '$lib/server/api.js';

export async function POST(event) {
  throttle(event, 'login-ip', 20, 600);
  const body = await input(event.request);
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!username || username.length > 32 || typeof body.password !== 'string') problem(401, 'invalid_credentials');
  throttle(event, 'login-user-' + digest(username), 10, 600);
  const user = db().prepare(`SELECT id,username,display_name,site_role,status,password_hash
    FROM users WHERE username=?`).get(username);
  if (!user || user.status !== 'active' || !(await passwordVerify(user.password_hash, body.password))) {
    problem(401, 'invalid_credentials');
  }
  setSession(event.cookies, user.id);
  return respond({ id:user.id, username:user.username, displayName:user.display_name, siteRole:user.site_role });
}
