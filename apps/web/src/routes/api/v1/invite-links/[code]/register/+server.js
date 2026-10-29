import {randomUUID} from 'node:crypto';
import {unix,transaction} from '#lib/server/db.js';
import {passwordHash,setSession} from '#lib/server/security.js';
import {input,respond,problem,throttle,validateUsername,validatePassword,validateDisplay} from '#lib/server/api.js';
import {usableLink,joinWithLink} from '#lib/server/invite-links.js';
/** Create an account from an invite link and join its campaign as a player. */
export async function POST(event){
  throttle(event,'invite-link-register',8,600);
  const body=await input(event.request);
  usableLink(event.params.code);
  const username=validateUsername(body.username),password=validatePassword(body.password);
  const displayName=body.displayName?validateDisplay(body.displayName):username;
  const hashed=await passwordHash(password);
  const id=randomUUID();
  let result;
  try{
    result=transaction(sql=>{
      sql.prepare(`INSERT INTO users(id,display_name,username,password_hash,status,site_role,created_at)
        VALUES(?,?,?,?,'active','user',?)`).run(id,displayName,username,hashed,unix());
      return joinWithLink(sql,usableLink(event.params.code),id);
    });
  }catch(error){
    if(String(error).includes('UNIQUE'))problem(409,'username_unavailable');
    throw error;
  }
  setSession(event.cookies,id);
  return respond({...result,username},201);
}
