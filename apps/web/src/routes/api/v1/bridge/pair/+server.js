import { randomUUID } from 'node:crypto';
import { db, unix, transaction } from '$lib/server/db.js';
import { token, digest, newCredential } from '$lib/server/security.js';
import { input, respond, problem, throttle } from '$lib/server/api.js';

export async function POST(event) {
  throttle(event,'bridge-pair',10,600);
  const body=await input(event.request);
  const origin=event.request.headers.get('origin'); // validated in hooks.server.js
  if (typeof body.code!=='string'||body.code.length<40||body.code.length>70) problem(400,'invalid_pairing_code');
  const worldId=typeof body.worldId==='string' ? body.worldId.trim() : '';
  const worldTitle=typeof body.worldTitle==='string' ? body.worldTitle.trim() : '';
  const systemId=body.systemId;
  if (!worldId || worldId.length>128 || !worldTitle || worldTitle.length>128 ||
      !['pf2e','sf2e'].includes(systemId) || !origin) problem(400,'invalid_world');
  const integrationId=randomUUID(),campaignId=randomUUID();
  const result=transaction(sql=>{
    const pairing=sql.prepare(`SELECT p.creator_id,u.site_role FROM pairing_codes p
      JOIN users u ON u.id=p.creator_id
      WHERE p.code_hash=? AND p.expires_at>? AND p.consumed_at IS NULL AND u.status='active'`)
      .get(digest(body.code),unix());
    if (!pairing) problem(400,'invalid_pairing_code');
    if (pairing.site_role!=='owner' && !sql.prepare("SELECT 1 FROM memberships WHERE user_id=? AND role='gm'").get(pairing.creator_id)) problem(403,'gm_required');
    // Prevent duplicates or a copied world silently claiming the same web campaign.
    const duplicate=sql.prepare("SELECT 1 FROM integrations WHERE foundry_origin=? AND world_id=? AND revoked_at IS NULL").get(origin,worldId);
    if (duplicate) problem(409,'world_already_paired_reauthorize_in_website');
    sql.prepare("UPDATE pairing_codes SET consumed_at=? WHERE code_hash=? AND consumed_at IS NULL").run(unix(),digest(body.code));
    sql.prepare("INSERT INTO campaigns(id,title,owner_id,world_id,system_id,created_at) VALUES(?,?,?,?,?,?)")
      .run(campaignId,worldTitle,pairing.creator_id,worldId,systemId,unix());
    sql.prepare("INSERT INTO memberships(campaign_id,user_id,role) VALUES(?,?,'gm')")
      .run(campaignId,pairing.creator_id);
    sql.prepare("INSERT INTO integrations(id,campaign_id,foundry_origin,world_id,created_at) VALUES(?,?,?,?,?)")
      .run(integrationId,campaignId,origin,worldId,unix());
    return newCredential(sql,integrationId,pairing.creator_id);
  });
  return respond({...result,campaignId},201);
}
