import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { db, unix } from './db.js';

export const ACCESS_TTL = 15 * 60;
export const REFRESH_TTL = 14 * 24 * 3600;
export const SESSION_TTL = 30 * 24 * 3600;

export function token() { return randomBytes(32).toString('base64url'); }
export function digest(secret) { return createHash('sha256').update(secret).digest('hex'); }
export function constantEquals(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function passwordHash(password) {
  return hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 3, parallelism: 1 });
}
export async function passwordVerify(encoded, password) {
  try { return Boolean(encoded && await verify(encoded, password)); }
  catch { return false; }
}

export function cookieName() {
  return new URL(process.env.PUBLIC_ORIGIN || 'http://localhost:5173').protocol === 'https:'
    ? '__Host-planner_session' : 'planner_session_dev';
}
export function setSession(cookies, userId) {
  const value = token();
  db().prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)')
    .run(digest(value), userId, unix() + SESSION_TTL);
  const secure = cookieName().startsWith('__Host-');
  cookies.set(cookieName(), value, {
    path: '/', httpOnly: true, secure, sameSite: 'lax', maxAge: SESSION_TTL
  });
}

export function readSession(cookies) {
  const value = cookies.get(cookieName());
  if (!value) return null;
  return db().prepare(`
    SELECT u.id,u.username,u.display_name,u.site_role,u.status
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='active'
  `).get(digest(value), unix()) ?? null;
}

export function logout(cookies) {
  const value = cookies.get(cookieName());
  if (value) db().prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').run(unix(), digest(value));
  cookies.delete(cookieName(), { path: '/' });
}

export function newCredential(sql, integrationId, userId) {
  const accessToken = token(), refreshToken = token();
  const id = randomUUID();
  const now = unix();
  sql.prepare(`INSERT INTO bridge_credentials
    (id,integration_id,user_id,access_hash,access_expires_at,refresh_hash,refresh_expires_at,created_at)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(id, integrationId, userId, digest(accessToken), now + ACCESS_TTL,
         digest(refreshToken), now + REFRESH_TTL, now);
  return { integrationId, accessToken, accessExpiresAt: now + ACCESS_TTL, refreshToken, refreshExpiresAt: now + REFRESH_TTL };
}
