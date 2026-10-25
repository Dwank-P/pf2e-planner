import {db,unix} from './db.js';
import {problem} from './api.js';

/**
 * Reusable campaign invite links: a GM makes one link for the whole group; anyone
 * with it can create an account or add their existing account to the campaign as
 * a player until it expires (or forever) or is revoked.
 */
export const LINK_CODE=/^[A-Za-z0-9_-]{40,70}$/;
export const UNITS=['hours','days','months','years','never'];

/** Expiry time for {unit, amount}; null means the link never expires. */
export function expiryFor(duration,now=unix()){
  const unit=duration?.unit??'hours';
  if(!UNITS.includes(unit))problem(400,'invalid_invite_duration');
  if(unit==='never')return null;
  const amount=Number(duration?.amount??(unit==='hours'?24:1));
  const max={hours:8760,days:3650,months:120,years:10}[unit];
  if(!Number.isInteger(amount)||amount<1||amount>max)problem(400,'invalid_invite_duration');
  if(unit==='hours')return now+amount*3600;
  if(unit==='days')return now+amount*86400;
  const date=new Date(now*1000);
  if(unit==='months')date.setUTCMonth(date.getUTCMonth()+amount);
  else date.setUTCFullYear(date.getUTCFullYear()+amount);
  return Math.floor(date.getTime()/1000);
}
/** A usable link by its code, with its campaign, or a 400 for invalid, expired or revoked links. */
export function usableLink(code,now=unix()){
  if(typeof code!=='string'||!LINK_CODE.test(code))problem(400,'invalid_or_expired_code');
  const link=db().prepare(`SELECT l.*,c.title AS campaign_title FROM campaign_invite_links l
    JOIN campaigns c ON c.id=l.campaign_id
    WHERE l.code=? AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>?)`).get(code,now);
  if(!link)problem(400,'invalid_or_expired_code');
  return link;
}
/** Add a user to the link's campaign as a player (no change if already a member). */
export function joinWithLink(sql,link,userId){
  const added=sql.prepare("INSERT OR IGNORE INTO memberships(campaign_id,user_id,role) VALUES(?,?,'player')")
    .run(link.campaign_id,userId).changes;
  if(added)sql.prepare('UPDATE campaign_invite_links SET uses=uses+1 WHERE id=?').run(link.id);
  return {campaignId:link.campaign_id,alreadyMember:!added};
}
export function linkView(row,origin){
  return {id:row.id,url:origin+'/invite/'+row.code,createdAt:row.created_at,expiresAt:row.expires_at,
    uses:row.uses,createdBy:row.created_by_name??null};
}
