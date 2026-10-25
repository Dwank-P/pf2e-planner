import {input,bridgeAuth,respond,problem} from '#lib/server/api.js';
import {linkKnown} from '#lib/server/icons.js';
/**
 * The Bridge sends {icons:[{path,sha256}]} for icons this world lacks; images the
 * site already holds (from any world) are linked without uploading. Returns the
 * paths whose image must still be uploaded.
 */
export async function POST(event){
  bridgeAuth(event,event.params.integrationId);
  const b=await input(event.request,400000);
  if(!Array.isArray(b.icons)||b.icons.length>2000)problem(400,'invalid_icon_batch');
  return respond(linkKnown(event.params.integrationId,b.icons.filter(i=>typeof i?.path==='string')));
}
