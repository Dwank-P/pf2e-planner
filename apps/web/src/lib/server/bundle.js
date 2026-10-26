import {gzipSync} from 'node:zlib';

/**
 * Catalog bundles: a whole catalog in one compressed response, without rules text, for
 * browser-side search. Shared by campaign catalogs and personal characters' combined catalogs.
 */
// Reference-only types are looked up individually through catalog-item.
// Actions stay: commander tactics are action Items.
export const EXCLUDED_TYPES=['condition','effect'];
// Bumped when the bundle's derived fields change, so cached copies refresh.
export const BUNDLE_FORMAT='g1';
// Feat text that can grant a choice (formulas, spells, items): Leveler's feat-grants
// reads the description, so the bundle keeps it for these feats only.
const GRANT_HINT=/\bformulas?\b|\bspellbook\b|\brepertoire\b|\bof your choice\b|\balchemical crafting\b|\b(?:gain|gains|receive|obtain|choose|select)\s+(?:one|two|three|four|five|six|seven|eight|nine|[1-9])\b/;
const plainText=html=>String(html??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().toLowerCase();

/** A stored catalog item as the bundle carries it. */
export function bundleItem(itemJson){
  const {description,...item}=typeof itemJson==='string'?JSON.parse(itemJson):itemJson;
  if(item.type==='feat'){
    const text=plainText(description);
    if(GRANT_HINT.test(text))item.grantText=text.slice(0,4000);
  }
  return item;
}
export function bundleResponse(event,body){
  const gzip=/\bgzip\b/.test(event.request.headers.get('accept-encoding')||'');
  return new Response(gzip?gzipSync(body):body,{headers:{
    'content-type':'application/json; charset=utf-8',
    ...(gzip?{'content-encoding':'gzip'}:{}),
    vary:'accept-encoding'
  }});
}
export function unchanged(sha256){
  return new Response(JSON.stringify({unchanged:true,sha256}),{headers:{'content-type':'application/json; charset=utf-8'}});
}
