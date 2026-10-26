import {throttle} from '#lib/server/api.js';
import {itemResponse} from '#lib/server/item-detail.js';
import {publicTarget,publicItems} from '#lib/server/public-share.js';

/** Details of an item in the build; anything else (e.g. a feat linked from its text) is refused. */
export function GET(event){
  throttle(event,'public-view',300,600);
  const needed=publicItems(publicTarget(event.params.token));
  return itemResponse(event,uuid=>needed.get(uuid)??null,new Set(needed.keys()));
}
