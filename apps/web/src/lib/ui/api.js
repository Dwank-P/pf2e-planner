/** Same-origin JSON API calls with plain-language errors. */
const MESSAGES={
  login_required:'Your session has ended. Sign in again.',
  invalid_credentials:'That username and password don’t match.',
  too_many_attempts:'Too many attempts. Wait a few minutes and try again.',
  membership_required:'You’re not a member of this campaign.',
  gm_required:'Only the campaign’s GM can do that.',
  character_owner_or_gm_required:'Only the character’s owner or the GM can open it.',
  character_not_found:'This character no longer exists.',
  character_changed_elsewhere_refresh_first:'This character was changed in another tab. Reload to see the latest version.',
  character_name_required:'Give the character a name (up to 80 characters).',
  build_contains_item_not_in_synced_catalog:'Something you picked isn’t in the campaign’s synced compendiums any more. Ask the GM to sync, then try again.',
  sync_compendiums_before_selecting_items:'This campaign hasn’t synced its compendiums yet. Ask the GM to run Sync Now in Foundry.',
  catalog_not_published:'This campaign hasn’t synced its compendiums yet.',
  maximum_50_characters_per_player:'You already have 50 characters in this campaign.',
  invalid_bootstrap:'That setup token doesn’t match the server’s BOOTSTRAP_TOKEN.',
  already_initialized:'This server already has an owner. Sign in instead.',
  setup_not_configured:'Set BOOTSTRAP_TOKEN (32+ characters) on the server first.',
  password_12_to_256_characters:'Passwords need 12 to 256 characters.',
  invalid_username:'Usernames use 3–32 letters, numbers, dots, dashes or underscores.',
  username_unavailable:'That username is taken.',
  cannot_remove_site_owner:'The server owner can’t be removed from a campaign.',
  campaign_needs_a_gm:'This is the campaign’s only GM. Make someone else GM first.',
  cannot_delete_yourself:'You can’t delete your own account here.',
  cannot_delete_site_owner:'The server owner account can’t be deleted.',
  owner_required:'Only the server owner can do that.',
  member_not_found:'That person isn’t in this campaign any more.',
  invalid_or_expired_code:'That invitation code is invalid or has expired. Ask your GM for a new one.'
};
export class ApiError extends Error{
  constructor(code,status){super(MESSAGES[code]??code??'Request failed (HTTP '+status+')');this.code=code;this.status=status;}
}
export async function api(path,{method='GET',body}={}){
  // Changes always send JSON: SvelteKit treats a body-less DELETE as a form post and may block it.
  if(method!=='GET'&&body===undefined)body={};
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',
    headers:body===undefined?undefined:{'content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new ApiError(result.message||result.error,response.status);
  return result;
}
export const campaignPath=(id,rest='')=>'/campaigns/'+encodeURIComponent(id)+rest;
export function timeAgo(seconds){
  if(!seconds)return 'never';
  const diff=Math.max(0,Date.now()/1000-seconds);
  if(diff<90)return 'just now';
  if(diff<3600)return Math.round(diff/60)+' min ago';
  if(diff<86400)return Math.round(diff/3600)+' h ago';
  return Math.round(diff/86400)+' days ago';
}
