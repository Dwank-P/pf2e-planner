import {transaction} from '#lib/server/db.js';
import {input,respond,sessionUser,throttle} from '#lib/server/api.js';
import {usableLink,joinWithLink} from '#lib/server/invite-links.js';
/** A signed-in user joins the link's campaign as a player. */
export async function POST(event){
  const user=sessionUser(event);
  throttle(event,'invite-link-accept',20,600);
  await input(event.request);
  const link=usableLink(event.params.code);
  return respond(transaction(sql=>joinWithLink(sql,link,user.id)));
}
