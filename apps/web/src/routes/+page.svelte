<script>
  import {tr} from '../lib/i18n/index.js';
  import {onMount} from 'svelte';
  import AppBar from '../lib/ui/AppBar.svelte';
  import PairingCode from '../lib/ui/PairingCode.svelte';
  import {api,campaignPath} from '../lib/ui/api.js';
  import {lastCampaign} from '../lib/ui/session.js';
  let session=$state(null);
  let error=$state('');
  onMount(async()=>{
    try{session=await api('/api/v1/me');}
    catch(e){
      if(e.status!==401){error=e.message;return;}
      const setup=await api('/api/v1/setup').catch(()=>({needed:false}));
      location.replace(setup.needed?'/setup':'/sign-in');return;
    }
    const last=lastCampaign();
    const target=session.campaigns.find(c=>c.id===last)??session.campaigns[0];
    if(target)location.replace(campaignPath(target.id));
  });
  const canPair=$derived(session&&(session.user.siteRole==='owner'||session.campaigns.some(c=>c.role==='gm')));
</script>
<svelte:head><title>{tr("PF2e Planner")}</title></svelte:head>
{#if error}
  <main class="page"><p class="notice bad" role="alert">{error}</p></main>
{:else if session&&!session.campaigns.length}
  <AppBar me={session.user}/>
  <main class="page onboarding">
    <section class="intro">
      <span class="eyebrow">{tr("Welcome, {0}", session.user.displayName)}</span>
      <h1>{canPair?tr('Connect your Foundry world'):tr('You’re not in a campaign yet')}</h1>
      <p class="muted">{canPair
        ?tr('The planner uses your world’s own compendiums, variant rules and PF2e Leveler settings. Pair the world once, then sync from Foundry.')
        :tr('Ask your GM to add you to their campaign. It will appear here as soon as they do.')}</p>
    </section>
    {#if canPair}
      <ol class="steps">
        <li><b>{tr("Install the bridge")}</b><span class="muted">{tr("In Foundry: Add-on Modules → Install Module, then enable")} <i>{tr("PF2e Planner Bridge")}</i> {tr("and")} <i>{tr("PF2e Leveler")}</i> {tr("in your world.")}</span></li>
        <li><b>{tr("Pair the world")}</b><span class="muted">{tr("Settings → PF2e Planner Bridge → Pair World. Enter this site’s address and the code below.")}</span></li>
        <li><b>{tr("Sync")}</b><span class="muted">{tr("Run Sync Now. Your campaign and its characters appear here.")}</span></li>
      </ol>
      <PairingCode/>
    {/if}
  </main>
{:else}
  <main class="page"><p class="muted">{tr("Loading…")}</p></main>
{/if}
<style>
  .onboarding{max-width:760px;display:grid;gap:28px;padding-top:56px}
  .intro{display:grid;gap:10px}
  h1{font-size:clamp(1.8rem,4vw,2.5rem);font-weight:800}
  .steps{margin:0;padding:0;list-style:none;display:grid;gap:10px;counter-reset:s}
  .steps li{display:grid;grid-template-columns:32px 1fr;gap:4px 12px;counter-increment:s;
    background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px}
  .steps li::before{content:counter(s);grid-row:span 2;width:28px;height:28px;border-radius:50%;
    display:grid;place-items:center;background:var(--brass-soft);color:var(--brass);font:700 13px var(--mono)}
</style>
