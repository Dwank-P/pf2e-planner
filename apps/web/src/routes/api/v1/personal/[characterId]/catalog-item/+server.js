import {sessionUser} from '#lib/server/api.js';
import {itemResponse} from '#lib/server/item-detail.js';
import {loadPersonal,personalCatalog} from '#lib/server/personal.js';

/** Full item details from the character's sources (or kept items). */
export function GET(event){
  const user=sessionUser(event);
  const {row}=loadPersonal(user,event.params.characterId,'view');
  return itemResponse(event,personalCatalog(row).resolve);
}
