import { db, unix } from '#lib/server/db.js';
import { token, digest } from '#lib/server/security.js';
import { input, problem, respond, sessionUser, requireAnyGm, throttle } from '#lib/server/api.js';
export async function POST(event) {
  const user = sessionUser(event);
  requireAnyGm(user);
  throttle(event,'pairing-code',10,3600);
  await input(event.request); // require JSON and same-origin; no untrusted campaign id accepted
  const code=token(), expiresAt=unix()+600;
  db().prepare('INSERT INTO pairing_codes(code_hash,creator_id,expires_at) VALUES(?,?,?)')
    .run(digest(code),user.id,expiresAt);
  return respond({ code,expiresAt },201);
}
