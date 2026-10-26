<script>
  import {onMount} from 'svelte';
  import AppBar from '../../lib/ui/AppBar.svelte';
  import {api,timeAgo} from '../../lib/ui/api.js';
  import {requireSession} from '../../lib/ui/session.js';
  /** Server owner tools: storage usage and maintenance, and every account. */
  let session=$state(null);
  let report=$state(null);
  let users=$state([]);
  let busy=$state('');
  let error=$state('');
  let notice=$state('');
  let reset=$state(null);
  let confirmVacuum=$state(false);
  onMount(async()=>{
    session=await requireSession();
    if(session.user.siteRole!=='owner'){error='Only the server owner can open server administration.';return;}
    await refresh();
  });
  async function refresh(){
    try{[report,users,backups]=await Promise.all([api('/api/v1/admin/storage'),api('/api/v1/admin/users').then(r=>r.users),
      api('/api/v1/admin/backups')]);}
    catch(e){error=e.message;}
  }
  const fmt=n=>{
    if(n==null)return '—';
    const units=['B','KB','MB','GB','TB'];let i=0,v=Number(n);
    while(v>=1024&&i<units.length-1){v/=1024;i++;}
    return (i?v.toFixed(v<10?1:0):v)+' '+units[i];
  };
  const total=$derived(report?report.files.database+report.files.wal+report.files.shm:0);
  const GROUPS=[['compendiums','Compendiums'],['icons','Icons'],['characters','Characters'],['personal','Personal characters'],['syncInProgress','Sync in progress'],['other','Accounts and other']];
  const groupMax=$derived(report?Math.max(1,...GROUPS.map(([k])=>report.groups[k]??0)):1);
  async function maintain(action,label){
    busy=action;error='';notice='';
    try{
      const r=await api('/api/v1/admin/storage',{method:'POST',body:{action}});
      report=r.report;
      if(action==='checkpoint')notice=r.result.busy?'Checkpoint partly done: a reader was busy. Try again shortly.':`WAL folded into the database (${fmt(r.result.walBefore)} → ${fmt(r.result.walAfter)}).`;
      else if(action==='cleanup')notice=r.result.removed.length?'Removed: '+r.result.removed.map(x=>`${x.rows} × ${x.label.toLowerCase()}`).join(', ')+'.':'Nothing to clean up.';
      else if(action==='vacuum')notice=`Database compacted: ${fmt(r.result.before)} → ${fmt(r.result.after)}.`;
      else notice=label+' done.';
    }catch(e){error=e.message;}finally{busy='';confirmVacuum=false;}
  }
  async function issueReset(user){
    busy='reset-'+user.id;error='';notice='';
    try{reset={user,...await api('/api/v1/users/'+encodeURIComponent(user.id)+'/password-reset',{method:'POST',body:{}})};await refresh();}
    catch(e){error=e.message;}finally{busy='';}
  }
  let confirmDelete=$state(null);
  let backups=$state(null);
  async function backupNow(){
    busy='backup';error='';notice='';
    try{const r=await api('/api/v1/admin/backups',{method:'POST',body:{}});backups={...backups,backups:r.backups};
      notice=`Backup ${r.backup.name} made and verified (${fmt(r.backup.size)}).`;}
    catch(e){error=e.message;}finally{busy='';}
  }
  async function deleteUser(user){
    busy='delete-'+user.id;error='';notice='';
    try{
      await api('/api/v1/users/'+encodeURIComponent(user.id),{method:'DELETE'});
      notice=`${user.displayName}’s account was deleted. Their characters are now yours.`;
      confirmDelete=null;await refresh();
    }catch(e){error=e.message;}finally{busy='';}
  }
  async function copy(text){
    try{await navigator.clipboard.writeText(text);notice='Reset link copied.';}catch{error='Copy failed. Select the link and copy it yourself.';}
  }
  const cleanupRows=$derived(report?.cleanup?.reduce((n,c)=>n+c.rows,0)??0);
  const now=Math.floor(Date.now()/1000);
</script>
<svelte:head><title>Server admin · PF2e Planner</title></svelte:head>
{#if session}<AppBar me={session.user} campaigns={session.campaigns} crumb="Server admin"/>{/if}
<main class="page admin">
  <h1>Server administration</h1>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice good" role="status">{notice}</p>{/if}
  {#if report}
    <section class="panel block">
      <div class="head"><h2>Storage</h2><button class="btn small ghost" onclick={refresh}>Refresh</button></div>
      <dl class="facts">
        <div><dt>Total on disk</dt><dd class="num">{fmt(total)}</dd></div>
        <div><dt>Database file</dt><dd class="num">{fmt(report.files.database)}</dd></div>
        <div><dt>Write log (WAL)</dt><dd class="num">{fmt(report.files.wal)}</dd></div>
        <div><dt>Reclaimable</dt><dd class="num">{fmt(report.reclaimable)}</dd></div>
        <div><dt>Free disk space</dt><dd class="num">{fmt(report.freeSpace)}</dd></div>
      </dl>
      <p class="muted small num">{report.path}</p>
      <div class="bars">
        {#each GROUPS as [key,label]}
          <div class="bar"><span>{label}</span><span class="track"><span class="fill" style:width={((report.groups[key]??0)/groupMax*100)+'%'}></span></span>
            <b class="num">{fmt(report.groups[key])}</b></div>
        {/each}
      </div>
      <h3>Per world</h3>
      <div class="table" role="table">
        <div class="row th" role="row"><span>World</span><span>Compendiums</span><span>Icons</span><span>Characters</span><span>Last sync</span></div>
        {#each report.worlds as w (w.integrationId)}
          <div class="row" role="row">
            <span><b>{w.title}</b>{#if w.revokedAt}<small class="muted"> · disconnected</small>{/if}
              {#if w.snapshots>1}<small class="warn"> · {w.snapshots} snapshots</small>{/if}{#if w.staged}<small class="warn"> · {w.staged} staged</small>{/if}</span>
            <span class="num">{w.items.toLocaleString()} · {fmt(w.itemBytes)}</span>
            <span class="num" title="Images only this world uses: {fmt(w.iconOwnBytes)}">{w.icons.toLocaleString()} · {fmt(w.iconBytes)}{#if w.iconBytes>w.iconOwnBytes}<small class="muted"> ({fmt(w.iconOwnBytes)} own)</small>{/if}</span>
            <span class="num">{w.characters} · {fmt(w.characterBytes)}</span>
            <span>{w.syncedAt?timeAgo(w.syncedAt):'—'}</span>
          </div>
        {/each}
        {#each report.unpaired as c (c.campaignId)}
          <div class="row" role="row"><span><b>{c.title}</b><small class="muted"> · no world paired</small></span>
            <span>—</span><span>—</span><span class="num">{c.characters} · {fmt(c.characterBytes)}</span><span>—</span></div>
        {/each}
        {#if report.personal}
          <div class="row" role="row"><span><b>Personal characters</b><small class="muted"> · read worlds’ compendiums, nothing copied</small></span>
            <span class="num" title="Items kept from sources that went away">{report.personal.kept.toLocaleString()} kept · {fmt(report.personal.keptBytes)}</span>
            <span>—</span><span class="num">{report.personal.characters} · {fmt(report.personal.characterBytes)}</span><span>—</span></div>
        {/if}
      </div>
      <p class="muted small">Sizes per world are the stored data; the database adds indexes and page overhead on top.
        Icons are shared: {report.sharedIcons.images.toLocaleString()} images ({fmt(report.sharedIcons.bytes)}) serve {report.sharedIcons.paths.toLocaleString()} icon paths across worlds; “own” is what only that world uses.</p>
    </section>
    <section class="panel block">
      <h2>Maintenance</h2>
      <div class="actions">
        <div><button class="btn" disabled={!!busy} onclick={()=>maintain('checkpoint','Checkpoint')}>{busy==='checkpoint'?'Working…':'Checkpoint WAL'}</button>
          <p class="muted small">Copies the write log into the database and shrinks it. Safe any time; runs on its own after large syncs.</p></div>
        <div><button class="btn" disabled={!!busy} onclick={()=>maintain('cleanup','Cleanup')}>{busy==='cleanup'?'Working…':'Clean up'+(cleanupRows?` (${cleanupRows.toLocaleString()})`:'')}</button>
          <p class="muted small">Removes abandoned syncs, old compendium snapshots, expired sessions and codes.
            {#each report.cleanup.filter(c=>c.rows) as c}<br/>{c.rows.toLocaleString()} × {c.label.toLowerCase()}{/each}</p></div>
        <div><button class="btn" disabled={!!busy} onclick={()=>maintain('optimize','Optimize')}>{busy==='optimize'?'Working…':'Optimize'}</button>
          <p class="muted small">Refreshes SQLite's query statistics. Quick.</p></div>
        <div>
          {#if confirmVacuum}
            <button class="btn danger" disabled={!!busy} onclick={()=>maintain('vacuum','Compact')}>{busy==='vacuum'?'Compacting…':'Compact now'}</button>
            <button class="btn ghost" onclick={()=>confirmVacuum=false}>Cancel</button>
          {:else}
            <button class="btn" disabled={!!busy||!report.reclaimable} onclick={()=>confirmVacuum=true}>Compact database…</button>
          {/if}
          <p class="muted small">Rebuilds the file to give {fmt(report.reclaimable)} back to the disk. Needs about {fmt(report.files.database)} free and pauses saving while it runs; do it when nobody is syncing. Back up the data folder first.</p></div>
      </div>
    </section>
    {#if backups}
      <section class="panel block">
        <div class="head"><h2>Backups</h2>
          <button class="btn small" disabled={!!busy} onclick={backupNow}>{busy==='backup'?'Backing up…':'Back up now'}</button></div>
        <p class="muted small">{backups.every>0?`A verified copy is made every ${backups.every} hours`:'Automatic backups are off (PLANNER_BACKUP_HOURS=0)'}; the newest {backups.keep} are kept in <span class="num">{backups.dir}</span>.
          They're on the same disk as the database, so download one now and then and keep it elsewhere.</p>
        {#if backups.backups.length}
          <ul class="backups">{#each backups.backups as b (b.name)}
            <li><span class="num">{b.name}</span><small class="muted">{fmt(b.size)} · {timeAgo(b.createdAt)}</small>
              <a class="link" href={'/api/v1/admin/backups/'+encodeURIComponent(b.name)} download>Download</a></li>
          {/each}</ul>
        {:else}<p class="muted">No backups yet.</p>{/if}
        <details class="small"><summary>How to restore</summary>
          <ol><li>Stop the planner container.</li><li>In the data folder, rename <span class="num">planner.sqlite</span> and delete <span class="num">planner.sqlite-wal</span> and <span class="num">-shm</span> if present.</li>
            <li>Copy the backup in as <span class="num">planner.sqlite</span>.</li><li>Start the container.</li></ol></details>
      </section>
    {/if}
    <section class="panel block">
      <h2>Accounts</h2>
      {#if reset}
        <div class="notice good reset">
          <p>Send this one-time link to <b>{reset.user.displayName}</b>. It works once and expires in 24 hours; using it signs them out everywhere else.</p>
          <code>{reset.resetUrl}</code>
          <div><button class="btn small" onclick={()=>copy(reset.resetUrl)}>Copy link</button>
            <button class="btn small ghost" onclick={()=>reset=null}>Done</button></div>
        </div>
      {/if}
      <div class="table" role="table">
        <div class="row th users" role="row"><span>User</span><span>Status</span><span>Campaigns</span><span>Characters</span><span></span></div>
        {#each users as u (u.id)}
          <div class="row users" role="row">
            <span><b>{u.displayName}</b><small class="muted"> {u.username?'@'+u.username:'(invited)'}{u.siteRole==='owner'?' · owner':''}</small></span>
            <span>{u.status==='active'?'Active':u.status==='pending'?'Invited':'Disabled'}{#if u.resetPendingUntil>now}<small class="muted"> · reset link sent</small>{/if}</span>
            <span class="num">{u.campaigns}</span><span class="num">{u.characters}</span>
            <span class="row-actions" class:confirm={confirmDelete===u.id}>
              {#if confirmDelete===u.id}
                <span class="small">Delete {u.displayName} everywhere? Their characters move to you.</span>
                <button class="btn small" onclick={()=>confirmDelete=null}>Keep</button>
                <button class="btn small danger" disabled={!!busy} onclick={()=>deleteUser(u)}>Delete</button>
              {:else}
                {#if u.status==='active'}<button class="link" disabled={!!busy} onclick={()=>issueReset(u)}>Reset password</button>{/if}
                {#if u.siteRole!=='owner'}<button class="link danger" disabled={!!busy} onclick={()=>confirmDelete=u.id}>Delete</button>{/if}
              {/if}
            </span>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</main>
<style>
  .admin{display:grid;gap:16px;max-width:1000px}
  .block{padding:20px;display:grid;gap:14px}
  .head{display:flex;justify-content:space-between;align-items:center}
  h2{font-size:1.15rem}h3{font-size:1rem;margin-top:6px}
  .small{font-size:.84rem}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0}
  .facts div{background:var(--panel-2);border-radius:8px;padding:10px 12px}
  dt{font-size:.75rem;color:var(--muted)}dd{margin:0;font:700 1.1rem var(--mono)}
  .bars{display:grid;gap:6px}
  .bar{display:grid;grid-template-columns:150px 1fr 80px;gap:10px;align-items:center;font-size:.9rem}
  .track{height:8px;border-radius:4px;background:var(--panel-2);overflow:hidden}
  .fill{display:block;height:100%;background:var(--brass);border-radius:4px}
  .bar b{text-align:right}
  .table{display:grid;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
  .row{display:grid;grid-template-columns:minmax(0,1.6fr) 1fr 1fr 1fr .8fr;gap:10px;padding:8px 12px;border-top:1px solid var(--line);font-size:.9rem;align-items:baseline}
  /* One fixed actions column, so every row (with or without Delete) lines up with the header. */
  .row.users{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) 90px 90px 190px}
  .row-actions.confirm{grid-column:1/-1}
  .row.th{border-top:0;background:var(--panel-2);font:600 .72rem var(--mono);color:var(--muted);text-transform:uppercase}
  .warn{color:var(--warn)}
  .actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
  .actions p{margin-top:6px}
  .backups{list-style:none;margin:0;padding:0;display:grid;gap:4px}
  .backups li{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
  .row-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
  .link.danger{color:var(--bad)}
  .reset{display:grid;gap:8px}
  .reset code{overflow-wrap:anywhere;font-size:.85rem}
  .reset div{display:flex;gap:8px}
  @media(max-width:700px){
    .row,.row.users{grid-template-columns:1fr 1fr}
    .row.th{display:none}
    .row.users .row-actions{grid-column:1/-1;justify-content:flex-start}
    .bar{grid-template-columns:110px 1fr 64px}
  }
</style>
