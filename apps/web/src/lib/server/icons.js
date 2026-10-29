import {createHash} from 'node:crypto';
import {db,unix} from './db.js';

/**
 * Item icons. Each world (integration) keeps its own path → image list
 * (integration_icons); the images are stored once by SHA-256 (icon_blobs) and
 * shared, since most worlds use the same PF2e artwork. A member can only load
 * an icon their own world references.
 */
export const MAX_ICON_BYTES=262144;
const TYPES={webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif'};
export const iconType=path=>TYPES[String(path).split('.').pop().toLowerCase()]??null;
export const SHA256=/^[a-f0-9]{64}$/;

/** Icon paths the published catalog references. */
export function referencedIcons(integrationId){
  const pub=db().prepare('SELECT snapshot_id FROM catalog_publications WHERE integration_id=?').get(integrationId);
  if(!pub)return new Set();
  return new Set(db().prepare(`SELECT DISTINCT json_extract(item_json,'$.img') AS img FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? AND json_extract(item_json,'$.img') IS NOT NULL`)
    .all(integrationId,pub.snapshot_id).map(r=>r.img));
}
/** Delete shared images no world uses any more. */
export function dropUnusedBlobs(){
  // Images kept for personal characters (from removed sources) stay too.
  return db().prepare(`DELETE FROM icon_blobs WHERE NOT EXISTS (SELECT 1 FROM integration_icons i WHERE i.sha256=icon_blobs.sha256)
    AND NOT EXISTS (SELECT 1 FROM personal_kept_items k WHERE k.icon_sha256=icon_blobs.sha256)`).run().changes;
}
/** Drop this world's paths its catalog no longer uses; return the referenced ones it has no image for. */
export function pruneAndListMissing(integrationId){
  const wanted=referencedIcons(integrationId);
  const sql=db();
  const stored=sql.prepare('SELECT path FROM integration_icons WHERE integration_id=?').all(integrationId).map(r=>r.path);
  const drop=sql.prepare('DELETE FROM integration_icons WHERE integration_id=? AND path=?');
  for(const path of stored)if(!wanted.has(path))drop.run(integrationId,path);
  dropUnusedBlobs();
  const have=new Set(stored);
  return [...wanted].filter(path=>!have.has(path)).sort();
}
/**
 * Point paths at images the site already has (by hash, from any world). Returns
 * the paths whose image still has to be uploaded.
 */
export function linkKnown(integrationId,icons,now=unix()){
  const wanted=referencedIcons(integrationId);
  const known=db().prepare('SELECT 1 FROM icon_blobs WHERE sha256=? AND content_type=?');
  const link=db().prepare(`INSERT INTO integration_icons(integration_id,path,sha256,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(integration_id,path) DO UPDATE SET sha256=excluded.sha256,updated_at=excluded.updated_at`);
  let linked=0;
  const needed=[];
  for(const {path,sha256} of icons){
    if(!wanted.has(path)||!SHA256.test(sha256??'')||!iconType(path))continue;
    if(known.get(sha256,iconType(path))){link.run(integrationId,path,sha256,now);linked++;}
    else needed.push(path);
  }
  return {linked,needed};
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
export function storeIcon(integrationId,path,bytes,now=unix()){
  const sha256=createHash('sha256').update(bytes).digest('hex');
  db().prepare('INSERT OR IGNORE INTO icon_blobs(sha256,content_type,bytes,created_at) VALUES(?,?,?,?)')
    .run(sha256,iconType(path),bytes,now);
  db().prepare(`INSERT INTO integration_icons(integration_id,path,sha256,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(integration_id,path) DO UPDATE SET sha256=excluded.sha256,updated_at=excluded.updated_at`)
    .run(integrationId,path,sha256,now);
  return sha256;
}
export function readIcon(campaignId,path){
  return db().prepare(`SELECT b.sha256,b.content_type,b.bytes FROM integration_icons c
    JOIN icon_blobs b ON b.sha256=c.sha256
    JOIN catalog_publications p ON p.integration_id=c.integration_id
    JOIN integrations i ON i.id=c.integration_id
    WHERE i.campaign_id=? AND i.revoked_at IS NULL AND c.path=?`).get(campaignId,path);
}
