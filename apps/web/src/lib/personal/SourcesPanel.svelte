<script>
  import {api,timeAgo} from '../ui/api.js';
  /**
   * A personal character's own rules and sources: which packages (systems, modules, a world's
   * own compendiums) it uses, each from one world that shares compendiums with the player.
   */
  let {character,onClose,onSaved}=$props();
  const PF2E=[['freeArchetype','Free Archetype'],['dualClass','Dual Class'],['ancestralParagon','Ancestral Paragon'],
    ['gradualAbilityBoosts','Gradual Ability Boosts'],['proficiencyWithoutLevel','Proficiency Without Level'],
    ['mythic','Mythic'],['ignoreArchetypeDedicationLock','Ignore the archetype dedication lock']];
  const ABP=[['noABP','No Automatic Bonus Progression'],['ABPFundamentalPotency','ABP: fundamental potency only'],['ABPRulesAsWritten','ABP: rules as written']];
  let variants=$state({...(character.variants??{})});
  let available=$state(null);
  // package → integrationId ('' = not used)
  let chosen=$state(Object.fromEntries((character.sources??[]).map(s=>[s.package,s.integrationId])));
  let busy=$state(false);
  let error=$state('');
  let filter=$state('');
  $effect(()=>{
    api('/api/v1/personal/sources?system='+character.system).then(r=>available=r.sources).catch(e=>error=e.message);
  });
  const missing=$derived((character.sources??[]).filter(s=>!s.available));
  const shown=$derived((available??[]).filter(p=>!filter.trim()||p.package.toLowerCase().includes(filter.trim().toLowerCase())));
  const count=$derived(Object.values(chosen).filter(Boolean).length);
  function toggle(p,on){chosen={...chosen,[p.package]:on?(chosen[p.package]||p.worlds[0].integrationId):''};}
  function everything(){chosen=Object.fromEntries((available??[]).map(p=>[p.package,chosen[p.package]||p.worlds[0].integrationId]));}
  async function save(){
    busy=true;error='';
    try{
      const sources=Object.entries(chosen).filter(([,id])=>id).map(([name,integrationId])=>({package:name,integrationId}))
        .filter(s=>(available??[]).some(p=>p.package===s.package&&p.worlds.some(w=>w.integrationId===s.integrationId)));
      const r=await api('/api/v1/personal/'+encodeURIComponent(character.id)+'/setup',{method:'PUT',body:{variants,sources}});
      onSaved(r);onClose();
    }catch(e){error=e.message;}finally{busy=false;}
  }
</script>
<div class="scrim" role="presentation" onclick={onClose}></div>
<div class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="sources-title">
  <h2 id="sources-title">Rules &amp; sources</h2>
  <section class="group">
    <h3>Rules</h3>
    {#if character.system==='dnd5e'}
      <div class="seg" role="radiogroup" aria-label="Rules edition">
        <label class:on={variants.rulesVersion!=='legacy'}><input type="radio" value="modern" bind:group={variants.rulesVersion}/> 2024 rules</label>
        <label class:on={variants.rulesVersion==='legacy'}><input type="radio" value="legacy" bind:group={variants.rulesVersion}/> 2014 rules</label>
      </div>
      <label class="check"><input type="checkbox" checked={variants.allowFeats!==false} onchange={e=>variants={...variants,allowFeats:e.currentTarget.checked}}/> Feats instead of ability score improvements</label>
    {:else}
      {#each PF2E as [key,label]}
        <label class="check"><input type="checkbox" checked={variants[key]===true} onchange={e=>variants={...variants,[key]:e.currentTarget.checked}}/> {label}</label>
      {/each}
      <label class="field" for="abp">Automatic Bonus Progression
        <select id="abp" value={variants.automaticBonusProgression??'noABP'} onchange={e=>variants={...variants,automaticBonusProgression:e.currentTarget.value}}>
          {#each ABP as [value,label]}<option {value}>{label}</option>{/each}</select></label>
      <p class="hint">These rules are this character’s own, whatever the source worlds use.</p>
    {/if}
  </section>
  <section class="group">
    <div class="head"><h3>Sources <small>{count} chosen</small></h3>
      {#if available?.length}<button class="link" onclick={everything}>Use everything</button>{/if}</div>
    {#if missing.length}
      <p class="notice">No longer shared: {missing.map(s=>s.package+' ('+s.title+')').join(', ')}. Items already picked from them are kept.</p>
    {/if}
    {#if available===null&&!error}
      <p class="muted">Loading…</p>
    {:else if !available?.length}
      <p class="muted">No synced {character.system==='dnd5e'?'D&D 5e':'PF2e/SF2e'} world is available to you: join a campaign,
        or ask a GM to share their compendiums with every account (campaign settings).</p>
    {:else}
      {#if available.length>8}<input type="search" placeholder="Filter packages…" bind:value={filter} aria-label="Filter packages"/>{/if}
      <ul class="packages">
        {#each shown as p (p.package)}
          {@const on=!!chosen[p.package]}
          <li class:on>
            <label class="check"><input type="checkbox" checked={on} onchange={e=>toggle(p,e.currentTarget.checked)}/>
              <span class="num">{p.package}</span></label>
            {#if p.worlds.length>1}
              <select aria-label={'World for '+p.package} disabled={!on} value={chosen[p.package]||p.worlds[0].integrationId}
                onchange={e=>chosen={...chosen,[p.package]:e.currentTarget.value}}>
                {#each p.worlds as w}<option value={w.integrationId}>{w.title} · {w.items.toLocaleString()} items · synced {timeAgo(w.updatedAt)}</option>{/each}
              </select>
            {:else}
              <small class="muted">{p.worlds[0].title} · {p.worlds[0].items.toLocaleString()} items</small>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  <div class="row"><button class="btn ghost" onclick={onClose}>Cancel</button>
    <button class="btn primary" disabled={busy||available===null} onclick={save}>{busy?'Saving…':'Save'}</button></div>
</div>
<style>
  .scrim{position:fixed;inset:0;background:var(--overlay);z-index:60}
  .dialog{position:fixed;z-index:61;top:50%;left:50%;transform:translate(-50%,-50%);width:min(620px,calc(100vw - 32px));
    max-height:calc(100vh - 48px);overflow:auto;padding:20px;display:grid;gap:16px;box-shadow:var(--shadow)}
  h2{font-size:1.15rem}
  h3{font-size:.95rem;margin:0}
  h3 small{color:var(--muted);font-weight:500;margin-left:6px}
  .group{display:grid;gap:8px}
  .head{display:flex;justify-content:space-between;align-items:center}
  .check{display:flex;gap:8px;align-items:center}
  .hint{color:var(--muted);font-size:.82rem;margin:0}
  .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;width:max-content}
  .seg label{padding:6px 12px;cursor:pointer;color:var(--text-2)}
  .seg label.on{background:var(--panel-3);color:var(--text);font-weight:700}
  .seg input{position:absolute;opacity:0;pointer-events:none}
  .packages{list-style:none;margin:0;padding:0;display:grid;gap:2px}
  .packages li{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:10px;align-items:center;padding:6px 8px;border-radius:8px}
  .packages li.on{background:var(--brass-soft)}
  .packages select{width:100%;min-width:0}
  .packages .num{overflow-wrap:anywhere}
  .link{background:none;border:0;color:var(--brass);text-decoration:underline;padding:0}
  .row{display:flex;justify-content:flex-end;gap:8px}
  @media(max-width:560px){.packages li{grid-template-columns:1fr}}
</style>
