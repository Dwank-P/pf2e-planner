import {db,transaction} from '#lib/server/db.js';
import {input,respond,problem,sessionUser,ownerOrGm} from '#lib/server/api.js';

function load(event){
  const actor=sessionUser(event);
  const integration=db().prepare('SELECT id,campaign_id FROM integrations WHERE id=? AND revoked_at IS NULL')
    .get(event.params.integrationId);
  if(!integration)problem(404,'integration_not_found');
  ownerOrGm(actor,integration.campaign_id);
  return integration;
}
const list=id=>db().prepare(`SELECT o.origin,o.created_at AS createdAt,
    (SELECT COUNT(*) FROM bridge_credentials bc WHERE bc.integration_id=o.integration_id AND bc.revoked_at IS NULL
      AND COALESCE(bc.origin,(SELECT foundry_origin FROM integrations WHERE id=o.integration_id))=o.origin) AS browsers
  FROM integration_origins o WHERE o.integration_id=? ORDER BY o.created_at`).all(id);

/** Foundry addresses (domains) this world is opened from, each with its GM browser count. */
export function GET(event){
  return respond({origins:list(load(event).id)});
}
/** Stop accepting one address: its GM browsers are signed out of the Bridge. */
export async function DELETE(event){
  const integration=load(event);
  const body=await input(event.request);
  const origin=typeof body.origin==='string'?body.origin:'';
  const origins=list(integration.id);
  if(!origins.some(o=>o.origin===origin))problem(404,'origin_not_found');
  if(origins.length<2)problem(409,'last_origin_disconnect_world_instead');
  transaction(sql=>{
    sql.prepare('DELETE FROM integration_origins WHERE integration_id=? AND origin=?').run(integration.id,origin);
    sql.prepare(`UPDATE bridge_credentials SET revoked_at=unixepoch() WHERE integration_id=? AND revoked_at IS NULL
      AND COALESCE(origin,(SELECT foundry_origin FROM integrations WHERE id=?))=?`).run(integration.id,integration.id,origin);
  });
  return respond({origins:list(integration.id)});
}
