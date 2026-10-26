import {db} from '#lib/server/db.js';
import {sessionUser,requireMembership} from '#lib/server/api.js';
import {characterAccess,readDocument,mergeView,catalogFor,campaignSystem} from '#lib/server/characters.js';
import {jsonDownload} from '#lib/server/download.js';
import {familyOf} from '#lib/server/personal.js';
import {exportPayload} from '#lib/server/transfer.js';

/** Download a campaign character as a file another planner can import. */
export function GET(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=? AND campaign_id=?').get(event.params.characterId,event.params.campaignId);
  characterAccess(user,row,'view');
  const stored=readDocument(row);
  const catalog=catalogFor(row.campaign_id);
  return jsonDownload(exportPayload({name:row.name,level:row.level,system:familyOf(campaignSystem(row.campaign_id)),
    variants:catalog?.variants??{},document:stored.doc??mergeView(row.campaign_id,null,stored.view),
    resolve:catalog?.resolve??(()=>null)}),row.name);
}
