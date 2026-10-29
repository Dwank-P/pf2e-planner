import {db,unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond} from '#lib/server/api.js';
import {characterAccess,readDocument,mergeView,catalogFor,validateDocument,toCharacter} from '#lib/server/characters.js';
import {readLevelerPlan,transplant,campaignByName} from '#lib/server/transfer.js';

/**
 * Replace a character's level plan with a PF2e Leveler plan file ({plan, revision}). Creation
 * choices are kept; items this world doesn't have are left out and reported.
 */
export async function PUT(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=? AND campaign_id=?').get(event.params.characterId,event.params.campaignId);
  characterAccess(user,row,'edit');
  const body=await input(event.request,600000);
  if(!Number.isInteger(body.revision)||body.revision!==row.revision)problem(409,'character_changed_elsewhere_refresh_first');
  const stored=readDocument(row);
  if(stored.dnd5e)problem(400,'leveler_plans_are_for_pf2e');
  const catalog=catalogFor(row.campaign_id);
  if(!catalog)problem(409,'sync_compendiums_before_selecting_items');
  const source=readLevelerPlan(body.plan);
  const doc=stored.doc??mergeView(row.campaign_id,null,stored.view);
  const {doc:moved,report}=transplant({system:'pf2e',document:{leveler:{plan:source.plan},planner:{}},nameOf:source.nameOf},
    {has:catalog.has,byName:campaignByName(catalog.integrationId),variants:null});
  const valid=validateDocument(row.campaign_id,doc,{...doc,leveler:{...doc.leveler,plan:moved.leveler.plan}});
  const result=db().prepare('UPDATE character_builds SET build_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
    .run(JSON.stringify(valid),unix(),row.id,row.revision);
  if(result.changes!==1)problem(409,'character_changed_elsewhere_refresh_first');
  return respond({character:toCharacter(db().prepare('SELECT * FROM character_builds WHERE id=?').get(row.id)),report});
}
