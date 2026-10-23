import { logout } from '$lib/server/security.js';
import { respond } from '$lib/server/api.js';
export function POST(event) {
  logout(event.cookies);
  return respond({ ok: true });
}
