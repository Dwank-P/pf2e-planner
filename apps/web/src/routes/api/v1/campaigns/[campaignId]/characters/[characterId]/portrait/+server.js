import {db} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,respond} from '#lib/server/api.js';
import {characterAccess} from '#lib/server/characters.js';
import {readPortrait,setPortrait,PORTRAIT_MAX_BYTES} from '#lib/server/portraits.js';

/** Set ({image: data URL}) or remove a character's picture; the previous one is deleted. */
function load(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=? AND campaign_id=?').get(event.params.characterId,event.params.campaignId);
  characterAccess(user,row,'edit');
  return row;
}
export async function PUT(event){
  const row=load(event);
  const body=await input(event.request,Math.ceil(PORTRAIT_MAX_BYTES*1.4)+1024);
  return respond({portrait:setPortrait('character_builds',row.id,readPortrait(body.image))});
}
export function DELETE(event){
  const row=load(event);
  return respond({portrait:setPortrait('character_builds',row.id,null)});
}
