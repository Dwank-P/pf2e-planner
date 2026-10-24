<script>
  import { renderLevelDescription } from './level-formulas.js';

  let {item=null, level=1, campaignId='', onOpen=()=>{}, onBack=()=>{},
    onClose=()=>{}, canBack=false, compact=false} = $props();

  let hoverItem=$state(null);
  let hoverState=$state('');
  let hoverPos=$state({x:30,y:100});
  let timer;
  let request=0;
  const cache=new Map();
  const html=$derived(renderLevelDescription(item?.description||'',level));
  const base=$derived('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/catalog-item');
  function getRef(target) {
    const element=target?.closest?.('[data-pf2e-uuid], [data-uuid], [data-pf2e-action]');
    if(!element)return null;
    const uuid=element.getAttribute('data-pf2e-uuid')||element.getAttribute('data-uuid');
    const action=element.getAttribute('data-pf2e-action');
    return uuid?.startsWith('Compendium.')
      ? {kind:'uuid',value:uuid}
      : action ? {kind:'slug',value:action} : null;
  }
  function itemUrl(ref) {
    return base+'?'+(ref.kind==='uuid'?'uuid':'slug')+'='+encodeURIComponent(ref.value);
  }
  function popupUrl(ref){
    return '/campaigns/'+encodeURIComponent(campaignId)+'/items?'+
      (ref.kind==='uuid'?'uuid':'slug')+'='+encodeURIComponent(ref.value)+
      '&level='+encodeURIComponent(level);
  }
  async function lookup(ref) {
    const key=ref.kind+':'+ref.value;
    if(cache.has(key))return cache.get(key);
    const response=await fetch(itemUrl(ref),{credentials:'same-origin'});
    if(!response.ok)throw Error('Reference not in synchronized packs');
    const result=await response.json();
    cache.set(key,result.item);
    return result.item;
  }
  function hoverLink(event) {
    const ref=getRef(event.target);
    if(!ref)return;
    clearTimeout(timer);
    const sequence=++request;
    hoverPos={
      x:Math.max(12,Math.min((event.clientX||220)+12,(window.innerWidth||800)-350)),
      y:Math.max(12,Math.min((event.clientY||180)+12,(window.innerHeight||800)-230))
    };
    hoverItem=null;
    hoverState='';
    timer=setTimeout(async()=>{
      try {
        const preview=await lookup(ref);
        if(sequence===request){hoverItem=preview;hoverState='ready';}
      }catch{
        if(sequence===request)hoverState='unavailable';
      }
    },220);
  }
  function clearHover(){
    clearTimeout(timer);
    ++request;
    hoverItem=null;
    hoverState='';
  }
  async function follow(event) {
    const ref=getRef(event.target);
    if(!ref)return;
    event.preventDefault();event.stopPropagation();
    clearHover();
    if(event.ctrlKey||event.metaKey){
      window.open(popupUrl(ref),'_blank','popup=yes,width=760,height=880,noopener');
      return;
    }
    try {await onOpen(await lookup(ref));}
    catch {hoverState='unavailable';}
  }
  function popThis(){
    if(!item)return;
    window.open('/campaigns/'+encodeURIComponent(campaignId)+'/items?uuid='+
      encodeURIComponent(item.uuid)+'&level='+level,'_blank',
      'popup=yes,width=760,height=880,noopener');
  }
</script>

{#if item}
  <div class:compact class="inspector">
    <div class="inspector-bar">
      <div class="inspector-nav">
        <button type="button" class="ghost" disabled={!canBack} onclick={onBack}>← Back</button>
        <button type="button" class="ghost" onclick={popThis} title="Open separate item window">↗ Pop out</button>
      </div>
      <button type="button" class="ghost" onclick={onClose} aria-label="Close details">✕</button>
    </div>
    <div class="inspector-main">
      <div class="eyebrow">{item.type||'Item'} <span>·</span> Level {item.level??'—'}</div>
      <h2>{item.name}</h2>
      <div class="inspector-tags">
        {#if item.rarity}<span class="rarity">{item.rarity}</span>{/if}
        {#each item.traits||[] as trait}<span>{trait}</span>{/each}
      </div>
      {#if item.metadata?.prerequisites?.length}
        <p class="prereq"><strong>Prerequisites</strong> {item.metadata.prerequisites.join(', ')}</p>
      {/if}
      <div class="description" role="presentation" onclick={follow}
        onpointerover={hoverLink} onpointerout={clearHover} onfocusin={hoverLink} onfocusout={clearHover}>
        {@html html||'<p>No description was imported for this item.</p>'}
      </div>
      <div class="inspector-footer">
        <span>Displayed at character level <strong>{level}</strong>.</span>
        <span>Level-based damage is estimated; no roll or Rule Elements are executed.</span>
      </div>
    </div>
  </div>
  {#if hoverItem && hoverState==='ready'}
    <div class="hover-preview" role="tooltip" style:left={hoverPos.x+'px'} style:top={hoverPos.y+'px'}>
      <div class="eyebrow">{hoverItem.type} · Level {hoverItem.level??'—'}</div>
      <strong>{hoverItem.name}</strong>
      <p>{hoverItem.metadata?.prerequisites?.length?'Prerequisites: '+hoverItem.metadata.prerequisites.join(', '):''}</p>
      <small>Click to open · Ctrl+click for a separate window</small>
    </div>
  {:else if hoverState==='unavailable'}
    <div class="hover-preview" role="tooltip" style:left={hoverPos.x+'px'} style:top={hoverPos.y+'px'}>
      This reference is not in the selected compendium import.
    </div>
  {/if}
{:else}
  <div class="inspector-empty">
    <span class="spark">✧</span>
    <h3>Explore an option</h3>
    <p>Select a feat, feature, item or link to see its rules here. Hover linked references for a quick preview.</p>
  </div>
{/if}
<style>
  .inspector{height:100%;display:flex;flex-direction:column;min-width:0;color:var(--text)}
  .inspector-bar{display:flex;align-items:center;justify-content:space-between;gap:.75rem;
    padding:.8rem 1.1rem;border-bottom:1px solid var(--line);background:var(--surface)}
  .inspector-nav{display:flex;gap:.3rem}.ghost{background:transparent;color:var(--muted);
    border:1px solid transparent;border-radius:8px;padding:.5rem .6rem;cursor:pointer}
  .ghost:hover{background:var(--surface-hover);color:var(--text)}.ghost:disabled{opacity:.3;cursor:not-allowed}
  .inspector-main{overflow-y:auto;padding:1.25rem 1.5rem 3rem}.inspector-main h2{font-size:1.65rem;
    line-height:1.2;margin:.4rem 0 1rem;letter-spacing:-.03em}.eyebrow{text-transform:uppercase;
    font-weight:750;font-size:.7rem;letter-spacing:.12em;color:var(--accent)}
  .eyebrow span{padding:0 .4rem;color:var(--muted)}
  .inspector-tags{display:flex;gap:.4rem;flex-wrap:wrap;margin:1rem 0}
  .inspector-tags span{background:var(--surface-hover);color:var(--muted);border:1px solid var(--line);
    padding:.22rem .55rem;border-radius:6px;font-size:.78rem}.inspector-tags .rarity{color:var(--accent)}
  .prereq{font-size:.85rem;color:var(--muted);border-left:2px solid var(--accent);padding-left:.85rem}
  .prereq strong{color:var(--text);display:block}
  .description{color:var(--text);line-height:1.72;font-size:.9rem;overflow-wrap:anywhere}
  .description :global(a[data-uuid]),.description :global(a[data-pf2e-uuid]),
  .description :global(a[data-pf2e-action]){color:var(--accent);text-decoration:underline;
    text-decoration-style:dotted;text-underline-offset:3px;cursor:pointer}
  .description :global(table){border-collapse:collapse;display:block;overflow:auto}
  .description :global(td),.description :global(th){border:1px solid var(--line);padding:.4rem}
  .description :global(.pf2e-inline){display:inline;padding:.14rem .37rem;border:1px solid var(--line);
    border-radius:5px;background:var(--surface-hover);font-size:.92em}
  .description :global(.pf2e-damage){color:var(--danger);border-color:var(--danger-border)}
  .description :global(.pf2e-template){color:var(--good)}
  .description :global(.pf2e-check){color:var(--accent)}
  .inspector-footer{display:grid;gap:.3rem;margin-top:2rem;padding-top:1rem;
    border-top:1px solid var(--line);font-size:.75rem;color:var(--muted)}
  .hover-preview{position:fixed;width:min(320px,80vw);max-height:200px;overflow:hidden;z-index:2000;
    padding:.9rem 1rem;border:1px solid var(--accent);border-radius:11px;
    background:var(--surface-strong);box-shadow:0 15px 60px #0005;color:var(--text);
    pointer-events:none;font-size:.82rem}
  .hover-preview strong{display:block;font-size:1rem;margin:.4rem 0}.hover-preview p{color:var(--muted)}
  .hover-preview small{color:var(--muted)}
  .inspector-empty{text-align:center;margin:auto;padding:3rem 1.6rem;color:var(--muted)}
  .inspector-empty h3{color:var(--text)}.spark{font-size:3.1rem;color:var(--accent)}
</style>
