<script>
  import {onMount} from 'svelte';
  import AuthCard from '../../lib/ui/AuthCard.svelte';
  import {api} from '../../lib/ui/api.js';
  let username=$state('');
  let password=$state('');
  let busy=$state(false);
  let error=$state('');
  onMount(async()=>{
    try{await api('/api/v1/me');location.replace('/');return;}catch{}
    try{if((await api('/api/v1/setup')).needed)location.replace('/setup');}catch{}
  });
  async function submit(event){
    event.preventDefault();
    busy=true;error='';
    try{
      await api('/api/v1/auth/login',{method:'POST',body:{username,password}});
      // Confirm the browser kept the session cookie before leaving the page.
      await api('/api/v1/me').catch(()=>{throw Error('Signed in, but this browser didn’t keep the session. Allow cookies for this site.');});
      location.replace('/');
    }catch(e){error=e.message;password='';}
    finally{busy=false;}
  }
</script>
<svelte:head><title>Sign in · PF2e Planner</title></svelte:head>
<AuthCard title="Sign in" subtitle="Plan your Pathfinder characters with your campaign's rules.">
  <form onsubmit={submit} class="form">
    <label class="field" for="username">Username
      <input id="username" required autocomplete="username" bind:value={username}/></label>
    <label class="field" for="password">Password
      <input id="password" type="password" required autocomplete="current-password" bind:value={password}/></label>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
    <button class="btn primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
  </form>
  {#snippet footer()}
    <span>Have an invitation code? <a href="/join">Activate your account</a></span>
  {/snippet}
</AuthCard>
<style>.form{display:grid;gap:14px}.form .btn{padding:.7rem}</style>
