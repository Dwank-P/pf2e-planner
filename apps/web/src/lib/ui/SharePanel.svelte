<script>
  import {tr} from '../i18n/index.js';
  import {api} from './api.js';
  import PeoplePicker from './PeoplePicker.svelte';
  import PublicLink from './PublicLink.svelte';
  /**
   * Who can see or edit a campaign character: the campaign, chosen members (picked by name), and
   * an optional public link. GMs always keep access.
   */
  let {url,onClose,onSaved=()=>{}}=$props();
  let visibility=$state('private');
  let shares=$state([]);
  let members=$state([]);
  let token=$state(null);
  let busy=$state(false);
  let error=$state('');
  const OPTIONS=[['private','Only me','You and the GM.'],['campaign-view','Campaign can view','Everyone in the campaign can look; only you and the GM edit.'],
    ['campaign-edit','Campaign can edit','Everyone in the campaign can change it.'],['custom','Chosen people','Pick who can view or edit.']];
  $effect(()=>{
    api(url).then(r=>{
      visibility=r.sharing.visibility;members=r.members;token=r.sharing.publicToken??null;
      shares=r.sharing.shares.map(s=>({...s,...(r.members.find(m=>m.id===s.userId)??{})}));
    }).catch(e=>error=e.message);
  });
  // Campaign members only (GMs already have access); matched on name or username.
  const searchMembers=async q=>members.filter(m=>m.role!=='gm'&&
    (m.displayName.toLowerCase().includes(q.toLowerCase())||(m.username??'').toLowerCase().startsWith(q.toLowerCase())));
  function add(person){shares=[...shares,{userId:person.id,displayName:person.displayName,username:person.username,access:'view'}];}
  async function save(publicLink='keep'){
    busy=true;error='';
    try{
      const r=await api(url,{method:'PUT',body:{visibility,publicLink,
        shares:visibility==='custom'?shares.map(s=>({userId:s.userId,access:s.access})):[]}});
      token=r.sharing.publicToken??null;
      onSaved(r.sharing);
      if(publicLink==='keep')onClose();
    }catch(e){error=e.message;}finally{busy=false;}
  }
</script>
<div class="scrim" role="presentation" onclick={onClose}></div>
<div class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="share-title">
  <h2 id="share-title">{tr("Share character")}</h2>
  <div class="options" role="radiogroup" aria-label={tr("Who can see this character")}>
    {#each OPTIONS as [value,label,hint]}
      <label class="option" class:on={visibility===value}>
        <input type="radio" name="visibility" {value} bind:group={visibility}/>
        <span><b>{label}</b><small>{hint}</small></span>
      </label>
    {/each}
  </div>
  {#if visibility==='custom'}
    <div class="people">
      <PeoplePicker search={searchMembers} onPick={add} exclude={shares.map(s=>s.userId)} placeholder={tr("Add a campaign member by name…")} id="share-people"/>
      {#each shares as s (s.userId)}
        <div class="person"><span><b>{s.displayName}</b><small>{s.username?'@'+s.username:''}</small></span>
          <span class="controls">
            <select aria-label={tr('Access for {0}',s.displayName)} value={s.access} onchange={e=>shares=shares.map(x=>x.userId===s.userId?{...x,access:e.currentTarget.value}:x)}>
              <option value="view">{tr("Can view")}</option><option value="edit">{tr("Can edit")}</option>
            </select>
            <button class="link danger" onclick={()=>shares=shares.filter(x=>x.userId!==s.userId)}>{tr("Remove")}</button>
          </span></div>
      {:else}<p class="muted small">{tr("Nobody chosen yet.")}</p>{/each}
    </div>
  {/if}
  <PublicLink {token} {busy} onChange={mode=>save(mode)}/>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  <div class="row"><button class="btn ghost" onclick={onClose}>{tr("Cancel")}</button>
    <button class="btn primary" disabled={busy} onclick={()=>save('keep')}>{busy?tr('Saving…'):tr('Save')}</button></div>
</div>
<style>
  .scrim{position:fixed;inset:0;background:rgb(0 0 0 / .45);z-index:60}
  .dialog{position:fixed;z-index:61;top:50%;left:50%;transform:translate(-50%,-50%);width:min(500px,calc(100vw - 32px));
    max-height:calc(100vh - 48px);overflow:auto;padding:20px;display:grid;gap:14px;box-shadow:var(--shadow)}
  h2{font-size:1.15rem}
  .options{display:grid;gap:6px}
  .option{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px;cursor:pointer}
  .option.on{border-color:var(--brass);background:var(--brass-soft)}
  .option span{display:grid;gap:2px}
  .option small,.person small{color:var(--muted);font-size:.8rem}
  .people{display:grid;gap:6px}
  .person{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--line)}
  .person span:first-child{display:grid}
  .controls{display:flex;gap:10px;align-items:center}
  .link{background:none;border:0;text-decoration:underline;padding:0;color:var(--brass)}
  .link.danger{color:var(--bad)}
  .row{display:flex;justify-content:flex-end;gap:8px}
</style>
