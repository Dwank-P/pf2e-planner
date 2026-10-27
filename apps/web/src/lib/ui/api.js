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
  invalid_or_expired_code:'That code is invalid or has expired. Ask for a new one.',
  current_password_incorrect:'Your current password isn’t right.',
  not_enough_free_space_for_backup:'Not enough free disk space for a backup (it needs about the database\'s size).',
  not_enough_free_space_for_sync:'Not enough free disk space to publish this sync.',
  backup_failed_integrity_check:'The backup failed its integrity check and was removed. Try again; if it repeats, check the disk.',
  backup_unavailable:'Backups aren\'t available for an in-memory database.',
  invalid_invite_duration:'Choose how long the link lasts: up to 8760 hours, 3650 days, 120 months or 10 years, or never expiring.',
  invite_link_not_found:'That invite link is already turned off.',
  invalid_name:'Display names need 1 to 80 characters.',
  user_not_found:'That account no longer exists.',
  unknown_storage_action:'Unknown maintenance action.',
  not_enough_free_space_for_vacuum:'Not enough free disk space to compact the database (it needs about its own size again).',
  last_origin_disconnect_world_instead:'This is the world’s only Foundry address. Disconnect the world instead.',
  origin_not_found:'That Foundry address isn’t connected any more.',
  character_view_only:'You can view this character but not change it.',
  character_manager_required:'Only the character’s owner or the GM can change who it’s shared with.',
  invalid_sharing:'Choose who can see or edit this character.',
  pathbuilder_id_invalid:'Enter the Pathbuilder JSON ID (the number from Export → Export JSON).',
  pathbuilder_not_found:'Pathbuilder has no character with that ID. Check the number and that the export is still shared.',
  pathbuilder_unreachable:'Couldn’t reach Pathbuilder. Try again in a moment.',
  pathbuilder_blocked:'Pathbuilder didn’t let the server fetch that export. Open the export link in your browser, copy the JSON and paste it instead.',
  pathbuilder_invalid_json:'That Pathbuilder export couldn’t be read.',
  not_a_planner_character_export:'That isn’t a planner export or a PF2e Leveler plan file.',
  campaign_uses_other_rules_system:'That character is for a different game system than this campaign.',
  no_synced_world_for_this_system:'None of your worlds has synced compendiums for that game system yet.',
  source_not_shared_with_you:'That world isn’t available to you any more; reopen Rules & sources.',
  not_a_leveler_plan:'That file isn’t a PF2e Leveler plan (use Leveler’s “Export plan”).',
  no_foundry_world_paired:'A GM has to pair the Foundry world first.'
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
