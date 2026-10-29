import {transaction,unix} from '#lib/server/db.js';
import {input,respond,problem,throttle} from '#lib/server/api.js';
import {digest,newCredential} from '#lib/server/security.js';

/**
 * A player's Foundry browser redeems a code from the website ({code}) for a player credential:
 * it can send that player's actors to the website and pull their website characters, nothing
 * else. Only from a Foundry address this world is already paired from (checked in hooks).
 */
export async function POST(event){
  throttle(event,'bridge-connect-player',10,600);
  const body=await input(event.request,2000);
  const origin=event.request.headers.get('origin');
  if(typeof body.code!=='string'||body.code.length<40||body.code.length>70||!origin)problem(400,'invalid_connect_code');
  const integrationId=event.params.integrationId;
  const result=transaction(sql=>{
    const row=sql.prepare(`SELECT c.user_id FROM player_link_codes c
      JOIN integrations i ON i.campaign_id=c.campaign_id AND i.id=? AND i.revoked_at IS NULL
      JOIN users u ON u.id=c.user_id AND u.status='active'
      WHERE c.code_hash=? AND c.consumed_at IS NULL AND c.expires_at>?`).get(integrationId,digest(body.code),unix());
    if(!row)problem(400,'invalid_connect_code');
    sql.prepare('UPDATE player_link_codes SET consumed_at=? WHERE code_hash=?').run(unix(),digest(body.code));
    const user=sql.prepare('SELECT display_name FROM users WHERE id=?').get(row.user_id);
    return {...newCredential(sql,integrationId,row.user_id,origin,'player'),displayName:user?.display_name??null};
  });
  return respond(result,201);
}
