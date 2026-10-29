import {sessionUser} from '#lib/server/api.js';
import {iconResponse} from '#lib/server/item-detail.js';
import {loadPersonal,personalIcon} from '#lib/server/personal.js';

export function GET(event){
  const user=sessionUser(event);
  const {row}=loadPersonal(user,event.params.characterId,'view');
  return iconResponse(event,personalIcon(row,event.params.path));
}
