import { randomUUID } from 'node:crypto';
import { db, unix, transaction } from '#lib/server/db.js';
import { token, digest } from '#lib/server/security.js';
import { input, respond, sessionUser, ownerOrGm, problem, throttle } from '#lib/server/api.js';

export function GET(event) {
  const user=sessionUser(event); ownerOrGm(user,event.params.campaignId);
  const members=db().prepare(`SELECT u.id,u.display_name AS displayName,u.username,u.status,m.role
    FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.campaign_id=?
    ORDER BY m.role,u.display_name`).all(event.params.campaignId);
  return respond({members});
}
export async function POST(event) {
  const actor=sessionUser(event), campaignId=event.params.campaignId;
  ownerOrGm(actor,campaignId);
  throttle(event,'add-player',30,3600);
  const body=await input(event.request);
  if (typeof body.existingUserId==='string' && body.existingUserId.length===36) {
    const existing=db().prepare("SELECT id,status FROM users WHERE id=?").get(body.existingUserId);
    if (!existing || existing.status!=='active') problem(404,'user_not_found');
    const result=db().prepare("INSERT OR IGNORE INTO memberships(campaign_id,user_id,role) VALUES(?,?,'player')")
      .run(campaignId,existing.id);
    return respond({userId:existing.id,alreadyMember:result.changes===0});
  }
  // Invite by code only; the player chooses their own identity during activation.
  const userId=randomUUID(), inviteId=randomUUID(), code=token(), expiresAt=unix()+86400;
  transaction(sql=>{
    sql.prepare(`INSERT INTO users(id,display_name,status,site_role,created_at) VALUES(?,?,'pending','user',?)`)
      .run(userId,'Invited player',unix());
    sql.prepare("INSERT INTO memberships(campaign_id,user_id,role) VALUES(?,?,'player')").run(campaignId,userId);
    sql.prepare(`INSERT INTO invitations(id,user_id,code_hash,expires_at,created_by) VALUES(?,?,?,?,?)`)
      .run(inviteId,userId,digest(code),expiresAt,actor.id);
  });
  // Sensitive: one-time display, never log / return from any read endpoint.
  return respond({userId,inviteCode:code,joinUrl:(process.env.PUBLIC_ORIGIN||'http://localhost:5173')+'/join',expiresAt},201);
}
