<script>
  import {tr} from '../i18n/index.js';
  import {api} from './api.js';
  /** "Connect Foundry": a one-time code that links the player's own Foundry browser to their account. */
  let {campaignId}=$props();
  let open=$state(false);
  let code=$state(null);
  let error=$state('');
  let copied=$state(false);
  async function start(){
    open=true;error='';code=null;
    try{code=(await api('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/foundry-code',{method:'POST',body:{}})).code;}
    catch(e){error=e.message;}
  }
  async function copy(){try{await navigator.clipboard.writeText(code);copied=true;setTimeout(()=>copied=false,1500);}catch{}}
</script>
<button class="btn ghost" onclick={start} title={tr("Send and pull your characters from Foundry without a GM")}>{tr("Connect Foundry")}</button>
{#if open}
  <div class="scrim" role="presentation" onclick={()=>open=false}></div>
  <div class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="connect-title">
    <h2 id="connect-title">{tr("Connect your Foundry")}</h2>
    <p class="muted">{tr("Lets your own Foundry browser send your characters here and pull plans you can edit onto your characters — no GM needed.")}</p>
    <ol>
      <li>{tr("In Foundry:")} <b>{tr("Game Settings → Configure Settings → PF2e Planner Bridge → Connect my account")}</b>.</li>
      <li>{tr("Paste this code. It works once, within 15 minutes.")}</li>
    </ol>
    {#if code}
      <div class="row"><input readonly value={code} aria-label={tr("Connection code")} onfocus={e=>e.currentTarget.select()}/>
        <button class="btn small" onclick={copy}>{copied?tr('Copied'):tr('Copy')}</button></div>
    {:else if error}<p class="notice bad">{error==='no_foundry_world_paired'?tr('A GM has to pair the Foundry world first.'):error}</p>
    {:else}<p class="muted">{tr("Making a code…")}</p>{/if}
    <div class="row end"><button class="btn" onclick={()=>open=false}>{tr("Done")}</button></div>
  </div>
{/if}
<style>
  .scrim{position:fixed;inset:0;background:var(--overlay);z-index:60}
  .dialog{position:fixed;z-index:61;top:50%;left:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));
    padding:20px;display:grid;gap:12px;box-shadow:var(--shadow)}
  h2{font-size:1.15rem}
  p,ol{margin:0}
  ol{padding-left:1.2rem;display:grid;gap:4px}
  .row{display:flex;gap:8px}
  .row input{flex:1;min-width:0;font:500 .8rem var(--mono)}
  .end{justify-content:flex-end}
</style>
