import { db, unix } from '#lib/server/db.js';
import { digest } from '#lib/server/security.js';
import { input, problem, respond, throttle } from '#lib/server/api.js';

/**
 * Only verifies that a one-use invitation is currently redeemable.
 * Does NOT consume the code; redemption remains atomic on the next step.
 */
export async function POST(event) {
  throttle(event, 'invite-validate', 15, 600);
  const body = await input(event.request);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^[A-Za-z0-9_-]{40,70}$/.test(code)) problem(400, 'invalid_or_expired_code');
  const invitation = db().prepare(`SELECT i.id FROM invitations i
    JOIN users u ON u.id=i.user_id
    WHERE i.code_hash=? AND i.expires_at>? AND i.consumed_at IS NULL
      AND u.status='pending'`).get(digest(code),unix());
  if (!invitation) problem(400, 'invalid_or_expired_code');
  return respond({ valid: true });
}
