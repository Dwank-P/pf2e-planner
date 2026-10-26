import {throttle} from '#lib/server/api.js';
import {publicTarget,publicExport} from '#lib/server/public-share.js';

/**
 * The build behind a public link, in the planner export format. Another planner's page fetches
 * this from the browser to import the character, so any origin may read it.
 */
export function GET(event){
  throttle(event,'public-export',60,600);
  return new Response(JSON.stringify(publicExport(publicTarget(event.params.token))),{headers:{
    'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'}});
}
