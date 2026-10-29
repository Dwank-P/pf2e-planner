import {createHash} from 'node:crypto';
import {db,HIDDEN_PACK,hiddenKey} from '#lib/server/db.js';
import {readPublished} from '#lib/server/catalog-import.js';
import {sessionUser,requireMembership,problem} from '#lib/server/api.js';
import {EXCLUDED_TYPES,BUNDLE_FORMAT,bundleItem,bundleResponse,unchanged} from '#lib/server/bundle.js';

const cache=new Map();

/**
 * The published catalog for a campaign in one compressed response, without rules
 * text, for browser-side search. Clients pass ?known=<sha256> and receive
 * {unchanged:true} when their cached copy is current.
 */
export function GET(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const pub=readPublished(event.params.campaignId);
  if(!pub)problem(404,'catalog_not_published');
  // Hiding or showing packs (campaign settings) changes the bundle.
  const hidden=hiddenKey(pub.integration_id);
  const sha256=pub.sha256+':'+BUNDLE_FORMAT+(hidden?':'+createHash('sha256').update(hidden).digest('hex').slice(0,16):'');
  if(event.url.searchParams.get('known')===sha256)return unchanged(sha256);
  const key=pub.integration_id+':'+pub.snapshot_id+':'+hidden;
  let body=cache.get(key);
  if(!body){
    const rows=db().prepare(`SELECT item_json,${HIDDEN_PACK} AS hidden FROM catalog_entries
      WHERE integration_id=? AND snapshot_id=? AND type NOT IN (${EXCLUDED_TYPES.map(()=>'?').join(',')})`)
      .all(pub.integration_id,pub.snapshot_id,...EXCLUDED_TYPES);
    let variants={},sources={};
    try{variants=JSON.parse(pub.variants_json||'{}');sources=JSON.parse(pub.sources_json||'{}');}catch{}
    body=Buffer.from(JSON.stringify({sha256,snapshotId:pub.snapshot_id,
      updatedAt:pub.updated_at,variants,sources,items:rows.map(r=>r.hidden?{...bundleItem(r.item_json),hidden:true}:bundleItem(r.item_json))}));
    // One cached snapshot per campaign integration.
    for(const old of cache.keys())if(old.startsWith(pub.integration_id+':'))cache.delete(old);
    cache.set(key,body);
  }
  return bundleResponse(event,body);
}
