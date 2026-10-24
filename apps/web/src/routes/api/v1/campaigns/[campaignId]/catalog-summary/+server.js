import { sessionUser, requireMembership, respond } from '#lib/server/api.js';
import { readCatalogReport } from '#lib/server/catalog-report.js';

export function GET(event) {
  const user = sessionUser(event);
  requireMembership(user, event.params.campaignId);
  return respond(readCatalogReport(event.params.campaignId));
}
