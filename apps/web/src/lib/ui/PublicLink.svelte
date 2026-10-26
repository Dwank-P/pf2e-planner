<script>
  /** A character's public view link: create, copy, replace or turn off. onChange('on'|'regenerate'|'off'). */
  let {token=null,busy=false,onChange}=$props();
  let copied=$state(false);
  const link=$derived(token?location.origin+'/p/'+token:'');
  async function copy(){
    try{await navigator.clipboard.writeText(link);copied=true;setTimeout(()=>copied=false,1500);}catch{}
  }
</script>
<section class="group">
  <h3>Public link</h3>
  <p class="hint">Anyone with the link can view the build without signing in, and can read the items it uses (not
    follow links in their text). Another planner can import the character from it, too.</p>
  {#if token}
    <div class="linkrow"><input readonly value={link} aria-label="Public link" onfocus={e=>e.currentTarget.select()}/>
      <button class="btn small" onclick={copy}>{copied?'Copied':'Copy'}</button></div>
    <div class="row"><button class="btn small ghost" disabled={busy} onclick={()=>onChange('regenerate')}>New link</button>
      <button class="btn small ghost danger" disabled={busy} onclick={()=>onChange('off')}>Turn off</button></div>
  {:else}
    <button class="btn small" disabled={busy} onclick={()=>onChange('on')}>Create a public link</button>
  {/if}
</section>
<style>
  .group{display:grid;gap:8px;justify-items:start}
  .group>*{justify-self:stretch}
  .group>button{justify-self:start}
  h3{font-size:.95rem;margin:0}
  .hint{color:var(--muted);font-size:.82rem;margin:0}
  .linkrow{display:flex;gap:8px}
  .linkrow input{flex:1;min-width:0;font:500 .8rem var(--mono)}
  .row{display:flex;gap:8px}
</style>
