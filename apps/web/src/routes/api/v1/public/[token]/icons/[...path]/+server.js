import {throttle} from '#lib/server/api.js';
import {iconResponse} from '#lib/server/item-detail.js';
import {publicRow,personalIcon} from '#lib/server/personal.js';

export function GET(event){
  throttle(event,'public-icons',2000,600);
  const row=publicRow(event.params.token);
  return iconResponse(event,personalIcon(row,event.params.path,{onlyNeeded:true}));
}
