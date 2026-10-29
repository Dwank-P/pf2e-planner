<script>
  import {tr} from '../i18n/index.js';
  import {api} from '../ui/api.js';
  import PeoplePicker from '../ui/PeoplePicker.svelte';
  import PublicLink from '../ui/PublicLink.svelte';
  /** Share a personal character with any account (view or edit), and an optional public view link. */
  let {characterId,onClose}=$props();
  let shares=$state([]);
  let token=$state(null);
  let busy=$state(false);
  let error=$state('');
  const url=$derived('/api/v1/personal/'+encodeURIComponent(characterId)+'/sharing');
  $effect(()=>{api(url).then(r=>{shares=r.sharing.shares;token=r.sharing.publicToken;}).catch(e=>error=e.message);});
  const searchPeople=async q=>(await api('/api/v1/people?q='+encodeURIComponent(q))).people;
  function add(person){shares=[...shares,{userId:person.id,displayName:person.displayName,username:person.username,access:'view'}];}
  async function save(publicLink='keep'){
    busy=true;error='';
    try{
      const r=await api(url,{method:'PUT',body:{shares:shares.map(s=>({userId:s.userId,access:s.access})),publicLink}});
      shares=r.sharing.shares;token=r.sharing.publicToken;
      if(publicLink==='keep')onClose();
    }catch(e){error=e.message;}finally{busy=false;}
  }
</script>
<div class="scrim" role="presentation" onclick={onClose}></div>
<div class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="pshare-title">
  <h2 id="pshare-title">{tr("Share character")}</h2>
  <section class="group">
    <h3>{tr("People")}</h3>
    <p class="hint">{tr("Anyone with an account here. Only you can change sharing, sources or delete it.")}</p>
    <PeoplePicker search={searchPeople} onPick={add} exclude={shares.map(s=>s.userId)} id="pshare-people"/>
    {#each shares as s (s.userId)}
      <div class="person"><span><b>{s.displayName}</b><small>@{s.username}</small></span>
        <span class="controls">
          <select aria-label={tr('Access for {0}',s.displayName)} value={s.access} onchange={e=>shares=shares.map(x=>x.userId===s.userId?{...x,access:e.currentTarget.value}:x)}>
            <option value="view">{tr("Can view")}</option><option value="edit">{tr("Can edit")}</option>
          </select>
          <button class="link danger" onclick={()=>shares=shares.filter(x=>x.userId!==s.userId)}>{tr("Remove")}</button>
        </span></div>
    {:else}<p class="muted small">{tr("Not shared with anyone yet.")}</p>{/each}
  </section>
  <PublicLink {token} {busy} onChange={mode=>save(mode)}/>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  <div class="row"><button class="btn ghost" onclick={onClose}>{tr("Cancel")}</button>
    <button class="btn primary" disabled={busy} onclick={()=>save('keep')}>{busy?tr('Saving…'):tr('Save')}</button></div>
</div>
<style>
  .scrim{position:fixed;inset:0;background:var(--overlay);z-index:60}
  .dialog{position:fixed;z-index:61;top:50%;left:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));
    max-height:calc(100vh - 48px);overflow:auto;padding:20px;display:grid;gap:16px;box-shadow:var(--shadow)}
  h2{font-size:1.15rem}
  h3{font-size:.95rem;margin:0}
  .group{display:grid;gap:8px}
  .hint{color:var(--muted);font-size:.82rem;margin:0}
  .person small{color:var(--muted)}
  .person{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--line)}
  .person span:first-child{display:grid}
  .controls{display:flex;gap:10px;align-items:center}
  .link{background:none;border:0;text-decoration:underline;padding:0;color:var(--brass)}
  .link.danger{color:var(--bad)}
  .row{display:flex;justify-content:flex-end;gap:8px}
</style>
