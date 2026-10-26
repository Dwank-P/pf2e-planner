<script>
  import {page} from '$app/state';
  import AppBar from '../../../lib/ui/AppBar.svelte';
  import Traits from '../../../lib/ui/Traits.svelte';
  import {api,campaignPath,timeAgo} from '../../../lib/ui/api.js';
  import {loadCampaign} from '../../../lib/ui/session.js';

  const campaignId=$derived(page.params.campaignId);
  let ctx=$state(null);
  let characters=$state([]);
  let error=$state('');
  let creating=$state(false);
  let newName=$state('');
  let busy=$state(false);

  $effect(()=>{
    const id=campaignId;
    ctx=null;error='';
    (async()=>{
      try{
        const loaded=await loadCampaign(id);
        const list=await api('/api/v1/campaigns/'+encodeURIComponent(id)+'/characters');
        if(id!==campaignId)return;
        ctx=loaded;characters=list.characters;
      }catch(e){error=e.message;}
    })();
  });
  const mine=$derived(characters.filter(c=>c.ownerUserId===ctx?.me.id));
  const others=$derived(characters.filter(c=>c.ownerUserId!==ctx?.me.id));
  const variantNames={freeArchetype:'Free Archetype',dualClass:'Dual Class',ancestralParagon:'Ancestral Paragon',
    gradualAbilityBoosts:'Gradual Boosts',automaticBonusProgression:'Automatic Bonus Progression',
    proficiencyWithoutLevel:'Proficiency Without Level',mythic:'Mythic',stamina:'Stamina'};
  const dnd5e=$derived(ctx?.campaign?.system_id==='dnd5e');
  // D&D 5e worlds show their rules edition and optional scores instead of PF2e variant rules.
  const variants=$derived(dnd5e?[ctx?.sync?.variants?.rulesVersion==='modern'?'2024 rules':'2014 rules',
      ...(ctx?.sync?.variants?.honorScore?['Honor']:[]),...(ctx?.sync?.variants?.sanityScore?['Sanity']:[])]
    :Object.entries(ctx?.sync?.variants??{}).filter(([,on])=>on===true).map(([k])=>variantNames[k]??k));

  async function create(event){
    event.preventDefault();
    busy=true;error='';
    try{
      const result=await api('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters',
        {method:'POST',body:{name:newName.trim(),level:1,build:{}}});
      location.href=campaignPath(campaignId,'/characters/'+result.character.id);
    }catch(e){error=e.message;busy=false;}
  }
  // Pathbuilder import: by JSON id (Export → Export JSON), or a pasted export.
  let importing=$state(false);
  let pbId=$state('');
  let pbJson=$state('');
  let imported=$state(null);
  async function importPathbuilder(event){
    event.preventDefault();
    busy=true;error='';
    try{
      let body=pbJson.trim()?{json:pbJson.trim()}:{pathbuilderId:pbId.trim()};
      if(!pbJson.trim()){
        // Pathbuilder allows cross-site reads, so this browser fetches the export itself;
        // the server fetches it only if that fails.
        if(!/^\d{3,9}$/.test(pbId.trim()))throw Error('Enter the Pathbuilder JSON ID (the number from Export → Export JSON).');
        const response=await fetch('https://pathbuilder2e.com/json.php?id='+encodeURIComponent(pbId.trim()),
          {credentials:'omit',referrerPolicy:'no-referrer'}).catch(()=>null);
        const json=response?await response.json().catch(()=>null):null;
        if(json?.success===false)throw Error('Pathbuilder has no character with that ID. Check the number and that the export is still shared.');
        if(json?.build)body={json};
      }
      imported=await api('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters/import-pathbuilder',{method:'POST',body});
      characters=[imported.character,...characters];
      importing=false;pbId='';pbJson='';
    }catch(e){error=e.message;}finally{busy=false;}
  }
  function describe(c){
    const s=c.summary??{};
    const parts=[s.heritage??s.ancestry,[s.className,s.dualClassName].filter(Boolean).join(' / ')].filter(Boolean);
    return parts.length?parts.join(' '):'Not created yet';
  }
  const progress=c=>c.summary?.created?Math.max(5,Math.round(100*(c.summary.plannedTo??1)/20)):3;
</script>
<svelte:head><title>{ctx?.campaign.title??'Campaign'} · PF2e Planner</title></svelte:head>

{#if ctx}
  <AppBar me={ctx.me} campaigns={ctx.campaigns} campaign={ctx.campaign} sync={ctx.sync}>
    {#snippet actions()}
      {#if ctx.isGm}<a class="btn ghost" href={campaignPath(campaignId,'/settings')}>Campaign settings</a>{/if}
    {/snippet}
  </AppBar>
{/if}
<main class="page">
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if ctx}
    <section class="head">
      <div>
        <span class="eyebrow">Party</span>
        <h1>{ctx.campaign.title}</h1>
      </div>
      {#if variants.length}
        <div class="variants" aria-label="Variant rules">{#each variants as v}<span class="chip plain">{v}</span>{/each}</div>
      {/if}
    </section>
    {#if !ctx.sync?.synced}
      <p class="notice warn">This campaign hasn’t synced its compendiums yet.
        {ctx.isGm?'In Foundry, open Settings → '+(dnd5e?'Planner Bridge (D&D 5e)':'PF2e Planner Bridge')+' → Sync Now.':'Ask your GM to run Sync Now in Foundry.'}</p>
    {/if}

    <section class="grid" aria-label="Your characters">
      {#each mine as c (c.id)}{@render card(c)}{/each}
      {#if creating}
        <form class="card new-form" onsubmit={create}>
          <label class="field" for="new-name">Character name
            <input id="new-name" required maxlength="80" bind:value={newName} placeholder="e.g. Amiri"/></label>
          <div class="row">
            <button type="button" class="btn ghost" onclick={()=>creating=false}>Cancel</button>
            <button class="btn primary" disabled={busy||!newName.trim()}>Start the wizard</button>
          </div>
        </form>
      {:else if importing}
        <form class="card new-form" onsubmit={importPathbuilder}>
          <label class="field" for="pb-id">Pathbuilder JSON ID
            <small>In Pathbuilder: menu → Export → Export JSON, then copy the number it shows.</small>
            <input id="pb-id" inputmode="numeric" pattern="[0-9]*" maxlength="9" bind:value={pbId} placeholder="e.g. 123456" disabled={!!pbJson.trim()}/></label>
          <details><summary class="muted small">Or paste the exported JSON</summary>
            <textarea rows="4" aria-label="Pathbuilder JSON" bind:value={pbJson}></textarea></details>
          <div class="row">
            <button type="button" class="btn ghost" onclick={()=>importing=false}>Cancel</button>
            <button class="btn primary" disabled={busy||!(pbId.trim()||pbJson.trim())}>{busy?'Importing…':'Import'}</button>
          </div>
        </form>
      {:else}
        <button class="card new" onclick={()=>creating=true}>
          <span class="plus" aria-hidden="true">+</span><b>New character</b>
          <small>{dnd5e?'Starts the D&D 5e planner':'Starts the Character Wizard'}</small>
        </button>
        {#if !dnd5e}<button class="card new" onclick={()=>{importing=true;imported=null;}}>
          <span class="plus" aria-hidden="true">⇩</span><b>Import from Pathbuilder</b>
          <small>From a Pathbuilder 2e JSON export</small>
        </button>{/if}
      {/if}
    </section>
    {#if imported}
      <section class="panel report" aria-live="polite">
        <div class="report-head"><h2>Imported {imported.character.name}</h2>
          <a class="btn primary" href={campaignPath(campaignId,'/characters/'+imported.character.id)}>Open character</a></div>
        <p class="muted">{imported.report.matched} choices matched this campaign's compendiums.
          {#each imported.report.placed as line}{line}. {/each}</p>
        {#if imported.report.missing.length}
          <p><b>Not found in your synced compendiums</b> (pick these yourself, or ask the GM to add the packs in Leveler):</p>
          <ul>{#each imported.report.missing as m}<li>{m.what}: {m.name}</li>{/each}</ul>
        {/if}
        {#if imported.report.notes.length}<ul class="notes">{#each imported.report.notes as n}<li>{n}</li>{/each}</ul>{/if}
        <button class="link" onclick={()=>imported=null}>Dismiss</button>
      </section>
    {/if}

    {#if others.length}
      <section class="others">
        <h2>{ctx.isGm?'Other players':'Shared with you'}</h2>
        <div class="grid">{#each others as c (c.id)}{@render card(c)}{/each}</div>
      </section>
    {/if}
  {:else if !error}
    <p class="muted">Loading the party…</p>
  {/if}
</main>

{#snippet card(c)}
  <a class="card" href={campaignPath(campaignId,'/characters/'+c.id)}>
    <div class="who">
      <span class="portrait" aria-hidden="true">{c.name.slice(0,1).toUpperCase()}</span>
      <div class="names"><h3>{c.name}</h3><small>{describe(c)} · level {c.level}</small></div>
    </div>
    <Traits traits={[c.summary?.ancestry,c.summary?.className,c.summary?.subclass].filter(Boolean).map(x=>x.toLowerCase())}/>
    <div class="meter" aria-label={c.summary?.created?`Planned to level ${c.summary.plannedTo??1}`:'In creation'}>
      <i style:width={progress(c)+'%'}></i>
    </div>
    <div class="foot">
      <span>{c.summary?.created?(c.summary.plannedTo?`Planned to ${c.summary.plannedTo}`:'Created'):'In creation'}</span>
      <span class:linked={c.linked}>{c.linked?'● In Foundry':ctx.me.id!==c.ownerUserId?c.ownerName+(c.access?.edit===false?' · view only':''):timeAgo(c.updatedAt)}</span>
    </div>
  </a>
{/snippet}

<style>
  .head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:20px}
  h1{font-size:clamp(1.7rem,3.5vw,2.3rem);font-weight:800;margin-top:4px}
  h2{font-size:1.1rem;margin:28px 0 12px}
  .variants{display:flex;gap:6px;flex-wrap:wrap}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-lg);padding:16px;display:grid;gap:12px;
    color:var(--text);text-decoration:none;align-content:start;transition:border-color .15s,transform .15s}
  a.card:hover{border-color:var(--brass);transform:translateY(-1px)}
  .who{display:flex;gap:12px;align-items:center;min-width:0}
  .portrait{width:46px;height:46px;flex:none;border-radius:11px;display:grid;place-items:center;font:800 18px var(--display);
    color:var(--brass);background:linear-gradient(160deg,var(--brass-soft),var(--panel-3))}
  .names{min-width:0}
  h3{font-size:1.05rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .names small{color:var(--muted)}
  .meter{height:6px;border-radius:3px;background:var(--panel-3);overflow:hidden}
  .meter i{display:block;height:100%;background:var(--brass)}
  .foot{display:flex;justify-content:space-between;gap:8px;font:500 12px var(--mono);color:var(--muted)}
  .linked{color:var(--good)}
  .new{border-style:dashed;background:transparent;place-content:center;text-align:center;min-height:170px;color:var(--muted);font:inherit}
  .new:hover{border-color:var(--brass);color:var(--text)}
  .new b{color:var(--text);font-family:var(--display);font-size:1rem}
  .plus{font:300 2rem/1 var(--display);color:var(--brass)}
  .new-form{min-height:170px;align-content:center}
  .new-form textarea{width:100%;margin-top:6px;font:400 .8rem var(--mono)}
  .report{padding:16px 18px;margin-top:16px;display:grid;gap:8px}
  .report-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .report h2{margin:0}
  .report ul{margin:0;padding-left:1.1rem;font-size:.9rem}
  .report .notes{color:var(--text-2)}
  .small{font-size:.84rem}
  .row{display:flex;justify-content:flex-end;gap:8px}
</style>
