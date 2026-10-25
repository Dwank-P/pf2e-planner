<script>
  import {onMount} from 'svelte';
  import AuthCard from '../../lib/ui/AuthCard.svelte';
  import {api} from '../../lib/ui/api.js';
  // The code arrives in the URL fragment, so it never reaches server logs.
  let code=$state('');
  let password=$state('');
  let confirm=$state('');
  let busy=$state(false);
  let error=$state('');
  onMount(()=>{code=decodeURIComponent(location.hash.slice(1));history.replaceState(null,'',location.pathname);});
  async function submit(event){
    event.preventDefault();
    if(password!==confirm){error='The two passwords don’t match.';return;}
    busy=true;error='';
    try{await api('/api/v1/auth/reset',{method:'POST',body:{code:code.trim(),password}});location.replace('/');}
    catch(e){error=e.message;}finally{busy=false;}
  }
</script>
<svelte:head><title>Reset password · PF2e Planner</title></svelte:head>
<AuthCard title="Choose a new password" subtitle="Your server owner sent you a reset link. It works once, for 24 hours.">
  <form onsubmit={submit} class="form">
    {#if !code}<label class="field" for="code">Reset code<input id="code" required autocomplete="off" bind:value={code}/></label>{/if}
    <label class="field" for="password">New password <small>At least 12 characters.</small>
      <input id="password" type="password" required minlength="12" autocomplete="new-password" bind:value={password}/></label>
    <label class="field" for="confirm">Repeat it
      <input id="confirm" type="password" required autocomplete="new-password" bind:value={confirm}/></label>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
    <button class="btn primary" disabled={busy}>{busy?'Saving…':'Set password and sign in'}</button>
  </form>
  {#snippet footer()}<a href="/sign-in">Back to sign in</a>{/snippet}
</AuthCard>
<style>.form{display:grid;gap:14px}.form .btn{padding:.7rem}</style>
