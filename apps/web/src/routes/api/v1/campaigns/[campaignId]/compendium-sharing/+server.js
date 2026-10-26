import {db,transaction} from '#lib/server/db.js';
import {sessionUser,requireMembership,ownerOrGm,input,problem,respond} from '#lib/server/api.js';
import {retainPicks} from '#lib/server/personal.js';

/**
 * Members can always use their own world's compendiums in personal characters. This switch
 * (off by default) shares them with every account on the server. Turning it off keeps what
 * other players' characters already picked.
 */
export function GET(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const row=db().prepare('SELECT share_compendiums FROM campaigns WHERE id=?').get(event.params.campaignId);
  const users=db().prepare(`SELECT COUNT(DISTINCT c.id) AS n FROM personal_sources s JOIN integrations i ON i.id=s.integration_id
    JOIN personal_characters c ON c.id=s.character_id WHERE i.campaign_id=?`).get(event.params.campaignId).n;
  return respond({enabled:row?.share_compendiums===1,personalCharacters:users});
}
export async function PUT(event){
  const user=sessionUser(event);
  ownerOrGm(user,event.params.campaignId);
  const body=await input(event.request,1000);
  if(typeof body.enabled!=='boolean')problem(400,'enabled_required');
  transaction(sql=>{
    if(!body.enabled){
      // Members and the server owner keep access; everyone else's characters keep their picks.
      const keep=new Set([...sql.prepare('SELECT user_id FROM memberships WHERE campaign_id=?').all(event.params.campaignId).map(r=>r.user_id),
        ...sql.prepare("SELECT id FROM users WHERE site_role='owner'").all().map(r=>r.id)]);
      for(const i of sql.prepare('SELECT id FROM integrations WHERE campaign_id=?').all(event.params.campaignId))
        retainPicks(sql,{integrationId:i.id,exceptOwners:keep});
    }
    sql.prepare('UPDATE campaigns SET share_compendiums=? WHERE id=?').run(body.enabled?1:0,event.params.campaignId);
  });
  return respond({enabled:body.enabled});
}
