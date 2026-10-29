<script>
  import {tr} from '../../lib/i18n/index.js';
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
    if(session.user.siteRole!=='owner'){error=tr('Only the server owner can open server administration.');return;}
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
      if(action==='checkpoint')notice=r.result.busy?tr('Checkpoint partly done: a reader was busy. Try again shortly.'):tr('WAL folded into the database ({0} → {1}).',fmt(r.result.walBefore),fmt(r.result.walAfter));
      else if(action==='cleanup')notice=r.result.removed.length?tr('Removed: {0}.',r.result.removed.map(x=>`${x.rows} × ${tr(x.label).toLowerCase()}`).join(', ')):tr('Nothing to clean up.');
      else if(action==='vacuum')notice=tr('Database compacted: {0} → {1}.',fmt(r.result.before),fmt(r.result.after));
      else notice=tr('{0} done.',label);
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
      notice=tr('Backup {0} made and verified ({1}).',r.backup.name,fmt(r.backup.size));}
    catch(e){error=e.message;}finally{busy='';}
  }
  // Schedule and retention, set here (the environment variables are only the defaults).
  let every=$state(24),keepCount=$state(7);
  $effect(()=>{if(backups){every=backups.every;keepCount=backups.keep;}});
  async function saveBackupSettings(event){
    event.preventDefault();busy='backup-settings';error='';notice='';
    try{
      const r=await api('/api/v1/admin/backups',{method:'PUT',body:{every:Number(every),keep:Number(keepCount)}});
      backups={...backups,...r};
      notice=r.removed.length?tr('Backup schedule saved; removed {0} older backups.',r.removed.length):tr('Backup schedule saved.');
    }catch(e){error=e.message;}finally{busy='';}
  }
  let confirmBackup=$state(null);
  async function deleteBackup(name){
    busy='backup-delete';error='';notice='';
    try{const r=await api('/api/v1/admin/backups/'+encodeURIComponent(name),{method:'DELETE'});backups={...backups,backups:r.backups};
      notice=tr('Deleted {0}.',name);confirmBackup=null;}
    catch(e){error=e.message;}finally{busy='';}
  }
  // The newest backup is overdue when it's older than twice the schedule.
  const overdue=$derived(backups&&backups.every>0&&backups.backups.length
    ?Date.now()/1000-backups.backups[0].createdAt>backups.every*2*3600:false);
  async function deleteUser(user){
    busy='delete-'+user.id;error='';notice='';
    try{
      await api('/api/v1/users/'+encodeURIComponent(user.id),{method:'DELETE'});
      notice=tr('{0}’s account was deleted. Their characters are now yours.',user.displayName);
      confirmDelete=null;await refresh();
    }catch(e){error=e.message;}finally{busy='';}
  }
  async function copy(text){
    try{await navigator.clipboard.writeText(text);notice=tr('Reset link copied.');}catch{error=tr('Copy failed. Select the link and copy it yourself.');}
  }
  const cleanupRows=$derived(report?.cleanup?.reduce((n,c)=>n+c.rows,0)??0);
  const now=Math.floor(Date.now()/1000);
</script>
<svelte:head><title>{tr("Server admin · PF2e Planner")}</title></svelte:head>
{#if session}<AppBar me={session.user} campaigns={session.campaigns} crumb={tr("Server admin")}/>{/if}
<main class="page admin">
  <h1>{tr("Server administration")}</h1>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice good" role="status">{notice}</p>{/if}
  {#if report}
    <section class="panel block">
      <div class="head"><h2>{tr("Storage")}</h2><button class="btn small ghost" onclick={refresh}>{tr("Refresh")}</button></div>
      <dl class="facts">
        <div><dt>{tr("Total on disk")}</dt><dd class="num">{fmt(total)}</dd></div>
        <div><dt>{tr("Database file")}</dt><dd class="num">{fmt(report.files.database)}</dd></div>
        <div><dt>{tr("Write log (WAL)")}</dt><dd class="num">{fmt(report.files.wal)}</dd></div>
        <div><dt>{tr("Reclaimable")}</dt><dd class="num">{fmt(report.reclaimable)}</dd></div>
        <div><dt>{tr("Free disk space")}</dt><dd class="num">{fmt(report.freeSpace)}</dd></div>
      </dl>
      <p class="muted small num">{report.path}</p>
      <div class="bars">
        {#each GROUPS as [key,label]}
          <div class="bar"><span>{tr(label)}</span><span class="track"><span class="fill" style:width={((report.groups[key]??0)/groupMax*100)+'%'}></span></span>
            <b class="num">{fmt(report.groups[key])}</b></div>
        {/each}
      </div>
      <h3>{tr("Per world")}</h3>
      <div class="table" role="table">
        <div class="row th" role="row"><span>{tr("World")}</span><span>{tr("Compendiums")}</span><span>{tr("Icons")}</span><span>{tr("Characters")}</span><span>{tr("Last sync")}</span></div>
        {#each report.worlds as w (w.integrationId)}
          <div class="row" role="row">
            <span><b>{w.title}</b>{#if w.revokedAt}<small class="muted"> {tr("· disconnected")}</small>{/if}
              {#if w.snapshots>1}<small class="warn"> {tr("· {0} snapshots", w.snapshots)}</small>{/if}{#if w.staged}<small class="warn"> {tr("· {0} staged", w.staged)}</small>{/if}</span>
            <span class="num">{w.items.toLocaleString()} · {fmt(w.itemBytes)}</span>
            <span class="num" title={tr("Images only this world uses: {0}", fmt(w.iconOwnBytes))}>{w.icons.toLocaleString()} · {fmt(w.iconBytes)}{#if w.iconBytes>w.iconOwnBytes}<small class="muted"> {tr("({0} own)", fmt(w.iconOwnBytes))}</small>{/if}</span>
            <span class="num">{w.characters} · {fmt(w.characterBytes)}</span>
            <span>{w.syncedAt?timeAgo(w.syncedAt):'—'}</span>
          </div>
        {/each}
        {#each report.unpaired as c (c.campaignId)}
          <div class="row" role="row"><span><b>{c.title}</b><small class="muted"> {tr("· no world paired")}</small></span>
            <span>—</span><span>—</span><span class="num">{c.characters} · {fmt(c.characterBytes)}</span><span>—</span></div>
        {/each}
        {#if report.personal}
          <div class="row" role="row"><span><b>{tr("Personal characters")}</b><small class="muted"> {tr("· read worlds’ compendiums, nothing copied")}</small></span>
            <span class="num" title={tr("Items kept from sources that went away")}>{tr("{0} kept · {1}", report.personal.kept.toLocaleString(), fmt(report.personal.keptBytes))}</span>
            <span>—</span><span class="num">{report.personal.characters} · {fmt(report.personal.characterBytes)}</span><span>—</span></div>
        {/if}
      </div>
      <p class="muted small">{tr("Sizes per world are the stored data; the database adds indexes and page overhead on top. Icons are shared: {0} images ({1}) serve {2} icon paths across worlds; “own” is what only that world uses.", report.sharedIcons.images.toLocaleString(), fmt(report.sharedIcons.bytes), report.sharedIcons.paths.toLocaleString())}</p>
    </section>
    <section class="panel block">
      <h2>{tr("Maintenance")}</h2>
      <div class="actions">
        <div><button class="btn" disabled={!!busy} onclick={()=>maintain('checkpoint',tr('Checkpoint'))}>{busy==='checkpoint'?tr('Working…'):tr('Checkpoint WAL')}</button>
          <p class="muted small">{tr("Copies the write log into the database and shrinks it. Safe any time; runs on its own after large syncs.")}</p></div>
        <div><button class="btn" disabled={!!busy} onclick={()=>maintain('cleanup',tr('Cleanup'))}>{busy==='cleanup'?tr('Working…'):tr('Clean up')+(cleanupRows?` (${cleanupRows.toLocaleString()})`:'')}</button>
          <p class="muted small">{tr("Removes abandoned syncs, old compendium snapshots, expired sessions and codes.")}
            {#each report.cleanup.filter(c=>c.rows) as c}<br/>{c.rows.toLocaleString()} × {c.label.toLowerCase()}{/each}</p></div>
        <div><button class="btn" disabled={!!busy} onclick={()=>maintain('optimize',tr('Optimize'))}>{busy==='optimize'?tr('Working…'):tr('Optimize')}</button>
          <p class="muted small">{tr("Refreshes SQLite's query statistics. Quick.")}</p></div>
        <div>
          {#if confirmVacuum}
            <button class="btn danger" disabled={!!busy} onclick={()=>maintain('vacuum',tr('Compact'))}>{busy==='vacuum'?tr('Compacting…'):tr('Compact now')}</button>
            <button class="btn ghost" onclick={()=>confirmVacuum=false}>{tr("Cancel")}</button>
          {:else}
            <button class="btn" disabled={!!busy||!report.reclaimable} onclick={()=>confirmVacuum=true}>{tr("Compact database…")}</button>
          {/if}
          <p class="muted small">{tr("Rebuilds the file to give {0} back to the disk. Needs about {1} free and pauses saving while it runs; do it when nobody is syncing. Back up the data folder first.", fmt(report.reclaimable), fmt(report.files.database))}</p></div>
      </div>
    </section>
    {#if backups}
      <section class="panel block">
        <div class="head"><h2>{tr("Backups")}</h2>
          <button class="btn small" disabled={!!busy} onclick={backupNow}>{busy==='backup'?tr('Backing up…'):tr('Back up now')}</button></div>
        <form class="backup-settings" onsubmit={saveBackupSettings}>
          <label>{tr("Back up every")} <input type="number" min="0" max="720" bind:value={every} aria-label={tr("Hours between backups")}/> {tr("hours")}</label>
          <label>{tr("Keep the newest")} <input type="number" min="1" max="100" bind:value={keepCount} aria-label={tr("Backups to keep")}/></label>
          <button class="btn small" disabled={!!busy||(Number(every)===backups.every&&Number(keepCount)===backups.keep)}>{busy==='backup-settings'?tr('Saving…'):tr('Save')}</button>
        </form>
        <p class="muted small">{tr("{0}; the newest {1} are kept in", backups.every>0?tr("A verified copy is made every {0} hours",backups.every):tr('Automatic backups are off (0 hours)'), backups.keep)} <span class="num">{backups.dir}</span>{tr(". They're on the same disk as the database, so download one now and then and keep it elsewhere.")}</p>
        {#if overdue}<p class="notice">{tr("The newest backup is {0} — older than expected. Check the server log, or back up now.", timeAgo(backups.backups[0].createdAt))}</p>{/if}
        {#if backups.backups.length}
          <ul class="backups">{#each backups.backups as b (b.name)}
            <li><span class="num">{b.name}</span><small class="muted">{fmt(b.size)} · {timeAgo(b.createdAt)}</small>
              <a class="link" href={'/api/v1/admin/backups/'+encodeURIComponent(b.name)} download>{tr("Download")}</a>
              {#if confirmBackup===b.name}
                <button class="link danger" disabled={!!busy} onclick={()=>deleteBackup(b.name)}>{tr("Delete it")}</button>
                <button class="link" onclick={()=>confirmBackup=null}>{tr("Keep")}</button>
              {:else}<button class="link danger" onclick={()=>confirmBackup=b.name}>{tr("Delete")}</button>{/if}</li>
          {/each}</ul>
        {:else}<p class="muted">{tr("No backups yet.")}</p>{/if}
        <details class="small"><summary>{tr("How to restore")}</summary>
          <ol><li>{tr("Stop the planner container.")}</li><li>{tr("In the data folder, rename")} <span class="num">{tr("planner.sqlite")}</span> {tr("and delete")} <span class="num">{tr("planner.sqlite-wal")}</span> {tr("and")} <span class="num">{tr("-shm")}</span> {tr("if present.")}</li>
            <li>{tr("Copy the backup in as")} <span class="num">{tr("planner.sqlite")}</span>.</li><li>{tr("Start the container.")}</li></ol></details>
      </section>
    {/if}
    <section class="panel block">
      <h2>{tr("Accounts")}</h2>
      {#if reset}
        <div class="notice good reset">
          <p>{tr("Send this one-time link to")} <b>{reset.user.displayName}</b>{tr(". It works once and expires in 24 hours; using it signs them out everywhere else.")}</p>
          <code>{reset.resetUrl}</code>
          <div><button class="btn small" onclick={()=>copy(reset.resetUrl)}>{tr("Copy link")}</button>
            <button class="btn small ghost" onclick={()=>reset=null}>{tr("Done")}</button></div>
        </div>
      {/if}
      <div class="table" role="table">
        <div class="row th users" role="row"><span>{tr("User")}</span><span>{tr("Status")}</span><span>{tr("Campaigns")}</span><span>{tr("Characters")}</span><span></span></div>
        {#each users as u (u.id)}
          <div class="row users" role="row">
            <span><b>{u.displayName}</b><small class="muted"> {u.username?'@'+u.username:'(invited)'}{u.siteRole==='owner'?' · owner':''}</small></span>
            <span>{u.status==='active'?tr('Active'):u.status==='pending'?tr('Invited'):tr('Disabled')}{#if u.resetPendingUntil>now}<small class="muted"> {tr("· reset link sent")}</small>{/if}</span>
            <span class="num">{u.campaigns}</span><span class="num">{u.characters}</span>
            <span class="row-actions" class:confirm={confirmDelete===u.id}>
              {#if confirmDelete===u.id}
                <span class="small">{tr("Delete {0} everywhere? Their characters move to you.", u.displayName)}</span>
                <button class="btn small" onclick={()=>confirmDelete=null}>{tr("Keep")}</button>
                <button class="btn small danger" disabled={!!busy} onclick={()=>deleteUser(u)}>{tr("Delete")}</button>
              {:else}
                {#if u.status==='active'}<button class="link" disabled={!!busy} onclick={()=>issueReset(u)}>{tr("Reset password")}</button>{/if}
                {#if u.siteRole!=='owner'}<button class="link danger" disabled={!!busy} onclick={()=>confirmDelete=u.id}>{tr("Delete")}</button>{/if}
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
  .backup-settings{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;font-size:.9rem}
  .backup-settings input{width:5em;margin:0 4px}
</style>
