import {db} from '#lib/server/db.js';
import {sessionUser,respond} from '#lib/server/api.js';
import {loadPersonal,toPersonal,listSources} from '#lib/server/personal.js';

export function GET(event){
  const user=sessionUser(event);
  const {row,rights}=loadPersonal(user,event.params.characterId,'view');
  const kept=db().prepare('SELECT COUNT(*) AS n FROM personal_kept_items WHERE character_id=?').get(row.id).n;
  return respond({character:{...toPersonal(row,{rights}),sources:listSources(row),keptItems:kept}});
}
export function DELETE(event){
  const user=sessionUser(event);
  const {row}=loadPersonal(user,event.params.characterId,'manage');
  db().prepare('DELETE FROM personal_characters WHERE id=?').run(row.id);
  return respond({deleted:true});
}
