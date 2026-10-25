<script>
  import {api} from './api.js';
  /** Generate a one-time Foundry pairing code (valid 10 minutes) with copy support. */
  let pairing=$state(null);
  let busy=$state(false);
  let error=$state('');
  let copied=$state(false);
  let field=$state();
  const origin=typeof location==='undefined'?'':location.origin;
  async function generate(){
    busy=true;error='';copied=false;
    try{pairing=await api('/api/v1/pairing-codes',{method:'POST',body:{}});}
    catch(e){error=e.message;}finally{busy=false;}
  }
  async function copy(){
    try{await navigator.clipboard.writeText(pairing.code);copied=true;}
    catch{field?.select();}
  }
  const expires=$derived(pairing?new Date(pairing.expiresAt*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'');
</script>
<div class="pair panel">
  <div class="row">
    <div><b>Pairing code</b><p class="muted">Single use. Site address: <span class="num">{origin}</span></p></div>
    <button class="btn {pairing?'':'primary'}" onclick={generate} disabled={busy}>{pairing?'New code':'Generate code'}</button>
  </div>
  {#if pairing}
    <div class="code">
      <input bind:this={field} readonly value={pairing.code} aria-label="Pairing code" onfocus={e=>e.currentTarget.select()}/>
      <button class="btn" onclick={copy}>{copied?'Copied':'Copy'}</button>
    </div>
    <p class="muted small">Expires at {expires}. Paste it into Foundry’s Pair World dialog.</p>
  {/if}
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
</div>
<style>
  .pair{padding:16px;display:grid;gap:12px}
  .row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  .code{display:flex;gap:8px}
  .code input{flex:1;min-width:0;font:600 .9rem var(--mono)}
  .small{font-size:.85rem}
</style>
