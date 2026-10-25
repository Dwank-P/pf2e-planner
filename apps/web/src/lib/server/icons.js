import {createHash} from 'node:crypto';
import {db} from './db.js';

/**
 * Item icons, stored per world (integration) and served to its campaign's members.
 * Only paths referenced by the world's published catalog are accepted or kept.
 */
export const MAX_ICON_BYTES=262144;
const TYPES={webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif'};
export const iconType=path=>TYPES[String(path).split('.').pop().toLowerCase()]??null;

/** Icon paths the published catalog references. */
export function referencedIcons(integrationId){
  const pub=db().prepare('SELECT snapshot_id FROM catalog_publications WHERE integration_id=?').get(integrationId);
  if(!pub)return new Set();
  return new Set(db().prepare(`SELECT DISTINCT json_extract(item_json,'$.img') AS img FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? AND json_extract(item_json,'$.img') IS NOT NULL`)
    .all(integrationId,pub.snapshot_id).map(r=>r.img));
}
/** Drop icons the catalog no longer uses; return the referenced ones still missing. */
export function pruneAndListMissing(integrationId){
  const wanted=referencedIcons(integrationId);
  const sql=db();
  const stored=sql.prepare('SELECT path FROM catalog_icons WHERE integration_id=?').all(integrationId).map(r=>r.path);
  const drop=sql.prepare('DELETE FROM catalog_icons WHERE integration_id=? AND path=?');
  for(const path of stored)if(!wanted.has(path))drop.run(integrationId,path);
  const have=new Set(stored);
  return [...wanted].filter(path=>!have.has(path)).sort();
}
/** Checks the bytes are the image type the path claims (SVG is served sandboxed). */
export function looksLike(type,bytes){
  const head=bytes.subarray(0,16);
  const ascii=head.toString('latin1');
  switch(type){
    case 'image/png':return head[0]===0x89&&ascii.slice(1,4)==='PNG';
    case 'image/jpeg':return head[0]===0xff&&head[1]===0xd8;
    case 'image/gif':return ascii.startsWith('GIF8');
    case 'image/webp':return ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP';
    case 'image/avif':return ascii.slice(4,8)==='ftyp';
    case 'image/svg+xml':return /<svg[\s>]/i.test(bytes.subarray(0,4096).toString('utf8'));
    default:return false;
  }
}
export function storeIcon(integrationId,path,bytes,now){
  const sha256=createHash('sha256').update(bytes).digest('hex');
  db().prepare(`INSERT INTO catalog_icons(integration_id,path,sha256,content_type,bytes,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(integration_id,path) DO UPDATE SET sha256=excluded.sha256,content_type=excluded.content_type,
    bytes=excluded.bytes,updated_at=excluded.updated_at`).run(integrationId,path,sha256,iconType(path),bytes,now);
}
export function readIcon(campaignId,path){
  return db().prepare(`SELECT c.sha256,c.content_type,c.bytes FROM catalog_icons c
    JOIN catalog_publications p ON p.integration_id=c.integration_id
    JOIN integrations i ON i.id=c.integration_id
    WHERE i.campaign_id=? AND i.revoked_at IS NULL AND c.path=?`).get(campaignId,path);
}
