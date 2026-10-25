<script>
  import ItemInspector from '../ItemInspector.svelte';
  import {api} from '../ui/api.js';
  /** Side drawer with an item's full rules text; follows inline links with a back history. */
  let {campaignId,uuid=null,level=1,onClose}=$props();
  let stack=$state([]);
  let error=$state('');
  const current=$derived(stack.at(-1)??null);
  const cache=new Map();
  async function fetchItem(id){
    if(!cache.has(id))cache.set(id,api('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/catalog-item?uuid='+encodeURIComponent(id)).then(r=>r.item));
    return cache.get(id);
  }
  $effect(()=>{
    const id=uuid;
    stack=[];error='';
    if(!id)return;
    fetchItem(id).then(item=>{if(uuid===id)stack=[item];}).catch(e=>{if(uuid===id)error=e.message;});
  });
</script>
{#if uuid}
  <div class="scrim" role="presentation" onclick={onClose}></div>
  <aside class="drawer" aria-label="Item details">
    {#if error}
      <div class="pad"><p class="notice bad">{error}</p><button class="btn" onclick={onClose}>Close</button></div>
    {:else if current}
      <ItemInspector item={current} {level} {campaignId} canBack={stack.length>1}
        onOpen={item=>stack=[...stack,item]} onBack={()=>stack=stack.slice(0,-1)} onClose={onClose}/>
    {:else}
      <div class="pad muted">Loading…</div>
    {/if}
  </aside>
{/if}
<svelte:window onkeydown={e=>{if(uuid&&e.key==='Escape')onClose();}}/>
<style>
  .scrim{position:fixed;inset:0;background:var(--overlay);z-index:60}
  .drawer{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);z-index:61;background:var(--panel);
    border-left:1px solid var(--line);box-shadow:var(--shadow);display:flex;flex-direction:column;
    padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);padding-right:env(safe-area-inset-right,0px)}
  .pad{padding:24px;display:grid;gap:12px}
  @media (prefers-reduced-motion:no-preference){.drawer{animation:slide .18s ease-out}}
  @keyframes slide{from{transform:translateX(24px);opacity:.6}}
</style>
