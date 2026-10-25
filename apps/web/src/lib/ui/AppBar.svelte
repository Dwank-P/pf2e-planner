<script>
  import {api,campaignPath,timeAgo} from './api.js';
  import {readTheme,applyTheme} from './theme.js';
  /**
   * me: {displayName, siteRole}; campaigns: [{id,title,role}]; campaign: current;
   * sync: catalog-summary report; crumb: trailing breadcrumb text; actions: snippet.
   */
  let {me=null,campaigns=[],campaign=null,sync=null,crumb='',actions}=$props();
  let menu=$state(false);
  let switcher=$state(false);
  let theme=$state('system');
  const initials=$derived((String(me?.displayName??'').match(/\p{L}[\p{L}'’-]*/gu)??['?']).map(w=>w[0]).join('').slice(0,2).toUpperCase());
  const syncState=$derived(!sync?'none':sync.synced&&sync.complete?'good':sync.synced?'warn':'bad');
  $effect(()=>{theme=readTheme();});
  function setTheme(value){theme=value;applyTheme(value);}
  async function signOut(){
    try{await api('/api/v1/auth/logout',{method:'POST',body:{}});}finally{location.href='/sign-in';}
  }
  function close(event){
    if(!event.target.closest?.('.menu-wrap'))menu=switcher=false;
  }
</script>
<svelte:window onclick={close} onkeydown={e=>{if(e.key==='Escape')menu=switcher=false;}}/>
<header class="bar">
  <a class="brand" href="/" aria-label="PF2e Planner home"><span class="mark" aria-hidden="true"></span><span>PF2e Planner</span></a>
  {#if campaign}
    <div class="menu-wrap crumbs">
      <button class="crumb" aria-haspopup="menu" aria-expanded={switcher} onclick={()=>switcher=!switcher}>
        {campaign.title}<span aria-hidden="true">▾</span>
      </button>
      {#if switcher}
        <div class="menu" role="menu">
          <span class="eyebrow">Campaigns</span>
          {#each campaigns as c}
            <a role="menuitem" href={campaignPath(c.id)} class:current={c.id===campaign.id}>{c.title}
              <small>{c.role==='gm'?'GM':c.role==='player'?'Player':'Owner'}</small></a>
          {/each}
        </div>
      {/if}
      {#if crumb}<span class="sep" aria-hidden="true">/</span><span class="here">{crumb}</span>{/if}
    </div>
  {/if}
  <span class="spacer"></span>
  {#if campaign}
    <span class="sync" title={sync?.ruleset?`PF2e ${sync.ruleset.systemVersion??'?'} · Leveler ${sync.ruleset.levelerVersion??'?'}`:''}>
      <span class="status-dot {syncState}"></span>
      {#if syncState==='none'}Not synced yet{:else}Synced {timeAgo(sync.updatedAt)}{/if}
    </span>
  {/if}
  {@render actions?.()}
  {#if me}
    <div class="menu-wrap">
      <button class="avatar" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onclick={()=>menu=!menu}>{initials}</button>
      {#if menu}
        <div class="menu right" role="menu">
          <div class="who"><b>{me.displayName}</b><small>{me.siteRole==='owner'?'Server owner':'Player'}</small></div>
          <div class="theme" role="group" aria-label="Theme">
            {#each [['system','Auto'],['dark','Dark'],['light','Light']] as [value,label]}
              <button class:on={theme===value} aria-pressed={theme===value} onclick={()=>setTheme(value)}>{label}</button>
            {/each}
          </div>
          <a role="menuitem" href="/account">Account</a>
          {#if me.siteRole==='owner'}<a role="menuitem" href="/admin">Server admin</a>{/if}
          <button role="menuitem" class="item" onclick={signOut}>Sign out</button>
        </div>
      {/if}
    </div>
  {/if}
</header>
<style>
  .bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:30;display:flex;align-items:center;gap:12px;
    padding:10px max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px));
    background:var(--panel);border-bottom:1px solid var(--line);min-height:56px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:8px;font:800 15px var(--display);color:var(--text);text-decoration:none;letter-spacing:-.01em}
  .mark{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,var(--brass-strong),var(--brass) 55%,#7a5714);
    box-shadow:inset 0 0 0 1px rgb(255 255 255 / .15)}
  .crumbs{display:flex;align-items:center;gap:6px;min-width:0}
  .crumb{background:none;border:0;font-weight:700;color:var(--text);padding:4px 6px;border-radius:6px;display:flex;gap:6px;align-items:center}
  .crumb:hover{background:var(--panel-2)}
  .crumb span{font-size:.7rem;color:var(--muted)}
  .sep{color:var(--faint)}
  .here{color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:36vw}
  .spacer{flex:1}
  .sync{display:flex;align-items:center;gap:6px;font:500 12px var(--mono);color:var(--muted);white-space:nowrap}
  .menu-wrap{position:relative}
  .avatar{width:32px;height:32px;border-radius:50%;border:1px solid var(--line);background:var(--panel-3);
    font:700 12px var(--display);color:var(--text)}
  .menu{position:absolute;top:calc(100% + 6px);left:0;min-width:230px;background:var(--panel);border:1px solid var(--line);
    border-radius:var(--radius);box-shadow:var(--shadow);padding:8px;display:grid;gap:2px;z-index:40}
  .menu.right{left:auto;right:0}
  .menu .eyebrow{padding:4px 8px}
  .menu a,.menu .item{display:flex;justify-content:space-between;gap:12px;padding:8px;border-radius:7px;color:var(--text);
    text-decoration:none;background:none;border:0;text-align:left;font-weight:700}
  .menu a:hover,.menu .item:hover{background:var(--panel-2)}
  .menu a.current{color:var(--brass)}
  .menu small{color:var(--muted);font-weight:400}
  .who{display:grid;padding:6px 8px 8px;border-bottom:1px solid var(--line);margin-bottom:4px}
  .who small{color:var(--muted)}
  .theme{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:6px 4px}
  .theme button{border:1px solid var(--line);background:var(--panel-2);border-radius:6px;padding:5px;font-size:.8rem}
  .theme button.on{border-color:var(--brass);color:var(--brass)}
  @media(max-width:640px){
    .bar{gap:8px;padding-block:8px}
    .sync{display:none}.here{max-width:28vw}
    .brand span:last-child{display:none}
  }
</style>
