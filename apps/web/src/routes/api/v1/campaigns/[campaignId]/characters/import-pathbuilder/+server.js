import {randomUUID} from 'node:crypto';
import {db,unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond,throttle} from '#lib/server/api.js';
import {validateDocument,toCharacter,campaignSystem} from '#lib/server/characters.js';
import {campaignImportCatalog} from '#lib/server/import-catalog.js';
import {importPathbuilder,PATHBUILDER_ID,pathbuilderUrl} from '#lib/builder/pathbuilder.js';

const MAX_BYTES=2000000;

/** Fetch a Pathbuilder export by its JSON id (Pathbuilder → Export → Export JSON). */
async function fetchPathbuilder(fetch,id){
  let response;
  try{
    response=await fetch(pathbuilderUrl(id),{signal:AbortSignal.timeout(10000),redirect:'follow',
      headers:{accept:'application/json'}});
  }catch{problem(502,'pathbuilder_unreachable');}
  const text=await response.text();
  if(text.length>MAX_BYTES)problem(413,'pathbuilder_invalid_json');
  let json=null;
  try{json=JSON.parse(text);}catch{}
  // Unknown ids come back as HTTP 400 {"success":false,"error":"Invalid ID."}.
  if(json?.success===false||response.status===404)problem(404,'pathbuilder_not_found');
  // Pathbuilder's Cloudflare may challenge server requests; the browser fetch is the main path.
  if(!json&&response.status===403)problem(502,'pathbuilder_blocked');
  if(!response.ok)problem(502,'pathbuilder_unreachable');
  if(!json)problem(502,'pathbuilder_invalid_json');
  return json;
}

/**
 * Build a new character from a Pathbuilder export: {pathbuilderId} is fetched from
 * pathbuilder2e.com, or {json} is a pasted export. Names are matched against the
 * campaign's synced compendiums; the response reports what couldn't be matched.
 */
export async function POST(event){
  const user=sessionUser(event),campaignId=event.params.campaignId;
  requireMembership(user,campaignId);
  if(campaignSystem(campaignId)==='dnd5e')problem(400,'pathbuilder_is_for_pf2e_campaigns');
  throttle(event,'pathbuilder-import',20,600);
  const body=await input(event.request,MAX_BYTES);
  let json;
  if(body.json!==undefined){
    json=typeof body.json==='string'?(()=>{try{return JSON.parse(body.json);}catch{problem(400,'pathbuilder_invalid_json');}})():body.json;
  }else{
    const id=String(body.pathbuilderId??'').trim();
    if(!PATHBUILDER_ID.test(id))problem(400,'pathbuilder_id_invalid');
    json=await fetchPathbuilder(event.fetch,id);
  }
  if(json?.success===false)problem(404,'pathbuilder_not_found');
  const count=db().prepare('SELECT COUNT(*) AS n FROM character_builds WHERE campaign_id=? AND owner_user_id=?')
    .get(campaignId,user.id).n;
  if(count>=50)problem(409,'maximum_50_characters_per_player');
  const loaded=campaignImportCatalog(campaignId);
  if(!loaded)problem(409,'sync_compendiums_before_selecting_items');
  let result;
  try{result=importPathbuilder(json,loaded.catalog,loaded.variants);}
  catch(error){if(error?.message==='pathbuilder_invalid_json')problem(400,'pathbuilder_invalid_json');throw error;}
  const doc=validateDocument(campaignId,null,{leveler:{creation:result.creation,plan:result.plan},planner:result.planner});
  const id=randomUUID(),now=unix();
  db().prepare(`INSERT INTO character_builds
    (id,campaign_id,owner_user_id,name,level,build_json,revision,created_at,updated_at)
    VALUES(?,?,?,?,?,?,1,?,?)`).run(id,campaignId,user.id,result.name,result.level,JSON.stringify(doc),now,now);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=?').get(id);
  return respond({character:toCharacter(row,{includeLeveler:false}),report:result.report},201);
}
