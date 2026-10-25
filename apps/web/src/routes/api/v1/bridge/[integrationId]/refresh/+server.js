import { unix,transaction } from '#lib/server/db.js';
import { token,digest,ACCESS_TTL,REFRESH_TTL } from '#lib/server/security.js';
import { input,respond,problem,throttle } from '#lib/server/api.js';

export async function POST(event) {
  throttle(event,'bridge-refresh',80,3600);
  const id=event.params.integrationId;
  const body=await input(event.request);
  if (typeof body.refreshToken!=='string'||body.refreshToken.length<40||body.refreshToken.length>70) problem(401,'invalid_refresh');
  const origin=event.request.headers.get('origin');
  const hash=digest(body.refreshToken);
  const result=transaction(sql=>{
    sql.prepare('DELETE FROM bridge_spent_refresh_tokens WHERE expires_at<?').run(unix());
    const credential=sql.prepare(`SELECT bc.*,COALESCE(bc.origin,i.foundry_origin) AS credential_origin,i.revoked_at AS integration_revoked,i.campaign_id,
       u.status AS user_status,u.site_role,m.role AS member_role
       FROM bridge_credentials bc JOIN integrations i ON i.id=bc.integration_id
       JOIN users u ON u.id=bc.user_id
       LEFT JOIN memberships m ON m.user_id=bc.user_id AND m.campaign_id=i.campaign_id
       WHERE bc.integration_id=? AND bc.refresh_hash=?`)
      .get(id,hash);

    if (!credential) {
      const replay=sql.prepare(`SELECT r.credential_id,COALESCE(bc.origin,i.foundry_origin) AS credential_origin
        FROM bridge_spent_refresh_tokens r
        JOIN bridge_credentials bc ON bc.id=r.credential_id
        JOIN integrations i ON i.id=bc.integration_id
        WHERE r.token_hash=? AND bc.integration_id=?`).get(hash,id);
      if (replay && replay.credential_origin===origin) {
        sql.prepare('UPDATE bridge_credentials SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
          .run(unix(),replay.credential_id);
        return { revoked:true }; // Commit revocation, then fail outside transaction.
      }
      problem(401,'invalid_refresh');
    }

    if (credential.revoked_at || credential.integration_revoked ||
        credential.credential_origin!==origin || credential.user_status!=='active' ||
        (credential.site_role!=='owner' && credential.member_role!=='gm')) problem(401,'invalid_refresh');
    if (credential.refresh_expires_at<=unix()) problem(401,'refresh_expired');

    const accessToken=token(), refreshToken=token(), now=unix();
    sql.prepare(`INSERT INTO bridge_spent_refresh_tokens(token_hash,credential_id,expires_at)
      VALUES(?,?,?)`).run(hash,credential.id,credential.refresh_expires_at);
    sql.prepare(`UPDATE bridge_credentials SET access_hash=?,access_expires_at=?,
      refresh_hash=?,refresh_expires_at=?,previous_refresh_hash=? WHERE id=?`)
      .run(digest(accessToken),now+ACCESS_TTL,digest(refreshToken),now+REFRESH_TTL,hash,credential.id);
    return {accessToken,accessExpiresAt:now+ACCESS_TTL,refreshToken,refreshExpiresAt:now+REFRESH_TTL};
  });
  if (result.revoked) problem(401,'refresh_reuse_detected_credential_revoked');
  return respond(result);
}
