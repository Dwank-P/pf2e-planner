<script>
  import {tr} from '../../lib/i18n/index.js';
  import {onMount} from 'svelte';
  import AuthCard from '../../lib/ui/AuthCard.svelte';
  import {api} from '../../lib/ui/api.js';
  let status=$state(null);
  let form=$state({bootstrapToken:'',displayName:'',username:'',password:''});
  let busy=$state(false);
  let error=$state('');
  onMount(async()=>{
    try{status=await api('/api/v1/setup');if(!status.needed)location.replace('/sign-in');}
    catch(e){error=e.message;}
  });
  async function submit(event){
    event.preventDefault();
    busy=true;error='';
    try{await api('/api/v1/setup',{method:'POST',body:form});location.replace('/');}
    catch(e){error=e.message;form.password='';}
    finally{busy=false;}
  }
</script>
<svelte:head><title>{tr("Set up · PF2e Planner")}</title></svelte:head>
<AuthCard title={tr("Set up this server")} subtitle={tr("Create the owner account. You'll pair your Foundry world next.")}>
  {#if status&&!status.configured}
    <p class="notice warn">{tr("Set a")} <code>{tr("BOOTSTRAP_TOKEN")}</code> {tr("of at least 32 characters in the server's environment, then reload.")}</p>
  {/if}
  <form onsubmit={submit} class="form">
    <label class="field" for="token">{tr("Setup token")}<small>{tr("The BOOTSTRAP_TOKEN value from your Docker environment.")}</small>
      <input id="token" type="password" required autocomplete="off" bind:value={form.bootstrapToken}/></label>
    <label class="field" for="display">{tr("Your name")}<input id="display" required maxlength="80" bind:value={form.displayName}/></label>
    <label class="field" for="user">{tr("Username")}<input id="user" required minlength="3" maxlength="32" autocomplete="username" bind:value={form.username}/></label>
    <label class="field" for="pass">{tr("Password")}<small>{tr("At least 12 characters.")}</small>
      <input id="pass" type="password" required minlength="12" autocomplete="new-password" bind:value={form.password}/></label>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
    <button class="btn primary" disabled={busy||!status?.configured}>{busy?tr('Creating…'):tr('Create owner account')}</button>
  </form>
</AuthCard>
<style>.form{display:grid;gap:14px}.form .btn{padding:.7rem}</style>
