import {throttle} from '#lib/server/api.js';
import {bundleResponse,unchanged} from '#lib/server/bundle.js';
import {publicTarget,publicBundle} from '#lib/server/public-share.js';

/** Only the items the build uses (and what they point at), not the sources' whole catalogs. */
export function GET(event){
  throttle(event,'public-view',300,600);
  const {sha256,body}=publicBundle(publicTarget(event.params.token));
  if(event.url.searchParams.get('known')===sha256)return unchanged(sha256);
  return bundleResponse(event,body);
}
