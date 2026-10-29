import {db,unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond} from '#lib/server/api.js';
import {characterAccess,readDocument,validateDocument,toCharacter,campaignSystem,validateDnd5eDocument} from '#lib/server/characters.js';

/**
 * Save a whole character document (Leveler creation + plan, planner extras)
 * from the Character Wizard and Level Planner. Optimistic concurrency by revision.
 */
export async function PUT(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=? AND campaign_id=?')
    .get(event.params.characterId,event.params.campaignId);
  characterAccess(user,row,'edit');
  const body=await input(event.request,1000000);
  const name=typeof body.name==='string'?body.name.trim():'';
  if(!name||name.length>80)problem(400,'character_name_required');
  if(!Number.isInteger(body.level)||body.level<1||body.level>20)problem(400,'level_1_to_20_required');
  if(!Number.isInteger(body.revision)||body.revision!==row.revision)
    problem(409,'character_changed_elsewhere_refresh_first');
  const current=readDocument(row).doc;
  const doc=campaignSystem(row.campaign_id)==='dnd5e'
    ?validateDnd5eDocument(row.campaign_id,current,body.document)
    :validateDocument(row.campaign_id,current,body.document);
  const result=db().prepare(`UPDATE character_builds
    SET name=?,level=?,build_json=?,revision=revision+1,updated_at=?
    WHERE id=? AND revision=?`)
    .run(name,body.level,JSON.stringify(doc),unix(),row.id,row.revision);
  if(result.changes!==1)problem(409,'character_changed_elsewhere_refresh_first');
  return respond({character:toCharacter(db().prepare('SELECT * FROM character_builds WHERE id=?').get(row.id))});
}
