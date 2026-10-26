import {throttle} from '#lib/server/api.js';
import {itemResponse} from '#lib/server/item-detail.js';
import {publicRow,personalCatalog,neededItems} from '#lib/server/personal.js';

/** Details of an item in the build; anything else (e.g. a feat linked from its text) is refused. */
export function GET(event){
  throttle(event,'public-view',300,600);
  const row=publicRow(event.params.token);
  const catalog=personalCatalog(row);
  const needed=neededItems(row,catalog.resolve);
  return itemResponse(event,uuid=>needed.get(uuid)??null,new Set(needed.keys()));
}
