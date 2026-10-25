import { error, json } from '@sveltejs/kit';
import { digest, readSession } from './security.js';
import { db, limit } from './db.js';

export function respond(data, status = 200) {
  return json(data, { status, headers: { 'cache-control': 'no-store' } });
}
export function problem(status, code) {
  throw error(status, { message: code });
}
export async function input(request, maxBytes = 32768) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) problem(415, 'json_required');
  const size = Number(request.headers.get('content-length') || 0);
  if (size > maxBytes) problem(413, 'payload_too_large');
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxBytes) problem(413, 'payload_too_large');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  problem(400, 'invalid_json');
}
export function sessionUser(event) {
  const user = readSession(event.cookies);
  if (!user) problem(401, 'login_required');
  return user;
}
export function ownerOrGm(user, campaignId) {
  if (user.site_role === 'owner') return;
  const m = db().prepare('SELECT role FROM memberships WHERE campaign_id=? AND user_id=?')
    .get(campaignId, user.id);
  if (m?.role !== 'gm') problem(403, 'gm_required');
}
export function requireMembership(user, campaignId) {
  if (user.site_role === 'owner') return;
  if (!db().prepare('SELECT 1 FROM memberships WHERE campaign_id=? AND user_id=?')
    .get(campaignId, user.id)) problem(403, 'membership_required');
}
export function requireAnyGm(user) {
  if (user.site_role === 'owner') return;
  if (!db().prepare("SELECT 1 FROM memberships WHERE user_id=? AND role='gm' LIMIT 1")
    .get(user.id)) problem(403, 'gm_required');
}
export function validateUsername(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(value)) problem(400, 'invalid_username');
  return value.toLowerCase();
}
export function validateDisplay(value) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 80) problem(400, 'invalid_name');
  return value.trim();
}
export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) problem(400, 'password_12_to_256_characters');
  return value;
}
export function throttle(event, purpose, max = 8, seconds = 600) {
  const ip = event.getClientAddress?.() || 'unknown';
  if (!limit(purpose + ':' + digest(ip), max, seconds)) problem(429, 'too_many_attempts');
}
export function bridgeAuth(event, integrationId) {
  const header = event.request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9_-]{40,70}$/.test(header)) problem(401, 'token_required');
  const hash = digest(header.slice(7));
  const origin = event.request.headers.get('origin');
  const row = db().prepare(`
    SELECT bc.*,COALESCE(bc.origin,i.foundry_origin) AS credential_origin,i.revoked_at AS integration_revoked,i.campaign_id,
           u.status AS user_status,u.site_role,m.role AS member_role
    FROM bridge_credentials bc
    JOIN integrations i ON i.id=bc.integration_id
    JOIN users u ON u.id=bc.user_id
    LEFT JOIN memberships m ON m.campaign_id=i.campaign_id AND m.user_id=bc.user_id
    WHERE bc.integration_id=? AND bc.access_hash=?`)
    .get(integrationId, hash);
  if (!row || row.revoked_at || row.integration_revoked ||
      row.access_expires_at <= Math.floor(Date.now() / 1000) ||
      row.user_status !== 'active' || (row.site_role !== 'owner' && row.member_role !== 'gm') ||
      !origin || origin !== row.credential_origin) problem(401, 'invalid_bridge_authorization');
  return row;
}
