import {respond,throttle} from '#lib/server/api.js';
import {usableLink} from '#lib/server/invite-links.js';
/** What an invite link opens (public): the campaign's name and when the link expires. */
export function GET(event){
  throttle(event,'invite-link-view',60,600);
  const link=usableLink(event.params.code);
  return respond({campaign:{title:link.campaign_title},expiresAt:link.expires_at});
}
