import {gzipSync} from 'node:zlib';
import {db} from '#lib/server/db.js';
import {readPublished} from '#lib/server/catalog-import.js';
import {sessionUser,requireMembership,problem} from '#lib/server/api.js';

// Reference-only types are looked up individually through catalog-item.
// Actions stay: commander tactics are action Items.
const EXCLUDED_TYPES=['condition','effect'];
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
  if(event.url.searchParams.get('known')===pub.sha256)
    return json({unchanged:true,sha256:pub.sha256});
  const key=pub.integration_id+':'+pub.snapshot_id;
  let body=cache.get(key);
  if(!body){
    const rows=db().prepare(`SELECT item_json FROM catalog_entries
      WHERE integration_id=? AND snapshot_id=? AND type NOT IN (${EXCLUDED_TYPES.map(()=>'?').join(',')})`)
      .all(pub.integration_id,pub.snapshot_id,...EXCLUDED_TYPES);
    const items=rows.map(row=>{
      const {description,...item}=JSON.parse(row.item_json);
      return item;
    });
    let variants={},sources={};
    try{variants=JSON.parse(pub.variants_json||'{}');sources=JSON.parse(pub.sources_json||'{}');}catch{}
    body=Buffer.from(JSON.stringify({sha256:pub.sha256,snapshotId:pub.snapshot_id,
      updatedAt:pub.updated_at,variants,sources,items}));
    // One cached snapshot per campaign integration.
    for(const old of cache.keys())if(old.startsWith(pub.integration_id+':'))cache.delete(old);
    cache.set(key,body);
  }
  const gzip=/\bgzip\b/.test(event.request.headers.get('accept-encoding')||'');
  return new Response(gzip?gzipSync(body):body,{headers:{
    'content-type':'application/json; charset=utf-8',
    ...(gzip?{'content-encoding':'gzip'}:{}),
    vary:'accept-encoding'
  }});
}
function json(data){
  return new Response(JSON.stringify(data),{headers:{'content-type':'application/json; charset=utf-8'}});
}
