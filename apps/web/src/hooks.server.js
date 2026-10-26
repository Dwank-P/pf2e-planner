import { db } from '#lib/server/db.js';
import { startBackupSchedule } from '#lib/server/backup.js';

// Verified database backups every PLANNER_BACKUP_HOURS (default 24; 0 turns them off).
startBackupSchedule();

function siteOrigin() {
  return process.env.PUBLIC_ORIGIN || 'http://localhost:5173';
}
function candidateOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin &&
      (parsed.protocol === 'https:' ||
       (process.env.ALLOW_INSECURE_LOCAL_BRIDGE === 'true' &&
        parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(parsed.hostname)));
  } catch { return false; }
}
function bridgeCors(event) {
  const path = event.url.pathname;
  if (!path.startsWith('/api/v1/bridge/')) return null;
  const origin = event.request.headers.get('origin');
  if (!origin || !candidateOrigin(origin)) return null;
  if (path === '/api/v1/bridge/pair' || path === '/api/v1/bridge/status') return origin;
  const id = /^\/api\/v1\/bridge\/([a-f0-9-]{36})\/(refresh|catalog-preview|authorize|catalog-import\/(?:start|batch|commit|status)|icons\/(?:missing|link|batch)|characters\/(?:import|owners|list|export))$/.exec(path)?.[1];
  if (!id) return null;
  const row = db().prepare('SELECT revoked_at FROM integrations WHERE id=?').get(id);
  if (!row || row.revoked_at) return null;
  // Authorizing a new GM browser may come from a new Foundry address; it needs a GM code.
  if (path.endsWith('/authorize')) return origin;
  const known = db().prepare('SELECT 1 FROM integration_origins WHERE integration_id=? AND origin=?').get(id, origin);
  return known ? origin : null;
}
export async function handle({ event, resolve }) {
  const path = event.url.pathname;
  const isBridge = path.startsWith('/api/v1/bridge/');
  const origin = event.request.headers.get('origin');
  const cors = bridgeCors(event);
  if (isBridge && event.request.method === 'OPTIONS') {
    return cors ? new Response(null, { status: 204, headers: {
      'access-control-allow-origin': cors,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '300', vary: 'Origin'
    } }) : new Response(null, { status: 403 });
  }
  if (isBridge && !cors) return new Response('Forbidden Origin', { status: 403 });
  if (!isBridge && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.request.method) &&
      origin && origin !== siteOrigin()) return new Response('Invalid Origin', { status: 403 });
  // Cookie-protected API operations need an Origin header; CLI setup is exception.
  if (!isBridge && path.startsWith('/api/v1/') &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.request.method) &&
      path !== '/api/v1/setup' && !origin) {
    return new Response('Origin required', { status: 403 });
  }
  const response = await resolve(event);
  // Item icons carry their own private cache headers.
  if (!/^\/api\/v1\/campaigns\/[^/]+\/icons\//.test(path) || !response.ok)
    response.headers.set('cache-control', 'no-store');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'no-referrer');
  if (isBridge && cors) {
    response.headers.set('access-control-allow-origin', cors);
    response.headers.set('vary', 'Origin');
  }
  return response;
}
