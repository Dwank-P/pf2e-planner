import {respond,throttle} from '#lib/server/api.js';
import {publicTarget,publicCharacter} from '#lib/server/public-share.js';

/** A character opened by its public link (personal or campaign): read-only, no sign-in. */
export function GET(event){
  throttle(event,'public-view',300,600);
  return respond({character:publicCharacter(publicTarget(event.params.token))});
}
