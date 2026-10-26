import {respond,throttle} from '#lib/server/api.js';
import {publicRow,toPersonal} from '#lib/server/personal.js';

/** A personal character opened by its public link: read-only, no sign-in. */
export function GET(event){
  throttle(event,'public-view',300,600);
  const row=publicRow(event.params.token);
  const character=toPersonal(row,{publicView:true});
  return respond({character:{...character,ownerUserId:undefined,access:{edit:false,manage:false},publicView:true}});
}
