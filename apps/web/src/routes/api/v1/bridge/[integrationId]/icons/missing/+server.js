import {bridgeAuth,respond} from '#lib/server/api.js';
import {pruneAndListMissing} from '#lib/server/icons.js';
/** Icon paths the world's catalog uses that the site doesn't have yet. */
export function POST(event){
  bridgeAuth(event,event.params.integrationId);
  return respond({missing:pruneAndListMissing(event.params.integrationId)});
}
