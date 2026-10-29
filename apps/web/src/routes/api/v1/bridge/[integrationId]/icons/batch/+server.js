import {unix} from '#lib/server/db.js';
import {input,bridgeAuth,respond,problem} from '#lib/server/api.js';
import {referencedIcons,iconType,looksLike,storeIcon,MAX_ICON_BYTES} from '#lib/server/icons.js';
/** Up to ~400 KB (and 400) of icons per request, each for a path the published catalog references. */
export async function POST(event){
  bridgeAuth(event,event.params.integrationId);
  const b=await input(event.request,480000);
  // Bridges up to 0.26.1 fill batches by size only, so small icons can number a few hundred.
  if(!Array.isArray(b.icons)||b.icons.length<1||b.icons.length>400)problem(400,'invalid_icon_batch');
  const wanted=referencedIcons(event.params.integrationId);
  const now=unix();
  let stored=0;
  const rejected=[];
  for(const icon of b.icons){
    const path=icon?.path;
    if(typeof path!=='string'||!wanted.has(path)||typeof icon.data!=='string'){rejected.push(String(path).slice(0,300));continue;}
    const bytes=Buffer.from(icon.data,'base64');
    const type=iconType(path);
    if(!type||!bytes.length||bytes.length>MAX_ICON_BYTES||!looksLike(type,bytes)){rejected.push(path);continue;}
    storeIcon(event.params.integrationId,path,bytes,now);
    stored++;
  }
  return respond({stored,rejected},201);
}
