import {sanitizeDescription} from './rich-text.js';
import {problem,respond} from './api.js';

const UUID=/^Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+$/;
/** catalog-item for a personal character or public link: by uuid, through `resolve`. */
export function itemResponse(event,resolve,allowed=null){
  const uuid=event.url.searchParams.get('uuid')||'';
  if(!UUID.test(uuid))problem(400,'invalid_compendium_uuid');
  if(allowed&&!allowed.has(uuid))problem(404,'item_not_synchronized');
  const found=resolve(uuid);
  if(!found)problem(404,'item_not_synchronized');
  const item={...found,description:sanitizeDescription(found.description)};
  return respond({item});
}
/** Serve icon bytes the way campaign icons are served. */
export function iconResponse(event,icon,cache='private'){
  if(!icon)problem(404,'icon_not_found');
  const etag='"'+icon.sha256+'"';
  const headers={'content-type':icon.content_type,'cache-control':cache+', max-age=604800',etag,
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"};
  if(event.request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
  return new Response(icon.bytes,{headers});
}
