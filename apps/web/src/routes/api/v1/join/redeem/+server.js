import { db, unix, transaction } from '$lib/server/db.js';
import { digest, passwordHash, setSession } from '$lib/server/security.js';
import { input, respond, problem, throttle, validateUsername, validatePassword } from '$lib/server/api.js';

export async function POST(event) {
  throttle(event,'join-redeem',8,600);
  const body=await input(event.request);
  const username=validateUsername(body.username), password=validatePassword(body.password);
  if (typeof body.code!=='string' || body.code.length<40 || body.code.length>70) problem(400,'invalid_or_expired_code');
  const codeHash=digest(body.code);
  // Do not use expensive Argon2 until a valid invitation is found.
  const invite=db().prepare(`SELECT i.id,i.user_id FROM invitations i JOIN users u ON u.id=i.user_id
    WHERE i.code_hash=? AND i.expires_at>? AND i.consumed_at IS NULL AND u.status='pending'`)
    .get(codeHash,unix());
  if (!invite) problem(400,'invalid_or_expired_code');
  const hashed=await passwordHash(password);
  try {
    transaction(sql=>{
      const row=sql.prepare(`UPDATE invitations SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?`)
        .run(unix(),invite.id,unix());
      if (!row.changes) problem(400,'invalid_or_expired_code');
      const activated=sql.prepare("UPDATE users SET username=?,password_hash=?,status='active' WHERE id=? AND status='pending'")
        .run(username,hashed,invite.user_id);
      if (!activated.changes) problem(400,'invalid_or_expired_code');
    });
  } catch (err) {
    if (String(err).includes('UNIQUE')) problem(409,'username_unavailable');
    throw err;
  }
  setSession(event.cookies,invite.user_id);
  return respond({ok:true,username},201);
}
