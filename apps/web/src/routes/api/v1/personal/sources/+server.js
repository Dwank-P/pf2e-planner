import {sessionUser,problem,respond} from '#lib/server/api.js';
import {availableSources} from '#lib/server/personal.js';

/** Packages the signed-in player can use, from worlds that share compendiums: ?system=pf2e|dnd5e. */
export function GET(event){
  const user=sessionUser(event);
  const system=event.url.searchParams.get('system');
  if(!['pf2e','dnd5e'].includes(system))problem(400,'invalid_rules_system');
  return respond({sources:availableSources(user.id,system)});
}
