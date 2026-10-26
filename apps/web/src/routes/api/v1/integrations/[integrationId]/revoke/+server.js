import { db,unix,transaction } from '#lib/server/db.js';
import { input, respond, problem,sessionUser,ownerOrGm } from '#lib/server/api.js';
import {retainPicks} from '#lib/server/personal.js';
/** Admin/GM revokes this world's integration and all GM bridge tokens. */
export async function POST(event) {
  const actor=sessionUser(event);
  await input(event.request);
  const integration=db().prepare('SELECT id,campaign_id FROM integrations WHERE id=?')
    .get(event.params.integrationId);
  if (!integration) problem(404,'integration_not_found');
  ownerOrGm(actor,integration.campaign_id);
  transaction(sql=>{
    // Personal characters keep what they picked from this world.
    retainPicks(sql,{integrationId:integration.id});
    sql.prepare('UPDATE integrations SET revoked_at=? WHERE id=?').run(unix(),integration.id);
    sql.prepare('UPDATE bridge_credentials SET revoked_at=? WHERE integration_id=?')
      .run(unix(),integration.id);
  });
  return respond({revoked:true});
}
