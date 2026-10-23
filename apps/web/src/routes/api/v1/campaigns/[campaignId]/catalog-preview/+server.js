import { db } from '$lib/server/db.js';
import { respond,sessionUser,requireMembership,problem } from '$lib/server/api.js';
export function GET(event) {
  const user=sessionUser(event),id=event.params.campaignId;
  requireMembership(user,id);
  const row=db().prepare(`SELECT c.data_json,c.updated_at FROM catalog_previews c
    JOIN integrations i ON i.id=c.integration_id
    WHERE i.campaign_id=? AND i.revoked_at IS NULL`).get(id);
  if (!row) problem(404,'catalog_not_synced');
  const data=JSON.parse(row.data_json);
  return respond({ ...data,updatedAt:row.updated_at });
}
