import {sessionUser} from '#lib/server/api.js';
import {bundleResponse,unchanged} from '#lib/server/bundle.js';
import {loadPersonal,personalBundle} from '#lib/server/personal.js';

/** The character's combined catalog: its sources' current syncs plus items kept from removed ones. */
export function GET(event){
  const user=sessionUser(event);
  const {row}=loadPersonal(user,event.params.characterId,'view');
  const {sha256,body}=personalBundle(row);
  if(event.url.searchParams.get('known')===sha256)return unchanged(sha256);
  return bundleResponse(event,body);
}
