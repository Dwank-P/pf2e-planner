import { db, unix, transaction } from '#lib/server/db.js';
import { token, digest } from '#lib/server/security.js';
import { input, respond, problem, sessionUser } from '#lib/server/api.js';
/**
 * Server owner issues a one-time password reset link (24 hours) for a locked-out
 * user. The owner never sees or sets the password; using the link signs the user
 * out everywhere else.
 */
export async function POST(event) {
  const actor = sessionUser(event);
  if (actor.site_role !== 'owner') problem(403, 'owner_required');
  await input(event.request);
  const target = db().prepare("SELECT id,username,display_name FROM users WHERE id=? AND status='active'")
    .get(event.params.userId);
  if (!target) problem(404, 'user_not_found');
  const code = token(), expiresAt = unix() + 24 * 3600;
  transaction(sql => {
    sql.prepare('DELETE FROM password_resets WHERE user_id=? AND consumed_at IS NULL').run(target.id);
    sql.prepare('INSERT INTO password_resets(code_hash,user_id,created_by,expires_at) VALUES(?,?,?,?)')
      .run(digest(code), target.id, actor.id, expiresAt);
  });
  const origin = process.env.PUBLIC_ORIGIN || event.url.origin;
  return respond({ code, expiresAt, resetUrl: origin + '/reset#' + code, username: target.username }, 201);
}
