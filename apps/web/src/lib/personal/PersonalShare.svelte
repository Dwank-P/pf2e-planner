<script>
  import {api} from '../ui/api.js';
  /** Share a personal character with any account (view or edit), and an optional public view link. */
  let {characterId,onClose}=$props();
  let shares=$state([]);
  let token=$state(null);
  let query=$state('');
  let found=$state([]);
  let busy=$state(false);
  let error=$state('');
  let copied=$state(false);
  const url='/api/v1/personal/'+encodeURIComponent(characterId)+'/sharing';
  $effect(()=>{api(url).then(r=>{shares=r.sharing.shares;token=r.sharing.publicToken;}).catch(e=>error=e.message);});
  const link=$derived(token?location.origin+'/p/'+token:'');
  let searchTimer;
  function search(){
    clearTimeout(searchTimer);
    const q=query.trim();
    if(q.length<2){found=[];return;}
    searchTimer=setTimeout(()=>api('/api/v1/people?q='+encodeURIComponent(q))
      .then(r=>found=r.people.filter(p=>!shares.some(s=>s.userId===p.id))).catch(e=>error=e.message),250);
  }
  function add(person){shares=[...shares,{userId:person.id,displayName:person.displayName,username:person.username,access:'view'}];found=[];query='';}
  async function save(publicLink='keep'){
    busy=true;error='';
    try{
      const r=await api(url,{method:'PUT',body:{shares:shares.map(s=>({userId:s.userId,access:s.access})),publicLink}});
      shares=r.sharing.shares;token=r.sharing.publicToken;
      if(publicLink==='keep')onClose();
    }catch(e){error=e.message;}finally{busy=false;}
  }
  async function copy(){
    try{await navigator.clipboard.writeText(link);copied=true;setTimeout(()=>copied=false,1500);}catch{}
  }
</script>
<div class="scrim" role="presentation" onclick={onClose}></div>
<div class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="pshare-title">
  <h2 id="pshare-title">Share character</h2>
  <section class="group">
    <h3>People</h3>
    <p class="hint">Anyone with an account here. Only you can change sharing, sources or delete it.</p>
    <div class="search">
      <input type="search" placeholder="Name or username…" bind:value={query} oninput={search} aria-label="Find a person"/>
      {#if found.length}
        <ul class="found">{#each found as p}<li><button onclick={()=>add(p)}><b>{p.displayName}</b> <small>@{p.username}</small></button></li>{/each}</ul>
      {/if}
    </div>
    {#each shares as s (s.userId)}
      <div class="person"><span><b>{s.displayName}</b><small>@{s.username}</small></span>
        <span class="controls">
          <select aria-label={'Access for '+s.displayName} value={s.access} onchange={e=>shares=shares.map(x=>x.userId===s.userId?{...x,access:e.currentTarget.value}:x)}>
            <option value="view">Can view</option><option value="edit">Can edit</option>
          </select>
          <button class="link danger" onclick={()=>shares=shares.filter(x=>x.userId!==s.userId)}>Remove</button>
        </span></div>
    {:else}<p class="muted small">Not shared with anyone yet.</p>{/each}
  </section>
  <section class="group">
    <h3>Public link</h3>
    <p class="hint">Anyone with the link can view the build without signing in. They can read the items it uses,
      but not follow links in their text to other items.</p>
    {#if token}
      <div class="linkrow"><input readonly value={link} aria-label="Public link" onfocus={e=>e.currentTarget.select()}/>
        <button class="btn small" onclick={copy}>{copied?'Copied':'Copy'}</button></div>
      <div class="row start"><button class="btn small ghost" disabled={busy} onclick={()=>save('regenerate')}>New link</button>
        <button class="btn small ghost danger" disabled={busy} onclick={()=>save('off')}>Turn off</button></div>
    {:else}
      <button class="btn small" disabled={busy} onclick={()=>save('on')}>Create a public link</button>
    {/if}
  </section>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  <div class="row"><button class="btn ghost" onclick={onClose}>Cancel</button>
    <button class="btn primary" disabled={busy} onclick={()=>save('keep')}>{busy?'Saving…':'Save'}</button></div>
</div>
<style>
  .scrim{position:fixed;inset:0;background:var(--overlay);z-index:60}
  .dialog{position:fixed;z-index:61;top:50%;left:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));
    max-height:calc(100vh - 48px);overflow:auto;padding:20px;display:grid;gap:16px;box-shadow:var(--shadow)}
  h2{font-size:1.15rem}
  h3{font-size:.95rem;margin:0}
  .group{display:grid;gap:8px}
  .hint{color:var(--muted);font-size:.82rem;margin:0}
  .search{position:relative}
  .search input{width:100%}
  .found{position:absolute;left:0;right:0;top:calc(100% + 4px);list-style:none;margin:0;padding:4px;background:var(--panel);
    border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);z-index:2}
  .found button{width:100%;text-align:left;background:none;border:0;padding:6px 8px;border-radius:6px;color:var(--text)}
  .found button:hover{background:var(--panel-2)}
  .found small,.person small{color:var(--muted)}
  .person{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--line)}
  .person span:first-child{display:grid}
  .controls{display:flex;gap:10px;align-items:center}
  .linkrow{display:flex;gap:8px}
  .linkrow input{flex:1;min-width:0;font:500 .8rem var(--mono)}
  .link{background:none;border:0;text-decoration:underline;padding:0;color:var(--brass)}
  .link.danger{color:var(--bad)}
  .row{display:flex;justify-content:flex-end;gap:8px}
  .row.start{justify-content:flex-start}
</style>
