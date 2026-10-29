import {sanitizeDescription} from './rich-text.js';
import {problem,respond} from './api.js';

// Ids, or names: PF2e rules may reference an item by name ("…feats-srd.Item.Shield Block").
const UUID=/^Compendium\.[\w-]+\.[\w-]+\.Item\.[^\x00-\x1f]{1,200}$/;
const NAMED=/^Compendium\.([\w-]+\.[\w-]+)\.Item\.(.+)$/;
/** A catalog row by pack and name, for a named reference (null for ids or no match). */
export function rowByName(sql,integrationId,snapshotId,uuid){
  const m=NAMED.exec(uuid);
  if(!m||/^[\w-]{16}$/.test(m[2]))return null;
  return sql.prepare(`SELECT item_json FROM catalog_entries WHERE integration_id=? AND snapshot_id=? AND pack=?
    AND name=? COLLATE NOCASE LIMIT 1`).get(integrationId,snapshotId,m[1],m[2])??null;
}
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
