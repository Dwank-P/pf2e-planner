import { randomUUID } from 'node:crypto';
import { db, unix, transaction } from '#lib/server/db.js';
import { constantEquals, passwordHash, setSession } from '#lib/server/security.js';
import { input, problem, respond, throttle, validatePassword, validateUsername, validateDisplay } from '#lib/server/api.js';

/** Whether the first owner account still needs creating (drives the first-run screen). */
export function GET() {
  const needed=!db().prepare('SELECT 1 FROM users LIMIT 1').get();
  return respond({ needed, configured: !!process.env.BOOTSTRAP_TOKEN && process.env.BOOTSTRAP_TOKEN.length >= 32 });
}
export async function POST(event) {
  throttle(event, 'setup', 5, 3600);
  const request = await input(event.request);
  if (!process.env.BOOTSTRAP_TOKEN || process.env.BOOTSTRAP_TOKEN.length < 32) problem(503, 'setup_not_configured');
  if (!constantEquals(request.bootstrapToken, process.env.BOOTSTRAP_TOKEN)) problem(403, 'invalid_bootstrap');
  const username = validateUsername(request.username);
  const name = validateDisplay(request.displayName);
  const password = validatePassword(request.password);
  const hashed = await passwordHash(password);
  const id = randomUUID();
  try {
    transaction((sql) => {
      if (sql.prepare('SELECT 1 FROM users LIMIT 1').get()) problem(409, 'already_initialized');
      sql.prepare(`INSERT INTO users(id,display_name,username,password_hash,status,site_role,created_at)
        VALUES(?,?,?,?,?,?,?)`).run(id,name,username,hashed,'active','owner',unix());
    });
  } catch (err) {
    if (String(err).includes('UNIQUE')) problem(409, 'already_initialized');
    throw err;
  }
  setSession(event.cookies, id);
  return respond({ id, username, displayName: name, siteRole: 'owner' }, 201);
}
