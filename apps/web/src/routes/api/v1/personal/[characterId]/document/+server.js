import {db,unix} from '#lib/server/db.js';
import {sessionUser,input,problem,respond} from '#lib/server/api.js';
import {readDocument,validateDocument,validateDnd5eDocument} from '#lib/server/characters.js';
import {loadPersonal,toPersonal,personalCatalog} from '#lib/server/personal.js';

/** Save a personal character's whole document (same shapes as campaign characters). */
export async function PUT(event){
  const user=sessionUser(event);
  const {row,rights}=loadPersonal(user,event.params.characterId,'edit');
  const body=await input(event.request,1000000);
  const name=typeof body.name==='string'?body.name.trim():'';
  if(!name||name.length>80)problem(400,'character_name_required');
  if(!Number.isInteger(body.level)||body.level<1||body.level>20)problem(400,'level_1_to_20_required');
  if(!Number.isInteger(body.revision)||body.revision!==row.revision)problem(409,'character_changed_elsewhere_refresh_first');
  const current=readDocument({build_json:row.build_json}).doc;
  const catalog=personalCatalog(row);
  const doc=row.system==='dnd5e'?validateDnd5eDocument(null,current,body.document,{catalog})
    :validateDocument(null,current,body.document,{catalog});
  const result=db().prepare(`UPDATE personal_characters SET name=?,level=?,build_json=?,revision=revision+1,updated_at=?
    WHERE id=? AND revision=?`).run(name,body.level,JSON.stringify(doc),unix(),row.id,row.revision);
  if(result.changes!==1)problem(409,'character_changed_elsewhere_refresh_first');
  return respond({character:toPersonal(db().prepare('SELECT * FROM personal_characters WHERE id=?').get(row.id),{rights})});
}
