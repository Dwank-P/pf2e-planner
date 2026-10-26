import {throttle} from '#lib/server/api.js';
import {iconResponse} from '#lib/server/item-detail.js';
import {publicTarget,publicIcon} from '#lib/server/public-share.js';

export function GET(event){
  throttle(event,'public-icons',2000,600);
  return iconResponse(event,publicIcon(publicTarget(event.params.token),event.params.path));
}
