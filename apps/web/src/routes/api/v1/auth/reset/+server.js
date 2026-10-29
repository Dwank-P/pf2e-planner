import { db, unix, transaction } from '#lib/server/db.js';
import { digest, passwordHash, setSession } from '#lib/server/security.js';
import { input, respond, problem, throttle, validatePassword } from '#lib/server/api.js';
/** Redeem a one-time reset code from the server owner: set a new password and sign in. */
export async function POST(event) {
  throttle(event, 'password-reset', 8, 600);
  const body = await input(event.request);
  if (typeof body.code !== 'string' || body.code.length < 40 || body.code.length > 70) problem(400, 'invalid_or_expired_code');
  const password = validatePassword(body.password);
  const reset = db().prepare(`SELECT r.user_id,u.username FROM password_resets r JOIN users u ON u.id=r.user_id
    WHERE r.code_hash=? AND r.expires_at>? AND r.consumed_at IS NULL AND u.status='active'`).get(digest(body.code), unix());
  if (!reset) problem(400, 'invalid_or_expired_code');
  const hashed = await passwordHash(password);
  transaction(sql => {
    const used = sql.prepare('UPDATE password_resets SET consumed_at=? WHERE code_hash=? AND consumed_at IS NULL')
      .run(unix(), digest(body.code));
    if (!used.changes) problem(400, 'invalid_or_expired_code');
    sql.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashed, reset.user_id);
    sql.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(unix(), reset.user_id);
  });
  setSession(event.cookies, reset.user_id);
  return respond({ ok: true, username: reset.username });
}
