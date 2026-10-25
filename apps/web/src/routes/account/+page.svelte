<script>
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
  onMount(async()=>{
    session=await requireSession();
    username=session.user.username??'';displayName=session.user.displayName??'';
  });
  async function run(work){busy=true;error='';notice='';try{await work();}catch(e){error=e.message;}finally{busy=false;}}
  const saveProfile=event=>{event.preventDefault();run(async()=>{
    const result=await api('/api/v1/me',{method:'PATCH',body:{username:username.trim(),displayName:displayName.trim()}});
    session={...session,user:result.user};notice='Profile saved. Sign in with your new username next time.';
  });};
  const changePassword=event=>{event.preventDefault();
    if(newPassword!==confirm){error='The new passwords don’t match.';return;}
    run(async()=>{
      await api('/api/v1/me/password',{method:'POST',body:{currentPassword,newPassword}});
      currentPassword=newPassword=confirm='';notice='Password changed. Other browsers have been signed out.';
    });};
</script>
<svelte:head><title>Account · PF2e Planner</title></svelte:head>
{#if session}<AppBar me={session.user} campaigns={session.campaigns} crumb="Account"/>{/if}
<main class="page account">
  <h1>Your account</h1>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice good" role="status">{notice}</p>{/if}
  {#if session}
    <form class="panel block" onsubmit={saveProfile}>
      <h2>Profile</h2>
      <label class="field" for="username">Username <small>3–32 letters, numbers, dots, dashes or underscores. You sign in with this.</small>
        <input id="username" required autocomplete="username" bind:value={username}/></label>
      <label class="field" for="display">Display name <small>What your campaign sees.</small>
        <input id="display" required maxlength="80" bind:value={displayName}/></label>
      <button class="btn primary" disabled={busy}>Save profile</button>
    </form>
    <form class="panel block" onsubmit={changePassword}>
      <h2>Password</h2>
      <input type="text" autocomplete="username" value={session.user.username} hidden readonly/>
      <label class="field" for="current">Current password
        <input id="current" type="password" required autocomplete="current-password" bind:value={currentPassword}/></label>
      <label class="field" for="new">New password <small>At least 12 characters.</small>
        <input id="new" type="password" required minlength="12" autocomplete="new-password" bind:value={newPassword}/></label>
      <label class="field" for="confirm">Repeat new password
        <input id="confirm" type="password" required autocomplete="new-password" bind:value={confirm}/></label>
      <button class="btn primary" disabled={busy}>Change password</button>
      <p class="muted small">Locked out? The server owner can send you a reset link.</p>
    </form>
  {/if}
</main>
<style>
  .account{max-width:640px;display:grid;gap:16px}
  .block{padding:20px;display:grid;gap:14px}
  .block .btn{justify-self:start}
  h2{font-size:1.1rem}
  .small{font-size:.85rem}
</style>
