<script>
  import {onMount} from 'svelte';
  import AppBar from '../../../lib/ui/AppBar.svelte';
  import PairingCode from '../../../lib/ui/PairingCode.svelte';
  import {requireSession} from '../../../lib/ui/session.js';
  /** Connect another Foundry world: each paired world becomes its own campaign. */
  let session=$state(null);
  onMount(async()=>{session=await requireSession();});
  const canPair=$derived(session&&(session.user.siteRole==='owner'||session.campaigns.some(c=>c.role==='gm')));
</script>
<svelte:head><title>Add a world · PF2e Planner</title></svelte:head>
{#if session}<AppBar me={session.user} campaigns={session.campaigns} crumb="Add a world"/>{/if}
<main class="page add-world">
  <section class="intro">
    <span class="eyebrow">New campaign</span>
    <h1>Add a Foundry world</h1>
    <p class="muted">Each Foundry world you pair becomes its own campaign here, with its own compendiums, rules and characters.
      To connect another browser or address to a world that's already here, use that campaign's settings instead.</p>
  </section>
  {#if session&&!canPair}
    <p class="notice">Only GMs can add worlds. Ask your server owner to make you a GM of a campaign first.</p>
  {:else if session}
    <ol class="steps">
      <li><b>Install the bridge</b><span class="muted">In the new world: Add-on Modules → Install Module, then enable <i>PF2e Planner Bridge</i> and <i>PF2e Leveler</i>.</span></li>
      <li><b>Pair the world</b><span class="muted">Settings → PF2e Planner Bridge → Pair World. Enter this site's address and the code below.</span></li>
      <li><b>Sync</b><span class="muted">Run Sync Now. The new campaign appears in the campaign menu.</span></li>
    </ol>
    <PairingCode/>
  {/if}
</main>
<style>
  .add-world{max-width:760px;display:grid;gap:24px;padding-top:40px}
  .intro{display:grid;gap:10px}
  h1{font-size:clamp(1.7rem,4vw,2.3rem);font-weight:800}
  .steps{margin:0;padding:0;list-style:none;display:grid;gap:10px;counter-reset:s}
  .steps li{display:grid;grid-template-columns:32px 1fr;gap:4px 12px;counter-increment:s;
    background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px}
  .steps li::before{content:counter(s);grid-row:span 2;width:28px;height:28px;border-radius:50%;
    display:grid;place-items:center;background:var(--brass-soft);color:var(--brass);font:700 13px var(--mono)}
</style>
