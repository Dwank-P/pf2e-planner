<script>
  import {onMount} from 'svelte';
  import ThemePicker from '$lib/ThemePicker.svelte';
  let campaignId=$state('');
  let characters=$state([]);
  let loading=$state(true);
  let busy=$state(false);
  let errorText=$state('');
  let newName=$state('');
  async function fetchCharacters(){
    loading=true;errorText='';
    try{
      const r=await fetch('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters',
        {credentials:'same-origin'});
      const data=await r.json();
      if(!r.ok)throw Error(data.message||'Cannot load characters');
      characters=data.characters;
    }catch(e){errorText=e.message;}finally{loading=false;}
  }
  async function create(event){
    event.preventDefault();if(!newName.trim()||busy)return;
    busy=true;errorText='';
    try{
      const r=await fetch('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters',{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
        body:JSON.stringify({name:newName.trim(),level:1,build:{}})
      });
      const result=await r.json();
      if(!r.ok)throw Error(result.message||'Cannot create character');
      location.href='/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+result.character.id;
    }catch(e){errorText=e.message;busy=false;}
  }
  onMount(()=>{campaignId=decodeURIComponent(location.pathname.split('/')[2]||'');fetchCharacters();});
</script>
<svelte:head><title>Characters · PF2e Planner</title></svelte:head>
<div class="app-shell">
  <header class="top">
    <div><a class="back" href="/">← Campaigns</a><div class="kicker">Character workshop</div><h1>Your characters</h1>
      <p class="muted">Create, level and customize builds with the compendiums synchronized for this campaign.</p></div>
    <ThemePicker/>
  </header>
  <section class="panel creator">
    <div><h2>Start a new build</h2><p class="muted">You can always change your ancestry, class and choices later.</p></div>
    <form onsubmit={create}><label for="new-name" class="sr">Character name</label>
      <input id="new-name" required maxlength="80" placeholder="Character name" bind:value={newName}/>
      <button class="primary-action" disabled={busy}>Create character →</button></form>
  </section>
  {#if errorText}<p role="alert" class="error">{errorText}</p>{/if}
  <section class="roster">
    <h2>Saved characters</h2>
    {#if loading}<p>Loading characters…</p>
    {:else if characters.length===0}<div class="empty panel">No characters yet. Create one above to begin.</div>
    {:else}
      <div class="cards">
        {#each characters as character (character.id)}
          <a class="card panel" href={'/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+character.id}>
            <div class="crest">✧</div>
            <div><span class="kicker">Level {character.level}</span><h3>{character.name}</h3>
              <p>{Object.keys(character.build.feats||{}).length} selected feats ·
                 {character.build.equipment?.length||0} equipment items</p>
              <small>Updated {new Date(character.updatedAt*1000).toLocaleDateString()} · {character.ownerName||'You'}</small>
            </div>
            <span class="arrow">↗</span>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</div>
<style>
  .top{display:flex;align-items:start;justify-content:space-between;gap:1rem;margin:1rem 0 2.2rem}
  .back{display:inline-block;color:var(--muted);text-decoration:none;margin-bottom:1.3rem}
  h1{font-size:clamp(2rem,4vw,3rem);margin:.4rem 0}.creator{padding:1.7rem;display:flex;
    justify-content:space-between;gap:2rem;align-items:center}
  .creator h2{margin:0}.creator p{margin:.3rem 0}
  form{display:flex;gap:.7rem;align-items:center;flex-wrap:wrap}
  input{min-width:250px;background:var(--page-bg)}h2{margin-top:2.4rem}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem}
  .card{padding:1.2rem;display:flex;align-items:center;gap:1.1rem;text-decoration:none;color:var(--text);
    transition:transform .17s,border-color .17s}.card:hover{transform:translateY(-3px);border-color:var(--accent)}
  .card h3{margin:.3rem 0;font-size:1.2rem}.card p,.card small{color:var(--muted);margin:.3rem 0}
  .crest{height:58px;width:58px;border:1px solid var(--accent);background:var(--accent-bg);
    display:grid;place-items:center;color:var(--accent);border-radius:12px;font-size:1.8rem;flex-shrink:0}
  .arrow{margin-left:auto;color:var(--accent)}.empty{padding:4rem;text-align:center;color:var(--muted)}
  .error{color:var(--danger)}.sr{position:absolute;clip:rect(0,0,0,0);width:1px;height:1px;overflow:hidden}
  @media(max-width:740px){.creator,.top{flex-direction:column;align-items:stretch}
    form{flex-direction:column;align-items:stretch}input{min-width:unset}}
</style>
