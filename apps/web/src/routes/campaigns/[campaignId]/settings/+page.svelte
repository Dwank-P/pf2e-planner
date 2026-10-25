<script>
  import {page} from '$app/state';
  import AppBar from '../../../../lib/ui/AppBar.svelte';
  import PairingCode from '../../../../lib/ui/PairingCode.svelte';
  import {api,campaignPath,timeAgo} from '../../../../lib/ui/api.js';
  import {loadCampaign} from '../../../../lib/ui/session.js';

  const campaignId=$derived(page.params.campaignId);
  const base=$derived('/api/v1/campaigns/'+encodeURIComponent(campaignId));
  let ctx=$state(null);
  let members=$state([]);
  let error=$state('');
  let invite=$state(null);
  let copied=$state('');
  let search=$state('');
  let matches=$state([]);
  let confirmDisconnect=$state(false);
  let busy=$state(false);
  let notice=$state('');

  $effect(()=>{
    const id=campaignId;
    (async()=>{
      try{
        const loaded=await loadCampaign(id);
        if(!loaded.isGm){location.replace(campaignPath(id));return;}
        ctx=loaded;
        members=(await api(base+'/members')).members;
      }catch(e){error=e.message;}
    })();
  });
  const sync=$derived(ctx?.sync);
  const rules=$derived(Object.entries(sync?.variants??{}).filter(([,v])=>typeof v==='boolean'));
  const variantNames={freeArchetype:'Free Archetype',dualClass:'Dual Class',ancestralParagon:'Ancestral Paragon',
    gradualAbilityBoosts:'Gradual Ability Boosts',automaticBonusProgression:'Automatic Bonus Progression',
    proficiencyWithoutLevel:'Proficiency Without Level',mythic:'Mythic',stamina:'Stamina',
    ignoreArchetypeDedicationLock:'Ignore dedication lock',enforcePrerequisites:'Enforce prerequisites'};
  const inviteText=$derived(invite?`You're invited to plan characters for ${ctx?.campaign.title} in PF2e Planner.\n\nGo to ${invite.joinUrl} and enter this code:\n${invite.inviteCode}\n\nThe code expires in 24 hours.`:'');

  async function run(work){busy=true;error='';notice='';try{await work();}catch(e){error=e.message;}finally{busy=false;}}
  const invitePlayer=()=>run(async()=>{invite=await api(base+'/members',{method:'POST',body:{}});members=(await api(base+'/members')).members;});
  const find=()=>run(async()=>{matches=(await api('/api/v1/users?q='+encodeURIComponent(search))).users;});
  const addExisting=user=>run(async()=>{
    const result=await api(base+'/members',{method:'POST',body:{existingUserId:user.id}});
    notice=result.alreadyMember?`${user.displayName} is already in this campaign.`:`${user.displayName} added. They sign in with their existing account.`;
    matches=[];search='';members=(await api(base+'/members')).members;
  });
  const disconnect=()=>run(async()=>{
    await api('/api/v1/integrations/'+encodeURIComponent(sync.integrationId)+'/revoke',{method:'POST',body:{}});
    location.reload();
  });
  async function copy(text,label){
    try{await navigator.clipboard.writeText(text);copied=label;}catch{copied='';error='Copy failed. Select the text and copy it yourself.';}
  }
</script>
<svelte:head><title>Settings · {ctx?.campaign.title??'Campaign'}</title></svelte:head>
{#if ctx}<AppBar me={ctx.me} campaigns={ctx.campaigns} campaign={ctx.campaign} sync={ctx.sync} crumb="Settings"/>{/if}
<main class="page settings">
  <a class="back" href={campaignPath(campaignId)}>← Party</a>
  <h1>Campaign settings</h1>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice good" role="status">{notice}</p>{/if}
  {#if ctx}
    <section class="panel block">
      <div class="block-head"><h2>Foundry world</h2>
        <span class="state"><span class="status-dot {sync?.synced?'good':'bad'}"></span>{sync?.synced?'Connected':'Not synced'}</span></div>
      {#if sync?.synced}
        <dl class="facts">
          <div><dt>Last sync</dt><dd>{timeAgo(sync.updatedAt)}</dd></div>
          <div><dt>PF2e system</dt><dd class="num">{sync.ruleset?.systemVersion??'—'}</dd></div>
          <div><dt>PF2e Leveler</dt><dd class="num">{sync.ruleset?.levelerVersion??'—'}</dd></div>
          <div><dt>Items</dt><dd class="num">{sync.totals?.savedItems?.toLocaleString()??'—'}</dd></div>
        </dl>
        <div class="sub"><span class="eyebrow">Variant rules</span>
          <div class="chips">
            {#each rules.filter(([,on])=>on) as [key]}<span class="chip">{variantNames[key]??key}</span>{:else}<span class="muted">None enabled</span>{/each}
          </div>
          {#if rules.some(([,on])=>!on)}
            <p class="muted small">Off: {rules.filter(([,on])=>!on).map(([key])=>variantNames[key]??key).join(', ')}</p>
          {/if}
        </div>
        <details class="sub"><summary>Synced compendiums ({sync.packs?.length??0})</summary>
          <ul class="packs">{#each sync.packs??[] as pack}<li class="num">{pack}</li>{/each}</ul>
        </details>
        <p class="muted">Sync runs when a GM logs in to Foundry. Use Settings → PF2e Planner Bridge → Sync Now after changing compendiums or variant rules.</p>
      {:else}
        <p class="muted">Pair a world from Foundry, then run Sync Now. Players can build characters once the first sync arrives.</p>
      {/if}
      <div class="sub"><span class="eyebrow">Pair or re-authorize a GM browser</span><PairingCode/></div>
      {#if sync?.integrationId}
        <div class="danger-zone">
          {#if confirmDisconnect}
            <p>Disconnect this world? Its GM browsers stop syncing immediately. Characters and the last synced compendiums stay.</p>
            <div class="row"><button class="btn ghost" onclick={()=>confirmDisconnect=false}>Keep connected</button>
              <button class="btn danger" disabled={busy} onclick={disconnect}>Disconnect world</button></div>
          {:else}
            <button class="btn ghost danger" onclick={()=>confirmDisconnect=true}>Disconnect world…</button>
          {/if}
        </div>
      {/if}
    </section>

    <section class="panel block">
      <div class="block-head"><h2>Players</h2><button class="btn primary" disabled={busy} onclick={invitePlayer}>Invite a player</button></div>
      {#if invite}
        <div class="invite">
          <p class="muted">Send this to the player privately. It is shown once.</p>
          <textarea readonly rows="7" onfocus={e=>e.currentTarget.select()}>{inviteText}</textarea>
          <div class="row"><button class="btn" onclick={()=>copy(inviteText,'Invitation')}>{copied==='Invitation'?'Copied':'Copy invitation'}</button></div>
        </div>
      {/if}
      <ul class="members">
        {#each members as m (m.id)}
          <li><span class="avatar">{(m.displayName??'?').slice(0,1)}</span>
            <span class="who"><b>{m.status==='pending'?'Invited player':m.displayName}</b>
              <small>{m.status==='pending'?'Invitation not used yet':'@'+m.username}</small></span>
            <span class="chip plain">{m.role==='gm'?'GM':'Player'}</span></li>
        {/each}
      </ul>
      <form class="add" onsubmit={e=>{e.preventDefault();find();}}>
        <label class="field" for="existing">Add someone who already has an account
          <span class="row"><input id="existing" minlength="2" bind:value={search} placeholder="Name or username"/>
            <button class="btn" disabled={busy||search.trim().length<2}>Search</button></span></label>
      </form>
      {#if matches.length}
        <ul class="members">{#each matches as user}<li><span class="who"><b>{user.displayName}</b><small>@{user.username}</small></span>
          <button class="btn small" onclick={()=>addExisting(user)}>Add</button></li>{/each}</ul>
      {/if}
      <p class="muted small">Coming next: players sign in straight from Foundry, so invitations won't be needed.</p>
    </section>

    <section class="panel block">
      <div class="block-head"><h2>Compendiums</h2></div>
      <p class="muted">Browse everything this campaign synced.</p>
      <div class="row start"><a class="btn" href={campaignPath(campaignId,'/feats')}>Feat browser</a>
        <a class="btn ghost" href={campaignPath(campaignId,'/ruleset')}>Detailed sync report</a></div>
    </section>
  {/if}
</main>
<style>
  .settings{max-width:860px;display:grid;gap:18px}
  .back{color:var(--muted);text-decoration:none;font-weight:700}
  h1{font-size:2rem;font-weight:800}
  .block{padding:20px;display:grid;gap:16px}
  .block-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  h2{font-size:1.2rem;font-weight:800}
  .state{display:flex;gap:6px;align-items:center;color:var(--muted);font-weight:700}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0}
  .facts div{background:var(--panel-2);border-radius:8px;padding:10px 12px}
  dt{color:var(--muted);font-size:.8rem}dd{margin:2px 0 0;font-weight:700}
  .sub{display:grid;gap:8px}
  summary{cursor:pointer;font-weight:700}
  .packs{columns:2;margin:6px 0 0;padding-left:1.1rem;font-size:.85rem;color:var(--text-2)}
  .danger-zone{border-top:1px solid var(--line);padding-top:14px;display:grid;gap:10px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
  .row.start{justify-content:flex-start}
  .row input{flex:1;min-width:0}
  .invite{display:grid;gap:8px}
  textarea{width:100%;resize:vertical;font:500 .85rem var(--mono)}
  .members{list-style:none;margin:0;padding:0;display:grid;gap:6px}
  .members li{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:8px;background:var(--panel-2)}
  .avatar{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--panel-3);font:700 12px var(--display)}
  .who{display:grid;flex:1;min-width:0}
  .who small,.small{color:var(--muted);font-size:.85rem}
  .add .field{font-weight:700}
</style>
