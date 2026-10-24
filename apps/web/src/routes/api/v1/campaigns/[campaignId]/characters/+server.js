import {randomUUID} from 'node:crypto';
import {db, unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond} from '#lib/server/api.js';
import {validateBuild,toCharacter} from '#lib/server/characters.js';

export function GET(event) {
  const user=sessionUser(event),campaignId=event.params.campaignId;
  requireMembership(user,campaignId);
  const role=db().prepare('SELECT role FROM memberships WHERE campaign_id=? AND user_id=?')
    .get(campaignId,user.id)?.role;
  const all=user.site_role==='owner'||role==='gm';
  const rows=all
    ? db().prepare(`SELECT b.*,u.display_name AS owner_name FROM character_builds b
        JOIN users u ON u.id=b.owner_user_id WHERE campaign_id=?
        ORDER BY b.updated_at DESC LIMIT 200`).all(campaignId)
    : db().prepare(`SELECT b.*,u.display_name AS owner_name FROM character_builds b
        JOIN users u ON u.id=b.owner_user_id WHERE campaign_id=? AND b.owner_user_id=?
        ORDER BY b.updated_at DESC LIMIT 200`).all(campaignId,user.id);
  return respond({characters:rows.map(r=>({...toCharacter(r),ownerName:r.owner_name}))});
}
export async function POST(event) {
  const user=sessionUser(event),campaignId=event.params.campaignId;
  requireMembership(user,campaignId);
  const body=await input(event.request,16000);
  const name=typeof body.name==='string'?body.name.trim():'';
  if(!name||name.length>80)problem(400,'character_name_required');
  const level=body.level??1;
  if(!Number.isInteger(level)||level<1||level>20)problem(400,'level_1_to_20_required');
  const count=db().prepare('SELECT COUNT(*) AS n FROM character_builds WHERE campaign_id=? AND owner_user_id=?')
    .get(campaignId,user.id).n;
  if(count>=50)problem(409,'maximum_50_characters_per_player');
  const build=validateBuild(body.build??{}),id=randomUUID(),now=unix();
  db().prepare(`INSERT INTO character_builds
    (id,campaign_id,owner_user_id,name,level,build_json,revision,created_at,updated_at)
    VALUES(?,?,?,?,?,?,1,?,?)`)
    .run(id,campaignId,user.id,name,level,JSON.stringify(build),now,now);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=?').get(id);
  return respond({character:toCharacter(row)},201);
}
