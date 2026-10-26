<script>
  import {api,campaignPath} from '../ui/api.js';
  /** Copy a personal character into one of the player's campaigns (checked against its compendiums). */
  let {character,campaigns=[],onClose}=$props();
  const family=s=>s==='dnd5e'?'dnd5e':'pf2e';
  const options=$derived(campaigns.filter(c=>family(c.system_id)===character.system));
  let target=$state('');
  let busy=$state(false);
  let error=$state('');
  let result=$state(null);
  $effect(()=>{if(!target&&options.length)target=options[0].id;});
  async function copy(){
    busy=true;error='';
    try{result=await api('/api/v1/personal/'+encodeURIComponent(character.id)+'/copy',{method:'POST',body:{campaignId:target}});}
    catch(e){error=e.message;}finally{busy=false;}
  }
</script>
<div class="scrim" role="presentation" onclick={onClose}></div>
<div class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="copy-title">
  <h2 id="copy-title">Copy into a campaign</h2>
  {#if result}
    <p>Copied <b>{result.character.name}</b>. {result.report.matched+result.report.renamed} picks matched
      {result.report.renamed?`(${result.report.renamed} by name)`:''}.</p>
    {#if result.report.missing.length}
      <p class="notice">Not in that world’s compendiums, so left out: {result.report.missing.join(', ')}.</p>
    {/if}
    {#if result.report.variantDifferences.length}
      <p class="notice">The campaign’s rules apply: {result.report.variantDifferences.join('; ')}.</p>
    {/if}
    <div class="row"><button class="btn ghost" onclick={onClose}>Close</button>
      <a class="btn primary" href={campaignPath(result.character.campaignId,'/characters/'+result.character.id)}>Open it</a></div>
  {:else if !options.length}
    <p class="muted">You’re not in a {character.system==='dnd5e'?'D&D 5e':'PF2e/SF2e'} campaign.</p>
    <div class="row"><button class="btn ghost" onclick={onClose}>Close</button></div>
  {:else}
    <p class="hint">Makes a normal campaign character (the GM can see it, and it can go to Foundry). Each pick is matched
      against the campaign’s compendiums; anything the world doesn’t have is left out. This character stays as it is.</p>
    <label class="field" for="copy-target">Campaign
      <select id="copy-target" bind:value={target}>{#each options as c}<option value={c.id}>{c.title}</option>{/each}</select></label>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
    <div class="row"><button class="btn ghost" onclick={onClose}>Cancel</button>
      <button class="btn primary" disabled={busy||!target} onclick={copy}>{busy?'Copying…':'Copy'}</button></div>
  {/if}
</div>
<style>
  .scrim{position:fixed;inset:0;background:var(--overlay);z-index:60}
  .dialog{position:fixed;z-index:61;top:50%;left:50%;transform:translate(-50%,-50%);width:min(480px,calc(100vw - 32px));
    max-height:calc(100vh - 48px);overflow:auto;padding:20px;display:grid;gap:14px;box-shadow:var(--shadow)}
  h2{font-size:1.15rem}
  p{margin:0}
  .hint{color:var(--muted);font-size:.85rem}
  .row{display:flex;justify-content:flex-end;gap:8px}
</style>
