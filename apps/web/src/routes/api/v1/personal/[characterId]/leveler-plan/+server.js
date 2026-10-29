import {db,unix} from '#lib/server/db.js';
import {sessionUser,input,problem,respond} from '#lib/server/api.js';
import {readDocument,validateDocument} from '#lib/server/characters.js';
import {loadPersonal,personalCatalog,toPersonal,packageOf} from '#lib/server/personal.js';
import {readLevelerPlan,transplant} from '#lib/server/transfer.js';

/** Replace a personal character's level plan with a PF2e Leveler plan file ({plan, revision}). */
export async function PUT(event){
  const user=sessionUser(event);
  const {row,rights}=loadPersonal(user,event.params.characterId,'edit');
  if(row.system==='dnd5e')problem(400,'leveler_plans_are_for_pf2e');
  const body=await input(event.request,600000);
  if(!Number.isInteger(body.revision)||body.revision!==row.revision)problem(409,'character_changed_elsewhere_refresh_first');
  const catalog=personalCatalog(row);
  const find=db().prepare(`SELECT uuid FROM catalog_entries WHERE integration_id=? AND snapshot_id=? AND name=? COLLATE NOCASE
    AND type NOT IN ('condition','effect','action')`);
  const byName=(type,name)=>{
    for(const [pkg,w] of catalog.sources)for(const hit of find.all(w.integrationId,w.snapshotId,name))if(packageOf(hit.uuid)===pkg)return hit.uuid;
    return null;
  };
  const source=readLevelerPlan(body.plan);
  const doc=readDocument({build_json:row.build_json}).doc;
  const {doc:moved,report}=transplant({system:'pf2e',document:{leveler:{plan:source.plan},planner:{}},nameOf:source.nameOf},
    {has:catalog.has,byName,variants:null});
  const valid=validateDocument(null,doc,{...doc,leveler:{...doc.leveler,plan:moved.leveler.plan}},{catalog});
  const result=db().prepare('UPDATE personal_characters SET build_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
    .run(JSON.stringify(valid),unix(),row.id,row.revision);
  if(result.changes!==1)problem(409,'character_changed_elsewhere_refresh_first');
  return respond({character:toPersonal(db().prepare('SELECT * FROM personal_characters WHERE id=?').get(row.id),{rights}),report});
}
