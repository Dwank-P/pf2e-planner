<script>
  import {onMount} from 'svelte';
  import {page} from '$app/state';
  import AuthCard from '../../../lib/ui/AuthCard.svelte';
  import {api,campaignPath} from '../../../lib/ui/api.js';
  /** A reusable campaign invite: create an account, or add your existing one, and join as a player. */
  const code=$derived(page.params.code);
  let invite=$state(null);
  let me=$state(null);
  let mode=$state('create');
  let username=$state('');
  let displayName=$state('');
  let password=$state('');
  let confirm=$state('');
  let busy=$state(false);
  let error=$state('');
  onMount(async()=>{
    try{invite=await api('/api/v1/invite-links/'+encodeURIComponent(code));}
    catch(e){error=e.code==='invalid_or_expired_code'?'This invite link has expired or was turned off. Ask your GM for a new one.':e.message;return;}
    me=await api('/api/v1/me').catch(()=>null);
  });
  const accept=()=>api('/api/v1/invite-links/'+encodeURIComponent(code)+'/accept',{method:'POST',body:{}});
  async function run(work){
    busy=true;error='';
    try{const result=await work();location.replace(campaignPath(result.campaignId));}
    catch(e){error=e.message;busy=false;}
  }
  const join=()=>run(accept);
  function submit(event){
    event.preventDefault();
    if(mode==='create'){
      if(password!==confirm){error='The two passwords don’t match.';return;}
      run(()=>api('/api/v1/invite-links/'+encodeURIComponent(code)+'/register',
        {method:'POST',body:{username:username.trim(),displayName:displayName.trim()||undefined,password}}));
    }else{
      run(async()=>{await api('/api/v1/auth/login',{method:'POST',body:{username:username.trim(),password}});return accept();});
    }
  }
  const expires=$derived(invite?.expiresAt?new Date(invite.expiresAt*1000).toLocaleString():null);
</script>
<svelte:head><title>Join {invite?.campaign.title??'a campaign'} · PF2e Planner</title></svelte:head>
<AuthCard title={invite?`Join ${invite.campaign.title}`:'Campaign invite'}
  subtitle={invite?`Your GM invited you to plan characters in ${invite.campaign.title}.${expires?` This link works until ${expires}.`:''}`:''}>
  {#if error&&!invite}
    <p class="notice bad" role="alert">{error}</p>
  {:else if invite&&me}
    <p>Signed in as <b>{me.user.displayName}</b>.</p>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
    <button class="btn primary" disabled={busy} onclick={join}>{busy?'Joining…':'Join '+invite.campaign.title}</button>
    <p class="muted small">Not you? <a href="/sign-in">Sign in as someone else</a>.</p>
  {:else if invite}
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={mode==='create'} class:on={mode==='create'} onclick={()=>{mode='create';error='';}}>New account</button>
      <button role="tab" aria-selected={mode==='existing'} class:on={mode==='existing'} onclick={()=>{mode='existing';error='';}}>I have an account</button>
    </div>
    <form class="form" onsubmit={submit}>
      <label class="field" for="username">Username{#if mode==='create'} <small>3–32 letters, numbers, dots, dashes or underscores.</small>{/if}
        <input id="username" required autocomplete="username" bind:value={username}/></label>
      {#if mode==='create'}
        <label class="field" for="display">Display name <small>Optional: what your group sees.</small>
          <input id="display" maxlength="80" bind:value={displayName}/></label>
      {/if}
      <label class="field" for="password">Password{#if mode==='create'} <small>At least 12 characters.</small>{/if}
        <input id="password" type="password" required minlength={mode==='create'?12:1}
          autocomplete={mode==='create'?'new-password':'current-password'} bind:value={password}/></label>
      {#if mode==='create'}
        <label class="field" for="confirm">Repeat password
          <input id="confirm" type="password" required autocomplete="new-password" bind:value={confirm}/></label>
      {/if}
      {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
      <button class="btn primary" disabled={busy}>{busy?'Joining…':mode==='create'?'Create account and join':'Sign in and join'}</button>
    </form>
  {:else}
    <p class="muted">Checking the invite…</p>
  {/if}
</AuthCard>
<style>
  .form{display:grid;gap:14px}.form .btn{padding:.7rem}
  .tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .tabs button{border:1px solid var(--line);background:var(--panel-2);border-radius:8px;padding:8px;font-weight:700}
  .tabs button.on{border-color:var(--brass);color:var(--brass)}
  .small{font-size:.85rem}
</style>
