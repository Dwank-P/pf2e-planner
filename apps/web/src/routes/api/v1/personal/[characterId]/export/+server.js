import {sessionUser} from '#lib/server/api.js';
import {jsonDownload} from '#lib/server/download.js';
import {loadPersonal,personalCatalog} from '#lib/server/personal.js';
import {exportPayload} from '#lib/server/transfer.js';

/** Download the character as a file another planner can import. */
export function GET(event){
  const user=sessionUser(event);
  const {row}=loadPersonal(user,event.params.characterId,'view');
  const catalog=personalCatalog(row);
  return jsonDownload(exportPayload({name:row.name,level:row.level,system:row.system,variants:JSON.parse(row.variants_json||'{}'),
    document:JSON.parse(row.build_json),resolve:catalog.resolve}),row.name);
}
