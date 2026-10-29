import { db, unix, transaction } from '#lib/server/db.js';
import { passwordHash, passwordVerify, setSession } from '#lib/server/security.js';
import { respond, sessionUser, input, problem, throttle, validatePassword } from '#lib/server/api.js';
/** Change your password; every other signed-in browser is signed out. */
export async function POST(event) {
  const user = sessionUser(event);
  throttle(event, 'password-change-' + user.id, 8, 600);
  const body = await input(event.request);
  const next = validatePassword(body.newPassword);
  const current = db().prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
  if (typeof body.currentPassword !== 'string' || !(await passwordVerify(current?.password_hash, body.currentPassword)))
    problem(403, 'current_password_incorrect');
  const hashed = await passwordHash(next);
  transaction(sql => {
    sql.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashed, user.id);
    sql.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(unix(), user.id);
  });
  setSession(event.cookies, user.id);
  return respond({ changed: true });
}
