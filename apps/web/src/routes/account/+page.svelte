<script>
  import {tr} from '../../lib/i18n/index.js';
  import {onMount} from 'svelte';
  import AppBar from '../../lib/ui/AppBar.svelte';
  import {api} from '../../lib/ui/api.js';
  import {requireSession} from '../../lib/ui/session.js';
  let session=$state(null);
  let username=$state('');
  let displayName=$state('');
  let currentPassword=$state('');
  let newPassword=$state('');
  let confirm=$state('');
  let busy=$state(false);
  let error=$state('');
  let notice=$state('');
  // Foundry browsers connected to this account (GM pairings, player connections).
  let connections=$state(null);
  onMount(async()=>{
    session=await requireSession();
    username=session.user.username??'';displayName=session.user.displayName??'';
    connections=(await api('/api/v1/me/foundry-connections').catch(()=>({connections:[]}))).connections;
  });
  const disconnect=c=>run(async()=>{
    connections=(await api('/api/v1/me/foundry-connections',{method:'DELETE',body:{id:c.id}})).connections;
    notice=tr('Disconnected {0} ({1}).',c.origin??tr('that browser'),c.campaign);
  });
  const date=s=>new Date(s*1000).toLocaleDateString();
  async function run(work){busy=true;error='';notice='';try{await work();}catch(e){error=e.message;}finally{busy=false;}}
  const saveProfile=event=>{event.preventDefault();run(async()=>{
    const result=await api('/api/v1/me',{method:'PATCH',body:{username:username.trim(),displayName:displayName.trim()}});
    session={...session,user:result.user};notice=tr('Profile saved. Sign in with your new username next time.');
  });};
  const changePassword=event=>{event.preventDefault();
    if(newPassword!==confirm){error=tr('The new passwords don’t match.');return;}
    run(async()=>{
      await api('/api/v1/me/password',{method:'POST',body:{currentPassword,newPassword}});
      currentPassword=newPassword=confirm='';notice=tr('Password changed. Other browsers have been signed out.');
    });};
</script>
<svelte:head><title>{tr("Account · PF2e Planner")}</title></svelte:head>
{#if session}<AppBar me={session.user} campaigns={session.campaigns} crumb={tr("Account")}/>{/if}
<main class="page account">
  <h1>{tr("Your account")}</h1>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice good" role="status">{notice}</p>{/if}
  {#if session}
    <form class="panel block" onsubmit={saveProfile}>
      <h2>{tr("Profile")}</h2>
      <label class="field" for="username">{tr("Username")} <small>{tr("3–32 letters, numbers, dots, dashes or underscores. You sign in with this.")}</small>
        <input id="username" required autocomplete="username" bind:value={username}/></label>
      <label class="field" for="display">{tr("Display name")} <small>{tr("What your campaign sees.")}</small>
        <input id="display" required maxlength="80" bind:value={displayName}/></label>
      <button class="btn primary" disabled={busy}>{tr("Save profile")}</button>
    </form>
    <form class="panel block" onsubmit={changePassword}>
      <h2>{tr("Password")}</h2>
      <input type="text" autocomplete="username" value={session.user.username} hidden readonly/>
      <label class="field" for="current">{tr("Current password")}
        <input id="current" type="password" required autocomplete="current-password" bind:value={currentPassword}/></label>
      <label class="field" for="new">{tr("New password")} <small>{tr("At least 12 characters.")}</small>
        <input id="new" type="password" required minlength="12" autocomplete="new-password" bind:value={newPassword}/></label>
      <label class="field" for="confirm">{tr("Repeat new password")}
        <input id="confirm" type="password" required autocomplete="new-password" bind:value={confirm}/></label>
      <button class="btn primary" disabled={busy}>{tr("Change password")}</button>
      <p class="muted small">{tr("Locked out? The server owner can send you a reset link.")}</p>
    </form>
    {#if connections}
      <section class="panel block">
        <h2>{tr("Foundry connections")}</h2>
        <p class="muted small">{tr("Foundry browsers that act for you: a GM's pairing syncs a world; a player connection (campaign page → Connect Foundry) sends and pulls your characters. Disconnect any you no longer use.")}</p>
        {#if connections.length}
          <ul class="connections">{#each connections as c (c.id)}
            <li><span><b>{c.campaign}</b> <small class="muted">{tr("{0} · {1} · since {2}", c.scope==='player'?tr('player connection'):'GM pairing', c.origin??'—', date(c.createdAt))}</small></span>
              <button class="btn small ghost danger" disabled={busy} onclick={()=>disconnect(c)}>{tr("Disconnect")}</button></li>
          {/each}</ul>
        {:else}<p class="muted">{tr("None.")}</p>{/if}
      </section>
    {/if}
  {/if}
</main>
<style>
  .account{max-width:640px;display:grid;gap:16px}
  .block{padding:20px;display:grid;gap:14px}
  .block .btn{justify-self:start}
  h2{font-size:1.1rem}
  .small{font-size:.85rem}
  .connections{list-style:none;margin:0;padding:0;display:grid;gap:8px}
  .connections li{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:8px}
</style>
