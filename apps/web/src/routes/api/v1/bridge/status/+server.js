import { getBuildInfo } from '#lib/server/version.js';
import { respond } from '#lib/server/api.js';

/** Public, non-secret reachability and API compatibility check for GM browsers. */
export function GET() {
  return respond({
    status: 'ok',
    service: 'pf2e-planner-web',
    ...getBuildInfo()
  });
}
