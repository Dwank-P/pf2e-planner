import { randomUUID } from 'node:crypto';
import { db, unix, transaction } from '#lib/server/db.js';
import { digest, newCredential } from '#lib/server/security.js';
import { input, respond, problem, throttle } from '#lib/server/api.js';

/** Authorize a second GM browser/device for an existing paired world.
 * Caller has a site-issued code; the associated site user must be this campaign's GM.
 */
export async function POST(event) {
  throttle(event,'bridge-authorize',10,600);
  const id=event.params.integrationId,body=await input(event.request);
  const origin=event.request.headers.get('origin');
  if (typeof body.code!=='string'||body.code.length<40||body.code.length>70) problem(400,'invalid_pairing_code');
  const result=transaction(sql=>{
    const integration=sql.prepare('SELECT * FROM integrations WHERE id=? AND revoked_at IS NULL').get(id);
    if (!integration || integration.foundry_origin!==origin ||
        integration.world_id!==body.worldId) problem(404,'integration_not_found_or_mismatch');
    const pairing=sql.prepare(`SELECT p.creator_id,u.site_role FROM pairing_codes p
      JOIN users u ON u.id=p.creator_id
      WHERE p.code_hash=? AND p.expires_at>? AND p.consumed_at IS NULL AND u.status='active'`)
      .get(digest(body.code),unix());
    if (!pairing) problem(400,'invalid_pairing_code');
    const gm=sql.prepare("SELECT role FROM memberships WHERE campaign_id=? AND user_id=?")
      .get(integration.campaign_id,pairing.creator_id);
    if (pairing.site_role!=='owner' && gm?.role!=='gm') problem(403,'campaign_gm_required');
    sql.prepare('UPDATE pairing_codes SET consumed_at=? WHERE code_hash=?').run(unix(),digest(body.code));
    return newCredential(sql,id,pairing.creator_id);
  });
  const group=db().prepare('SELECT campaign_id FROM integrations WHERE id=?').get(id);
  return respond({...result,campaignId:group.campaign_id},201);
}
