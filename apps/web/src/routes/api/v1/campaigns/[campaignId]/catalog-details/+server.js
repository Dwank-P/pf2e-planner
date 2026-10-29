import { sessionUser, ownerOrGm, respond } from '#lib/server/api.js';
import { readCatalogReport } from '#lib/server/catalog-report.js';

/** Raw synchronized preview metadata is visible only to website owner/campaign GMs. */
export function GET(event) {
  const user = sessionUser(event);
  ownerOrGm(user, event.params.campaignId);
  return respond(readCatalogReport(event.params.campaignId, true));
}
