import {sessionUser,input,respond} from '#lib/server/api.js';
import {loadPersonal} from '#lib/server/personal.js';
import {readPortrait,setPortrait,PORTRAIT_MAX_BYTES} from '#lib/server/portraits.js';

/** Set ({image: data URL}) or remove a personal character's picture; the previous one is deleted. */
export async function PUT(event){
  const {row}=loadPersonal(sessionUser(event),event.params.characterId,'edit');
  const body=await input(event.request,Math.ceil(PORTRAIT_MAX_BYTES*1.4)+1024);
  return respond({portrait:setPortrait('personal_characters',row.id,readPortrait(body.image))});
}
export function DELETE(event){
  const {row}=loadPersonal(sessionUser(event),event.params.characterId,'edit');
  return respond({portrait:setPortrait('personal_characters',row.id,null)});
}
