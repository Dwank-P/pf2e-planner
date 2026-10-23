<script>
  import { onMount } from 'svelte';
  let campaignId = $state('');
  let report = $state(null);
  let feats = $state([]);
  let total = $state(0);
  let page = $state(1);
  let pages = $state(1);
  let loading = $state(true);
  let errorText = $state('');
  let q = $state('');
  let level = $state('');
  let rarity = $state('');
  let trait = $state('');
  let pack = $state('');
  let featType = $state('');
  let selected = $state(null);
  let detailError = $state('');
  let history = $state([]);
  let detailLoading = $state(false);
  let timer;

  async function get(path) {
    const response = await fetch(path, {credentials:'same-origin',cache:'no-store'});
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw Error(result.message || 'Request failed (HTTP ' + response.status + ')');
    return result;
  }
  async function load(reset=false) {
    if(reset) page = 1;
    loading = true;
    errorText = '';
    try {
      const params=new URLSearchParams({type:'feat',page:String(page)});
      for(const [k,v] of Object.entries({q,level,rarity,trait,pack,featType}))if(v)params.set(k,v);
      const data=await get('/api/v1/campaigns/'+encodeURIComponent(campaignId)+
        '/catalog-items?'+params.toString());
      feats=data.items;
      total=data.total;
      pages=data.pages||1;
    }catch(error){errorText=error.message;feats=[];}
    finally{loading=false;}
  }
  function searchChanged() {
    clearTimeout(timer);
    timer=setTimeout(()=>load(true),250);
  }
  function itemUrl(uuid) {
    return '/api/v1/campaigns/'+encodeURIComponent(campaignId)+
      '/catalog-item?uuid='+encodeURIComponent(uuid);
  }
  async function openReference(url,pushHistory=true) {
    if(detailLoading)return;
    detailLoading=true;
    detailError='';
    try{
      const response=await get(url);
      if(pushHistory && selected?.uuid)history=[...history,selected.uuid];
      selected=response.item;
    }catch(error){
      detailError='Referenced item is not in the synchronized catalogue: '+error.message+
        '. Check that its compendium pack is selected in Foundry, then Sync Now.'+
        ' Some Foundry actions are system macros without a standalone Item.';
    }finally{detailLoading=false;}
  }
  async function openItem(uuid,pushHistory=true) {
    return openReference(itemUrl(uuid),pushHistory);
  }
  async function openAction(slug) {
    return openReference('/api/v1/campaigns/'+encodeURIComponent(campaignId)+
      '/catalog-item?slug='+encodeURIComponent(slug));
  }
  async function back() {
    if(!history.length)return;
    const last=history[history.length-1];
    history=history.slice(0,-1);
    await openItem(last,false);
  }
  function close(){selected=null;detailError='';history=[];}
  function descriptionClick(event) {
    const target=event.target.closest?.('[data-pf2e-uuid], [data-uuid], [data-pf2e-action]');
    if(!target)return;
    const uuid=target.getAttribute('data-pf2e-uuid')||target.getAttribute('data-uuid');
    const slug=target.getAttribute('data-pf2e-action');
    if(!uuid?.startsWith('Compendium.') && !slug)return;
    event.preventDefault();
    event.stopPropagation();
    if(uuid?.startsWith('Compendium.'))openItem(uuid);
    else openAction(slug);
  }
  onMount(async()=>{
    campaignId=decodeURIComponent(window.location.pathname.split('/')[2]||'');
    try{
      report=await get('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/catalog-summary');
    }catch(error){errorText=error.message;}
    await load();
    return ()=>clearTimeout(timer);
  });
  const packs=$derived([...(report?.sources?.feats||[])].map(x=>x.label));
  const badge=(value)=>value === null||value === undefined||value===''?'—':String(value);
</script>

<svelte:head><title>Feat Compendium Browser — PF2e Planner</title></svelte:head>
<main>
  <nav><a href={'/campaigns/'+encodeURIComponent(campaignId)+'/ruleset'}>← Ruleset details</a> <a href="/">Campaigns</a></nav>
  <h1>Feat Compendium Browser</h1>
  <p>Search the feat Items imported from this Foundry world's selected compendiums.</p>
  {#if report?.synced}
    <p class="small">System: <strong>{report.ruleset.systemId} {report.ruleset.systemVersion}</strong> ·
    Saved feats: <strong>{report.totals.feats}</strong> · Last imported:
      {new Date(report.updatedAt*1000).toLocaleString()}</p>
  {/if}
  <section class="search">
    <label class="wide">Name
      <input type="search" placeholder="Search for a feat…" bind:value={q} oninput={searchChanged}/>
    </label>
    <label>Level
      <select bind:value={level} onchange={()=>load(true)}>
        <option value="">All levels</option>
        {#each Array.from({length:21},(_,i)=>i) as n}<option value={n}>{n}</option>{/each}
      </select>
    </label>
    <label>Rarity
      <select bind:value={rarity} onchange={()=>load(true)}>
        <option value="">All rarities</option>
        {#each ['common','uncommon','rare','unique'] as r}<option value={r}>{r}</option>{/each}
      </select>
    </label>
    <label>Feat category
      <select bind:value={featType} onchange={()=>load(true)}>
        <option value="">All categories</option>
        {#each ['class','ancestry','skill','general','archetype','bonus','feature'] as t}
          <option value={t}>{t}</option>
        {/each}
      </select>
    </label>
    <label>Compendium
      <select bind:value={pack} onchange={()=>load(true)}>
        <option value="">All imported packs</option>
        {#each packs as p}<option value={p}>{p}</option>{/each}
      </select>
    </label>
    <label class="wide">Trait
      <input type="search" placeholder="e.g. fighter, archetype, skill" bind:value={trait}
        oninput={searchChanged}/>
    </label>
    <button type="button" class="quiet" onclick={()=>{
      q='';level='';rarity='';pack='';trait='';featType='';load(true);
    }}>Clear filters</button>
  </section>
  {#if errorText}<p role="alert" class="error">{errorText}</p>{/if}
  {#if !report?.complete}
    <p class="warning">The full compendium is not yet published. Use Sync Now in the updated Foundry module.</p>
  {/if}
  <section>
    <div class="header"><h2>Feats ({total})</h2><span>{loading?'Loading…':'Page '+page+' of '+pages}</span></div>
    {#if feats.length}
      <div class="results">
      {#each feats as feat (feat.uuid)}
        <button class="feat" type="button" onclick={()=>openItem(feat.uuid)}>
          <span><strong>{feat.name}</strong><small>{feat.pack} · {feat.traits.join(', ')}</small></span>
          <span class="rank">Lv {badge(feat.level)}<small>{badge(feat.rarity)}</small></span>
        </button>
      {/each}
      </div>
    {:else if !loading}
      <p>No matching feats have been synchronized.</p>
    {/if}
    <div class="pager"><button type="button" disabled={page<=1||loading}
      onclick={()=>{page--;load();}}>← Previous</button>
      <button type="button" disabled={page>=pages||loading}
        onclick={()=>{page++;load();}}>Next →</button></div>
  </section>

  {#if selected}
    <div class="overlay" role="presentation" onclick={(event)=>{if(event.target===event.currentTarget)close();}}>
      <div class="detail" role="dialog" aria-modal="true" aria-label={selected.name}>
        <div class="detail-nav">
          <button type="button" class="quiet" disabled={!history.length||detailLoading} onclick={back}>← Back</button>
          <button type="button" class="quiet" onclick={close} aria-label="Close feat details">✕ Close</button>
        </div>
        <h2>{selected.name}</h2>
        <p><strong>{badge(selected.type).toUpperCase()}</strong> · Level {badge(selected.level)} · {badge(selected.rarity)} ·
           {selected.pack} · {badge(selected.metadata?.featType)}</p>
        <div class="traits">{#each selected.traits || [] as t}<span>{t}</span>{/each}</div>
        {#if selected.metadata?.prerequisites?.length}
          <p><strong>Prerequisites:</strong> {selected.metadata.prerequisites.join(', ')}</p>
        {/if}
        {#if detailError}<p class="error" role="alert">{detailError}</p>{/if}
        <div class="description" onclick={descriptionClick} role="presentation">
          {@html selected.description || '<p>No description in imported source.</p>'}
        </div>
        <hr/>
        <small>UUID: {selected.uuid}</small>
        <p class="small">Compendium references open other synchronized Items. Damage, checks and area templates are visual representations, not rolls or automated effects. Dynamic actor formulas require a character.</p>
      </div>
    </div>
  {/if}
</main>
<style>
 :global(body){margin:0;background:#101820;color:#eff4f7;font:16px system-ui,sans-serif}
 main{max-width:1150px;margin:auto;padding:2rem}h1{font-size:2.5rem}a{color:#afdafa}nav{display:flex;gap:2rem}
 section{padding:1.2rem;background:#1c2a35;border:1px solid #496070;border-radius:8px;margin:1rem 0}
 .search{display:flex;flex-wrap:wrap;align-items:end;gap:1rem}
 label{display:block;flex:1 1 145px;font-weight:650}.wide{flex-basis:240px}
 input,select{width:100%;box-sizing:border-box;padding:.7rem;margin-top:.4rem;background:#101c27;color:#fff;border:1px solid #668395;border-radius:4px}
 button{font:inherit;cursor:pointer;border:0;border-radius:5px;padding:.7rem 1rem;background:#b6d6e7;color:#172936}
 button:disabled{opacity:.45;cursor:not-allowed}.quiet{border:1px solid #6d8a9b;background:transparent;color:#eff4f7}
 .header,.pager{display:flex;justify-content:space-between;align-items:center;gap:1rem}
 .results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}
 .feat{text-align:left;display:flex;justify-content:space-between;align-items:center;gap:.8rem;background:#2a4050;color:#fff}
 .feat:hover,.feat:focus{background:#3a576b}.feat small,.rank small{display:block;color:#c0cdd5;margin-top:.25rem}
 .rank{text-align:right;white-space:nowrap}.small{font-size:.9rem;color:#bed0dd}.warning{color:#ffcf9a}.error{color:#ffc0c0}
 .pager{margin-top:1.2rem}.overlay{position:fixed;inset:0;background:#070c12c7;display:flex;align-items:center;justify-content:center;padding:1rem;z-index:1000}
 .detail{max-width:800px;width:100%;max-height:85vh;overflow:auto;padding:1.7rem;background:#233543;border:1px solid #81a4b5;border-radius:9px}
 .detail-nav{display:flex;justify-content:space-between;gap:1rem}.traits{display:flex;gap:.35rem;flex-wrap:wrap}
 .traits span{padding:.3rem .6rem;border:1px solid #8babbe;border-radius:5px}
 .description{line-height:1.65;overflow-wrap:anywhere}.description :global(a[data-uuid]),.description :global(a[data-pf2e-uuid]){cursor:pointer;color:#80cef7;text-decoration:underline}
 .description :global(table){border-collapse:collapse}.description :global(td),.description :global(th){border:1px solid #526f82;padding:.5rem}
 .description :global(h3){margin-top:1rem}
 .description :global(.pf2e-inline){display:inline-block;padding:.07rem .36rem;border-radius:.3rem;
   border:1px solid #6d93a8;background:#142c3d;line-height:1.5;white-space:normal}
 .description :global(.pf2e-damage){border-color:#c38b7d;background:#3a2626;color:#ffdfd3}
 .description :global(.pf2e-check){border-color:#85a2d5;background:#243353;color:#e3ecff}
 .description :global(.pf2e-template){border-color:#98bda0;background:#243b2e;color:#e0f6e5}
 .description :global(.pf2e-inline-icon){font-weight:bold;padding-right:.18rem}
 .description :global(.pf2e-action){color:#8bd0f3;text-decoration:underline;cursor:pointer}
 .description :global(.pf2e-unresolved){border-bottom:1px dashed #aaa;color:#b6c3ca}
 @media(max-width:750px){.results{grid-template-columns:1fr}main{padding:1rem}}
</style>
