import {randomUUID} from 'node:crypto';
import {db, unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond} from '#lib/server/api.js';
import {validateBuild,mergeView,toCharacter} from '#lib/server/characters.js';

export function GET(event) {
  const user=sessionUser(event),campaignId=event.params.campaignId;
  requireMembership(user,campaignId);
  const role=db().prepare('SELECT role FROM memberships WHERE campaign_id=? AND user_id=?')
    .get(campaignId,user.id)?.role;
  const all=user.site_role==='owner'||role==='gm';
  const select=`SELECT b.*,u.display_name AS owner_name,l.actor_id AS linked_actor,s.access AS share_access
    FROM character_builds b
    JOIN users u ON u.id=b.owner_user_id
    LEFT JOIN foundry_actor_links l ON l.character_id=b.id
    LEFT JOIN character_shares s ON s.character_id=b.id AND s.user_id=?`;
  // GMs see every character; players see their own plus those shared with the campaign or them.
  const rows=all
    ? db().prepare(`${select} WHERE b.campaign_id=?
        ORDER BY b.updated_at DESC LIMIT 200`).all(user.id,campaignId)
    : db().prepare(`${select}
        WHERE b.campaign_id=? AND (b.owner_user_id=? OR b.visibility IN ('campaign-view','campaign-edit')
          OR (b.visibility='custom' AND s.user_id IS NOT NULL))
        ORDER BY b.updated_at DESC LIMIT 200`).all(user.id,campaignId,user.id);
  const canEdit=r=>all||r.owner_user_id===user.id||r.visibility==='campaign-edit'||
    (r.visibility==='custom'&&r.share_access==='edit');
  return respond({characters:rows.map(r=>({...toCharacter(r,{includeLeveler:false}),
    ownerName:r.owner_name,linked:!!r.linked_actor,access:{edit:canEdit(r),manage:all||r.owner_user_id===user.id}}))});
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
  const build=mergeView(campaignId,null,validateBuild(body.build??{})),id=randomUUID(),now=unix();
  db().prepare(`INSERT INTO character_builds
    (id,campaign_id,owner_user_id,name,level,build_json,revision,created_at,updated_at)
    VALUES(?,?,?,?,?,?,1,?,?)`)
    .run(id,campaignId,user.id,name,level,JSON.stringify(build),now,now);
  const row=db().prepare('SELECT * FROM character_builds WHERE id=?').get(id);
  return respond({character:toCharacter(row)},201);
}
