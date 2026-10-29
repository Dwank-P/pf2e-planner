import {sessionUser,requireMembership,problem} from '#lib/server/api.js';
import {readIcon} from '#lib/server/icons.js';
/** An item icon from this campaign's world, cached privately by the browser. */
export function GET(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const icon=readIcon(event.params.campaignId,event.params.path);
  if(!icon)problem(404,'icon_not_found');
  const etag='"'+icon.sha256+'"';
  const headers={'content-type':icon.content_type,'cache-control':'private, max-age=604800',etag,
    'x-content-type-options':'nosniff',
    // SVGs opened directly can't run scripts or load anything.
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"};
  if(event.request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
  return new Response(icon.bytes,{headers});
}
