import {db,unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond} from '#lib/server/api.js';
import {characterAccess,validateBuild,validateReferences,readDocument,mergeView,toCharacter}
  from '#lib/server/characters.js';

function load(event) {
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=? AND campaign_id=?')
    .get(event.params.characterId,event.params.campaignId);
  characterAccess(user,row);
  return {row,user};
}
export function GET(event) {
  const {row}=load(event);
  return respond({character:toCharacter(row)});
}
export async function PATCH(event) {
  const {row}=load(event),body=await input(event.request,22000);
  const name=typeof body.name==='string'?body.name.trim():'';
  if(!name||name.length>80)problem(400,'character_name_required');
  if(!Number.isInteger(body.level)||body.level<1||body.level>20)problem(400,'level_1_to_20_required');
  if(!Number.isInteger(body.revision)||body.revision!==row.revision)
    problem(409,'character_changed_elsewhere_refresh_first');
  const view=validateBuild(body.build);
  const current=readDocument(row);
  validateReferences(row.campaign_id,view,current.view);
  // Stored as PF2e Leveler creation/plan documents; see lib/leveler-format.js.
  const build=mergeView(row.campaign_id,current.doc,view);
  const result=db().prepare(`UPDATE character_builds
    SET name=?,level=?,build_json=?,revision=revision+1,updated_at=?
    WHERE id=? AND revision=?`)
    .run(name,body.level,JSON.stringify(build),unix(),row.id,row.revision);
  if(result.changes!==1)problem(409,'character_changed_elsewhere_refresh_first');
  return respond({character:toCharacter(db().prepare('SELECT * FROM character_builds WHERE id=?').get(row.id))});
}
export function DELETE(event) {
  const {row}=load(event);
  db().prepare('DELETE FROM character_builds WHERE id=?').run(row.id);
  return respond({deleted:true});
}
