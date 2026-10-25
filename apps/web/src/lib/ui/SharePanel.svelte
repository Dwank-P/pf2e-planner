<script>
  import {api} from './api.js';
  /** Who can see or edit a character. GMs always keep access. */
  let {url,onClose,onSaved=()=>{}}=$props();
  let visibility=$state('private');
  let shares=$state(new Map());
  let members=$state([]);
  let busy=$state(false);
  let error=$state('');
  const OPTIONS=[['private','Only me','You and the GM.'],['campaign-view','Campaign can view','Everyone in the campaign can look; only you and the GM edit.'],
    ['campaign-edit','Campaign can edit','Everyone in the campaign can change it.'],['custom','Chosen people','Pick who can view or edit.']];
  $effect(()=>{
    api(url).then(r=>{visibility=r.sharing.visibility;shares=new Map(r.sharing.shares.map(s=>[s.userId,s.access]));members=r.members;})
      .catch(e=>error=e.message);
  });
  function setShare(userId,access){
    const next=new Map(shares);
    if(access)next.set(userId,access);else next.delete(userId);
    shares=next;
  }
  async function save(){
    busy=true;error='';
    try{
      const r=await api(url,{method:'PUT',body:{visibility,shares:[...shares].map(([userId,access])=>({userId,access}))}});
      onSaved(r.sharing);onClose();
    }catch(e){error=e.message;}finally{busy=false;}
  }
</script>
<div class="scrim" role="presentation" onclick={onClose}></div>
<div class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="share-title">
  <h2 id="share-title">Share character</h2>
  <div class="options" role="radiogroup" aria-label="Who can see this character">
    {#each OPTIONS as [value,label,hint]}
      <label class="option" class:on={visibility===value}>
        <input type="radio" name="visibility" {value} bind:group={visibility}/>
        <span><b>{label}</b><small>{hint}</small></span>
      </label>
    {/each}
  </div>
  {#if visibility==='custom'}
    <div class="people">
      {#each members as m (m.id)}
        <div class="person"><span><b>{m.displayName}</b><small>{m.role==='gm'?'GM · always has access':'@'+m.username}</small></span>
          {#if m.role!=='gm'}
            <select aria-label={'Access for '+m.displayName} value={shares.get(m.id)??''} onchange={e=>setShare(m.id,e.currentTarget.value)}>
              <option value="">No access</option><option value="view">Can view</option><option value="edit">Can edit</option>
            </select>
          {/if}
        </div>
      {:else}<p class="muted">Nobody else is in this campaign yet.</p>{/each}
    </div>
  {/if}
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  <div class="row"><button class="btn ghost" onclick={onClose}>Cancel</button>
    <button class="btn primary" disabled={busy} onclick={save}>{busy?'Saving…':'Save'}</button></div>
</div>
<style>
  .scrim{position:fixed;inset:0;background:rgb(0 0 0 / .45);z-index:60}
  .dialog{position:fixed;z-index:61;top:50%;left:50%;transform:translate(-50%,-50%);width:min(480px,calc(100vw - 32px));
    max-height:calc(100vh - 48px);overflow:auto;padding:20px;display:grid;gap:14px;box-shadow:var(--shadow)}
  h2{font-size:1.15rem}
  .options{display:grid;gap:6px}
  .option{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px;cursor:pointer}
  .option.on{border-color:var(--brass);background:var(--brass-soft)}
  .option span{display:grid;gap:2px}
  .option small,.person small{color:var(--muted);font-size:.8rem}
  .people{display:grid;gap:6px}
  .person{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--line)}
  .person span{display:grid}
  .row{display:flex;justify-content:flex-end;gap:8px}
</style>
