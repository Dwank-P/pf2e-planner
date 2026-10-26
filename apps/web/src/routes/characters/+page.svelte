<script>
  import AppBar from '../../lib/ui/AppBar.svelte';
  import ImportCharacter from '../../lib/ui/ImportCharacter.svelte';
  import {api,timeAgo} from '../../lib/ui/api.js';
  import {requireSession} from '../../lib/ui/session.js';
  /** My characters: personal characters outside any campaign, and those shared with me. */
  let session=$state(null);
  let list=$state(null);
  let error=$state('');
  let creating=$state(false);
  let name=$state('');
  let system=$state('pf2e');
  let busy=$state(false);
  let importing=$state(false);
  $effect(()=>{
    (async()=>{
      try{session=await requireSession();list=await api('/api/v1/personal');}
      catch(e){error=e.message;}
    })();
  });
  const mine=$derived((list?.characters??[]).filter(c=>c.ownerUserId===session?.user.id));
  const shared=$derived((list?.characters??[]).filter(c=>c.ownerUserId!==session?.user.id));
  const SYSTEM={pf2e:'PF2e / SF2e',dnd5e:'D&D 5e'};
  async function create(event){
    event.preventDefault();busy=true;error='';
    try{
      const r=await api('/api/v1/personal',{method:'POST',body:{name:name.trim(),system}});
      location.href='/characters/'+encodeURIComponent(r.character.id);
    }catch(e){error=e.message;busy=false;}
  }
  const line=c=>[c.summary?.ancestry??c.summary?.background,c.summary?.className].filter(Boolean).join(' · ');
</script>
<svelte:head><title>My characters · PF2e Planner</title></svelte:head>
{#if session}<AppBar me={session.user} campaigns={session.campaigns} crumb="My characters"/>{/if}
<main class="page">
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  <section class="head">
    <span class="eyebrow">Personal</span>
    <h1>My characters</h1>
    <p class="muted">Characters of your own, outside any campaign. Each picks its rules and the compendiums it uses
      from worlds that share them with you — mix a module from one world with a system from another. Only you
      and the people you share with can see them; copy one into a campaign when it’s ready.</p>
  </section>
  {#if list}
    {#if !list.sharedWorlds.pf2e&&!list.sharedWorlds.dnd5e}
      <p class="notice">No synced world is available to you yet. Join a campaign whose GM has synced it, or ask a GM to share
        their compendiums with every account (campaign settings).</p>
    {/if}
    <section class="grid" aria-label="Your personal characters">
      {#each mine as c (c.id)}
        <a class="card" href={'/characters/'+encodeURIComponent(c.id)}>
          <span class="top"><b>{c.name}</b><span class="badge">{SYSTEM[c.system]}</span></span>
          <span class="muted">{line(c)||'Not started'}</span>
          <small class="muted">Level {c.level} · updated {timeAgo(c.updatedAt)}</small>
        </a>
      {/each}
      {#if creating}
        <form class="card new-form" onsubmit={create}>
          <label class="field" for="new-name">Character name
            <input id="new-name" required maxlength="80" bind:value={name} placeholder="e.g. Ezren"/></label>
          <div class="seg" role="radiogroup" aria-label="Game system">
            {#each Object.entries(SYSTEM) as [value,label]}
              <label class:on={system===value}><input type="radio" {value} bind:group={system}/> {label}</label>
            {/each}
          </div>
          <div class="row"><button type="button" class="btn ghost" onclick={()=>creating=false}>Cancel</button>
            <button class="btn primary" disabled={busy||!name.trim()}>Create</button></div>
        </form>
      {:else if importing}
        <ImportCharacter importUrl="/api/v1/personal/import" personal onCancel={()=>importing=false}/>
      {:else}
        <button class="card new" onclick={()=>creating=true}><span class="plus" aria-hidden="true">+</span><b>New character</b>
          <small>Choose rules and sources next</small></button>
        <button class="card new" onclick={()=>importing=true}><span class="plus" aria-hidden="true">⇄</span><b>Import a character</b>
          <small>A public link from any planner, or an exported file</small></button>
      {/if}
    </section>
    {#if shared.length}
      <h2>Shared with me</h2>
      <section class="grid" aria-label="Shared with me">
        {#each shared as c (c.id)}
          <a class="card" href={'/characters/'+encodeURIComponent(c.id)}>
            <span class="top"><b>{c.name}</b><span class="badge">{SYSTEM[c.system]}</span></span>
            <span class="muted">{line(c)||'Not started'}</span>
            <small class="muted">{c.ownerName} · {c.access.edit?'can edit':'view only'}</small>
          </a>
        {/each}
      </section>
    {/if}
  {:else if !error}
    <p class="muted">Loading…</p>
  {/if}
</main>
<style>
  .page{display:grid;gap:18px;max-width:1100px}
  .head{display:grid;gap:6px}
  .head p{max-width:70ch;margin:0}
  h1{font-size:clamp(1.6rem,3.5vw,2.2rem);font-weight:800}
  h2{font-size:1.1rem;margin:8px 0 0}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
  .card{display:grid;gap:4px;align-content:start;padding:14px;border:1px solid var(--line);border-radius:var(--radius);
    background:var(--panel);color:var(--text);text-decoration:none;text-align:left}
  a.card:hover{border-color:var(--brass)}
  .top{display:flex;justify-content:space-between;gap:8px;align-items:center}
  .badge{font:600 .68rem var(--mono);text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:1px 5px;white-space:nowrap}
  .card.new{border-style:dashed;justify-items:center;text-align:center;color:var(--text-2);cursor:pointer;min-height:110px;align-content:center}
  .plus{font-size:1.4rem;color:var(--brass)}
  .new-form{gap:10px}
  .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;width:max-content}
  .seg label{padding:6px 12px;cursor:pointer;color:var(--text-2)}
  .seg label.on{background:var(--panel-3);color:var(--text);font-weight:700}
  .seg input{position:absolute;opacity:0;pointer-events:none}
  .row{display:flex;justify-content:flex-end;gap:8px}
</style>
