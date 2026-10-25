import {db,transaction} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond} from '#lib/server/api.js';
import {characterAccess,characterSharing,VISIBILITY} from '#lib/server/characters.js';

/**
 * Who can see or edit a character. Only its owner, the campaign's GMs and the
 * server owner change this; GMs always keep access whatever is chosen.
 * Body: {visibility, shares:[{userId, access:'view'|'edit'}]} (shares for 'custom').
 */
export async function PUT(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=? AND campaign_id=?')
    .get(event.params.characterId,event.params.campaignId);
  characterAccess(user,row,'manage');
  const body=await input(event.request,32000);
  if(!VISIBILITY.includes(body.visibility))problem(400,'invalid_sharing');
  const shares=body.visibility==='custom'?(Array.isArray(body.shares)?body.shares:[]):[];
  if(shares.length>100)problem(400,'invalid_sharing');
  const members=new Set(db().prepare('SELECT user_id FROM memberships WHERE campaign_id=?')
    .all(row.campaign_id).map(m=>m.user_id));
  const clean=new Map();
  for(const share of shares){
    if(typeof share?.userId!=='string'||!members.has(share.userId)||!['view','edit'].includes(share.access))
      problem(400,'invalid_sharing');
    if(share.userId!==row.owner_user_id)clean.set(share.userId,share.access);
  }
  transaction(sql=>{
    sql.prepare('UPDATE character_builds SET visibility=? WHERE id=?').run(body.visibility,row.id);
    sql.prepare('DELETE FROM character_shares WHERE character_id=?').run(row.id);
    const add=sql.prepare('INSERT INTO character_shares(character_id,user_id,access) VALUES(?,?,?)');
    for(const [userId,access] of clean)add.run(row.id,userId,access);
  });
  return respond({sharing:characterSharing(db().prepare('SELECT * FROM character_builds WHERE id=?').get(row.id))});
}
/** Current sharing and the campaign members it can be shared with (GMs always have access). */
export function GET(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=? AND campaign_id=?')
    .get(event.params.characterId,event.params.campaignId);
  characterAccess(user,row,'manage');
  const members=db().prepare(`SELECT u.id,u.display_name AS displayName,u.username,m.role
    FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.campaign_id=? AND u.status='active' AND u.id<>? ORDER BY m.role,u.display_name`)
    .all(row.campaign_id,row.owner_user_id);
  return respond({sharing:characterSharing(row),members});
}
