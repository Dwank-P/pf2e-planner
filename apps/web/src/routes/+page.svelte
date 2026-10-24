<script>
  import { onMount } from 'svelte';
  import ThemePicker from '$lib/ThemePicker.svelte';

  let me = $state(null);
  let campaigns = $state([]);
  let booting = $state(true);
  let errorText = $state('');
  let notice = $state('');
  let busy = $state(false);
  let loginName = $state('');
  let loginPassword = $state('');
  let bootstrapSecret = $state('');
  let bootstrapName = $state('');
  let bootstrapUsername = $state('');
  let bootstrapPassword = $state('');
  let initialSetup = $state(false);
  let activeCampaign = $state('');
  let roster = $state([]);
  let ruleset = $state(null);
  let rulesetLoading = $state(false);
  let rulesetError = $state('');
  let search = $state('');
  let userMatches = $state([]);
  let selectedUser = $state('');
  let issuedInvite = $state(null);
  let pairing = $state(null);
  let copyStatus = $state('');
  let sessionCheck = 0;

  const currentCampaign = $derived(campaigns.find(c => c.id === activeCampaign));
  const canManage = $derived(me?.siteRole === 'owner' || currentCampaign?.role === 'gm');
  const invitationText = $derived(issuedInvite
    ? `You've been invited to use PF2e Planner!

Go to ${issuedInvite.joinUrl} and enter the code:
${issuedInvite.inviteCode}

Your code expires in 24 hours. Once it is validated, create your username and password.`
    : '');

  async function api(path, data, method = 'POST') {
    const options = { method, credentials: 'same-origin', cache: 'no-store' };
    if (data !== undefined) {
      options.headers = { 'content-type': 'application/json' };
      options.body = JSON.stringify(data);
    }
    const response = await fetch(path, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = Error(result.message || result.error || `Request failed (HTTP ${response.status})`);
      err.status = response.status;
      throw err;
    }
    return result;
  }

  async function run(operation) {
    errorText = '';
    notice = '';
    copyStatus = '';
    busy = true;
    try { await operation(); }
    catch (error) { errorText = error.message || 'Unexpected error'; }
    finally { busy = false; }
  }

  // Only a GM/owner can fetch the roster. A regular player may sign in and
  // switch worlds, but must never be signed out because the roster returns 403.
  async function loadRoster() {
    if (!activeCampaign || !canManage) { roster = []; return; }
    try {
      const result = await api('/api/v1/campaigns/' + activeCampaign + '/members', undefined, 'GET');
      roster = result.members;
    } catch (error) {
      roster = [];
      errorText = 'Signed in, but the campaign roster could not be loaded: ' + error.message;
    }
  }

  async function refresh() {
    const check = ++sessionCheck;
    try {
      const result = await api('/api/v1/me', undefined, 'GET');
      if (check !== sessionCheck) return;
      me = result.user;
      campaigns = result.campaigns;
      if (!campaigns.some(c => c.id === activeCampaign)) activeCampaign = campaigns[0]?.id ?? '';
      await Promise.all([loadRoster(), loadRuleset()]);
    } catch (error) {
      if (check !== sessionCheck) return;
      if (error.status === 401) {
        me = null;
        campaigns = [];
        roster = [];
      } else {
        errorText = 'Unable to verify your session: ' + error.message;
      }
    } finally {
      if (check === sessionCheck) booting = false;
    }
  }

  async function loadRuleset() {
    const id = activeCampaign;
    ruleset = null;
    rulesetError = '';
    if (!me || !id) return;
    rulesetLoading = true;
    try {
      const result = await api('/api/v1/campaigns/' + encodeURIComponent(id) +
        '/catalog-summary', undefined, 'GET');
      if (activeCampaign === id) ruleset = result;
    } catch (error) {
      if (activeCampaign === id) rulesetError = error.message;
    } finally {
      if (activeCampaign === id) rulesetLoading = false;
    }
  }

  async function login() {
    await run(async () => {
      await api('/api/v1/auth/login', { username: loginName, password: loginPassword });
      loginPassword = '';
      // A 200 login response is not enough: confirm browser retained session.
      const confirmed = await api('/api/v1/me', undefined, 'GET').catch(error => {
        throw Error('Your credentials were accepted, but your session could not be verified (' +
          error.message + '). Check that cookies are allowed for this site.');
      });
      ++sessionCheck; // ignore an earlier onMount session request
      me = confirmed.user;
      campaigns = confirmed.campaigns;
      activeCampaign = campaigns[0]?.id ?? '';
      booting = false;
      await Promise.all([loadRoster(), loadRuleset()]);
    });
  }

  async function setup() {
    await run(async () => {
      await api('/api/v1/setup', {
        bootstrapToken: bootstrapSecret, username: bootstrapUsername,
        displayName: bootstrapName, password: bootstrapPassword
      });
      bootstrapSecret = bootstrapPassword = '';
      initialSetup = false;
      await refresh();
    });
  }

  async function logout() {
    await run(async () => {
      await api('/api/v1/auth/logout', {});
      ++sessionCheck;
      me = null; campaigns = []; roster = []; ruleset = null; pairing = null; issuedInvite = null;
    });
  }

  async function pairingCode() {
    await run(async () => { pairing = await api('/api/v1/pairing-codes', {}); });
  }

  async function addNew() {
    await run(async () => {
      issuedInvite = await api('/api/v1/campaigns/' + activeCampaign + '/members', {});
      await Promise.all([loadRoster(), loadRuleset()]);
    });
  }

  async function searchUsers() {
    await run(async () => {
      const response = await api('/api/v1/users?q=' + encodeURIComponent(search), undefined, 'GET');
      userMatches = response.users;
      selectedUser = userMatches[0]?.id ?? '';
    });
  }

  async function addExisting() {
    await run(async () => {
      const response = await api('/api/v1/campaigns/' + activeCampaign + '/members', {
        existingUserId: selectedUser
      });
      notice = response.alreadyMember ? 'This player already belongs to the world.' :
        'Player added. They can use their existing login.';
      await Promise.all([loadRoster(), loadRuleset()]);
    });
  }

  async function copyText(value, label) {
    errorText = '';
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard API unavailable.');
      await navigator.clipboard.writeText(value);
      copyStatus = label + ' copied to clipboard.';
    } catch {
      errorText = 'Unable to copy automatically. Select the text and copy it manually.';
    }
  }

  const variantLabels={
    freeArchetype:'Free Archetype',dualClass:'Dual Class',ancestralParagon:'Ancestral Paragon',
    gradualAbilityBoosts:'Gradual Ability Boosts',
    automaticBonusProgression:'Automatic Bonus Progression',
    proficiencyWithoutLevel:'Proficiency Without Level',
    mythic:'Mythic',stamina:'Stamina'
  };
  onMount(() => { refresh(); });
</script>
<svelte:head>
  <title>PF2e Planner · Character workshop</title>
  <meta name="description" content="Build Pathfinder 2e characters using rules synchronized from your Foundry world."/>
</svelte:head>
<div class="app-shell">
  <header class="site-header">
    <a class="brand" href="/"><span class="logo">✦</span>
      <span><strong>PF2e Planner</strong><small>CHARACTER WORKSHOP</small></span></a>
    <div class="header-tools"><ThemePicker/>
      {#if me}<span class="signed-in">{me.displayName}</span>
        <button class="secondary-action" type="button" onclick={logout} disabled={busy}>Sign out</button>
      {/if}
    </div>
  </header>
  {#if errorText}<div class="toast danger" role="alert">{errorText}</div>{/if}
  {#if notice}<div class="toast" role="status">{notice}</div>{/if}
  {#if copyStatus}<div class="toast" role="status">{copyStatus}</div>{/if}

  {#if booting}
    <div class="loading">Checking your session…</div>
  {:else if !me}
    <div class="landing">
      <div class="pitch">
        <div class="kicker">Campaign-connected · Built for Pathfinder 2e</div>
        <h1>Every possibility.<br/><em>One character.</em></h1>
        <p>Plan every level, browse synchronized feats, compare character options and keep your builds ready for the table.</p>
        <div class="highlights">
          <span>✦ Level-by-level planning</span>
          <span>✦ Campaign variant rules</span>
          <span>✦ Synced Foundry compendiums</span>
        </div>
      </div>
      <div class="login-card panel">
        <div class="kicker">Welcome back</div><h2>Sign in</h2>
        <p class="muted">Pick up where your character left off.</p>
        <form onsubmit={e=>{e.preventDefault();login();}}>
          <label>Username<input required autocomplete="username" bind:value={loginName} placeholder="Your username"/></label>
          <label>Password<input type="password" required autocomplete="current-password" bind:value={loginPassword} placeholder="Your password"/></label>
          <button class="primary-action" disabled={busy}>Sign in →</button>
        </form>
        <p class="small">New player? <a href="/join">Activate your invitation</a></p>
        <button class="setup-link" type="button" onclick={()=>initialSetup=!initialSetup}>Initial server setup</button>
        {#if initialSetup}
          <form class="setup-form" onsubmit={e=>{e.preventDefault();setup();}}>
            <p class="muted">Only available before the first owner account exists.</p>
            <label>Bootstrap token<input type="password" required bind:value={bootstrapSecret}/></label>
            <label>Display name<input required bind:value={bootstrapName}/></label>
            <label>Admin username<input required minlength="3" maxlength="32" bind:value={bootstrapUsername}/></label>
            <label>Admin password<input type="password" required minlength="12" bind:value={bootstrapPassword}/></label>
            <button class="primary-action" disabled={busy}>Create first owner</button>
          </form>
        {/if}
      </div>
    </div>
  {:else}
    <div class="dashboard">
      <div class="welcome">
        <div><div class="kicker">Your workspace</div><h1>Ready for the next level?</h1>
          <p class="muted">Build, explore and plan within the rules of your Foundry campaign.</p></div>
        {#if campaigns.length>0}
          <a class="primary-action" href={'/campaigns/'+encodeURIComponent(activeCampaign)+'/characters'}>Open character builder ↗</a>
        {/if}
      </div>
      {#if campaigns.length===0}
        <div class="panel empty"><span class="decor">◇</span><h2>No campaigns connected</h2>
          <p>Pair your Foundry world to unlock its synced compendiums and character builds.</p></div>
      {:else}
        <div class="world-heading">
          <div><div class="kicker">Active world</div>
            {#if campaigns.length===1}<h2>{currentCampaign?.title}</h2>
            {:else}
              <select class="world-picker" bind:value={activeCampaign}
                onchange={()=>{issuedInvite=null;userMatches=[];run(async()=>Promise.all([loadRoster(),loadRuleset()]));}}>
                {#each campaigns as campaign (campaign.id)}<option value={campaign.id}>{campaign.title}</option>{/each}
              </select>
            {/if}
          </div>
          <span class="role-tag">{currentCampaign?.role==='gm'||me.siteRole==='owner'?'GM access':'Player access'}</span>
        </div>
        <div class="dashboard-grid">
          <section class="panel rules">
            <div class="panel-heading"><div><div class="kicker">Imported campaign rules</div><h2>Ruleset</h2></div>
              <button class="secondary-action" type="button" onclick={()=>run(loadRuleset)} disabled={rulesetLoading}>↻ Refresh</button></div>
            {#if rulesetLoading}<p class="muted">Loading synchronized rules…</p>
            {:else if rulesetError}<p class="muted">{rulesetError}</p>
            {:else if ruleset?.synced}
              <div class="rules-version"><strong>{ruleset.ruleset.systemId?.toUpperCase()} {ruleset.ruleset.systemVersion}</strong>
                <small>Leveler {ruleset.ruleset.levelerVersion||'—'}</small></div>
              <div class="metrics">
                <div><strong>{ruleset.totals.feats}</strong><span>Feats</span></div>
                <div><strong>{ruleset.totals.classes}</strong><span>Classes</span></div>
                <div><strong>{ruleset.totals.savedItems}</strong><span>Items synced</span></div>
              </div>
              {#if ruleset.variants}
                <h3 class="subheading">Variant rules</h3>
                <div class="variants">
                  {#each Object.entries(ruleset.variants).filter(([key,value])=>value===true) as [key]}
                    <span>{variantLabels[key]||key}</span>
                  {:else}<span class="muted">No optional variants reported as enabled.</span>
                  {/each}
                </div>
              {/if}
              <p class="meta">Last synchronized {new Date(ruleset.updatedAt*1000).toLocaleString()}</p>
              <div class="quicklinks">
                <a href={'/campaigns/'+encodeURIComponent(activeCampaign)+'/feats'}>Explore feats ↗</a>
                {#if canManage}<a href={'/campaigns/'+encodeURIComponent(activeCampaign)+'/ruleset'}>Sync details ↗</a>{/if}
              </div>
            {:else}<p class="muted">No compendium data has been received. Ask a GM to synchronize the Foundry world.</p>{/if}
          </section>
          <section class="panel action-card">
            <div class="kicker">Character workshop</div><div class="glyph">✧</div>
            <h2>Shape your next hero.</h2>
            <p>Create a new character or continue a saved build. Advance up to level 20 with searchable feat and item choices.</p>
            <a class="primary-action" href={'/campaigns/'+encodeURIComponent(activeCampaign)+'/characters'}>Browse characters →</a>
          </section>
        </div>
      {/if}

      {#if me.siteRole==='owner'||canManage}
        <details class="admin-panel panel">
          <summary><span><span class="kicker">Campaign administration</span>
            <strong>Players &amp; Foundry pairing</strong></span>
            <span class="muted">Expand settings ▾</span></summary>
          <div class="admin-inner">
            <section class="admin-block">
              <h3>Connect another world</h3>
              <p class="muted">Generate a one-time code for your Foundry Bridge's Pair World dialog.</p>
              <button class="secondary-action" type="button" onclick={pairingCode} disabled={busy}>Generate pairing code</button>
              {#if pairing}
                <div class="code-line"><code>{pairing.code}</code>
                  <button aria-label="Copy pairing code" type="button" onclick={()=>copyText(pairing.code,'Pairing code')}>⧉</button></div>
                <small>Expires {new Date(pairing.expiresAt*1000).toLocaleString()}</small>
              {/if}
            </section>
            {#if activeCampaign&&canManage}
              <section class="admin-block">
                <h3>Players</h3>
                <div class="roster-list">
                  {#each roster as player (player.id)}
                    <div><strong>{player.displayName}</strong><small>{player.role} · {player.status}</small></div>
                  {:else}<p class="muted">No players added yet.</p>{/each}
                </div>
                <button type="button" class="secondary-action" onclick={addNew} disabled={busy}>+ Generate player invitation</button>
                {#if issuedInvite}
                  <div class="invite-box"><div class="copy-heading"><strong>Message to send the player</strong>
                    <button type="button" aria-label="Copy invitation" onclick={()=>copyText(invitationText,'Invitation message')}>⧉ Copy</button></div>
                    <p>{invitationText}</p>
                  </div>
                {/if}
                <div class="existing">
                  <h4>Add an existing account</h4>
                  <form onsubmit={e=>{e.preventDefault();searchUsers();}}>
                    <input required minlength="2" placeholder="Search existing users" bind:value={search}/>
                    <button class="secondary-action" disabled={busy}>Search</button>
                  </form>
                  {#if userMatches.length}
                    <select bind:value={selectedUser}>
                      {#each userMatches as user (user.id)}<option value={user.id}>{user.displayName} ({user.username})</option>{/each}
                    </select>
                    <button class="secondary-action" type="button" disabled={busy||!selectedUser} onclick={addExisting}>Add player</button>
                  {/if}
                </div>
              </section>
            {/if}
          </div>
        </details>
      {/if}
    </div>
  {/if}
  <footer>PF2e Planner · Foundry-connected character planning</footer>
</div>
<style>
  .site-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.2rem 0 1.5rem;
    border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:.85rem;text-decoration:none;color:var(--text)}
  .logo{display:grid;place-items:center;background:var(--accent-bg);border:1px solid var(--accent);
    color:var(--accent);border-radius:13px;font-size:1.6rem;width:46px;height:46px}
  .brand strong,.brand small{display:block}.brand strong{font-size:1.07rem;letter-spacing:-.03em}
  .brand small{font-size:.58rem;letter-spacing:.19em;color:var(--muted);font-weight:700}
  .header-tools{display:flex;align-items:center;gap:.85rem}.signed-in{font-weight:700;color:var(--muted);font-size:.81rem}
  .landing{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(320px,.85fr);align-items:center;
    gap:clamp(2rem,5vw,6rem);min-height:calc(100vh - 180px)}
  .pitch{padding:4rem 0}.pitch h1{font-size:clamp(2.9rem,5.4vw,5.3rem);line-height:1.12;margin:1.2rem 0}
  .pitch h1 em{font-style:normal;color:var(--accent)}
  .pitch p{color:var(--muted);max-width:530px;font-size:1.1rem}
  .highlights{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:2rem}
  .highlights span{font-size:.8rem;border:1px solid var(--line);padding:.5rem .7rem;border-radius:30px;color:var(--muted)}
  .login-card{padding:2rem}.login-card h2{font-size:2rem;margin:.45rem 0}.login-card p{font-size:.85rem}
  .login-card form{display:grid;gap:1rem;margin:1.5rem 0}.login-card label{display:grid;gap:.4rem;font-size:.8rem;font-weight:700}
  .login-card input{width:100%}.login-card .primary-action{width:100%;margin-top:.2rem}
  .login-card .small{margin:1.2rem 0}.setup-link{border:0;background:none;color:var(--muted);text-decoration:underline;font-size:.75rem}
  .setup-form{padding-top:1rem;border-top:1px solid var(--line)}
  .dashboard{padding:2rem 0}.welcome{display:flex;gap:1.3rem;justify-content:space-between;align-items:center;
    margin:1rem 0 3rem}.welcome h1{font-size:clamp(2rem,4vw,3.2rem);margin:.3rem 0}
  .welcome p{margin:.4rem 0}.primary-action{display:inline-flex;align-items:center;justify-content:center;
    text-decoration:none;white-space:nowrap}
  .world-heading{display:flex;gap:1rem;align-items:center;justify-content:space-between;margin:0 0 1rem}
  .world-heading h2{font-size:1.7rem;margin:.25rem 0}.world-picker{min-width:min(360px,90vw);background:var(--surface)}
  .role-tag{border:1px solid var(--line);padding:.4rem .7rem;border-radius:20px;color:var(--muted);font-size:.73rem}
  .dashboard-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(275px,.75fr);gap:1rem}
  .dashboard-grid .panel{padding:1.6rem}.panel-heading{display:flex;justify-content:space-between;gap:1rem}
  .panel-heading h2{margin:.2rem 0 1rem;font-size:1.5rem}
  .rules-version{display:flex;gap:1rem;align-items:baseline;flex-wrap:wrap}
  .rules-version strong{font-size:1.16rem}.rules-version small,.meta{color:var(--muted);font-size:.75rem}
  .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;margin:1.4rem 0}
  .metrics div{background:var(--surface-hover);border:1px solid var(--line);padding:.85rem;border-radius:10px}
  .metrics strong{display:block;font-size:1.65rem;letter-spacing:-.05em;font-weight:800}
  .metrics span{color:var(--muted);font-size:.74rem}
  .subheading{font-size:.8rem;color:var(--muted);margin:1.4rem 0 .6rem}
  .variants{display:flex;flex-wrap:wrap;gap:.45rem}.variants span{border-radius:40px;padding:.3rem .65rem;
    border:1px solid var(--accent);background:var(--accent-bg);color:var(--accent);font-size:.75rem}
  .variants span.muted{border-color:var(--line);background:transparent;color:var(--muted)}
  .meta{margin:1.2rem 0}.quicklinks{display:flex;gap:1.2rem;flex-wrap:wrap;padding-top:.85rem;border-top:1px solid var(--line)}
  .quicklinks a{font-weight:700;font-size:.85rem;text-decoration:none}
  .action-card{position:relative;display:flex;flex-direction:column;align-items:start;overflow:hidden;
    background:linear-gradient(145deg,var(--surface-strong),var(--accent-bg))}
  .action-card .glyph{align-self:end;color:var(--accent);font-size:6rem;line-height:1;opacity:.48}
  .action-card h2{font-size:1.75rem;line-height:1.18;margin:.65rem 0}
  .action-card p{color:var(--muted);font-size:.87rem;line-height:1.65}
  .action-card a{margin-top:auto}.empty{text-align:center;padding:5rem;color:var(--muted)}
  .empty .decor{font-size:4rem;color:var(--accent)}.empty h2{color:var(--text)}
  .admin-panel{margin-top:1rem;overflow:hidden}.admin-panel summary{padding:1.3rem 1.6rem;display:flex;
    justify-content:space-between;align-items:center;cursor:pointer}
  .admin-panel summary strong,.admin-panel summary .kicker{display:block}.admin-panel summary strong{font-size:1.1rem;margin-top:.2rem}
  .admin-panel summary>.muted{font-size:.76rem}
  .admin-inner{border-top:1px solid var(--line);padding:1.5rem;display:grid;grid-template-columns:1fr 1fr;gap:2rem}
  .admin-block h3{margin:.15rem 0}.admin-block p{font-size:.83rem}
  .code-line{display:flex;align-items:center;gap:.6rem;overflow-wrap:anywhere;background:var(--surface-hover);
    padding:.9rem;border-radius:10px;margin:1rem 0}.code-line code{flex:1;font-size:.75rem}
  .code-line button,.copy-heading button{color:var(--accent);background:transparent;border:0;font-weight:700}
  .admin-block>small{color:var(--muted)}.roster-list{display:grid;margin:.8rem 0;gap:.3rem}
  .roster-list div{display:flex;align-items:center;justify-content:space-between;padding:.6rem;
    border-bottom:1px solid var(--line);gap:1rem;font-size:.8rem}.roster-list small{color:var(--muted)}
  .invite-box{padding:1rem;background:var(--surface-hover);border-radius:10px;margin:1rem 0}
  .invite-box p{white-space:pre-wrap;overflow-wrap:anywhere}.copy-heading{display:flex;justify-content:space-between;gap:1rem}
  .existing{margin-top:1.2rem;border-top:1px solid var(--line)}.existing h4{font-size:.9rem}
  .existing form{display:flex;gap:.6rem;flex-wrap:wrap}.existing select{margin:1rem 1rem 0 0}
  .toast{padding:.8rem 1rem;margin-top:1rem;border-radius:10px;background:var(--accent-bg);color:var(--text)}
  .toast.danger{border:1px solid var(--danger-border);color:var(--danger)}
  .loading{display:grid;place-items:center;min-height:75vh;color:var(--muted)}
  footer{padding:2rem 0;text-align:center;font-size:.76rem;color:var(--muted)}
  @media(max-width:900px){.landing,.dashboard-grid,.admin-inner{grid-template-columns:1fr}
    .landing{min-height:unset}.pitch{padding:3rem 0 0}.login-card{max-width:550px}
    .welcome{flex-wrap:wrap}}
  @media(max-width:560px){.site-header{flex-wrap:wrap}.header-tools{width:100%;justify-content:space-between}
    .metrics{gap:.35rem}.metrics div{padding:.6rem}.metrics strong{font-size:1.35rem}
    .admin-panel summary>.muted{display:none}.login-card{padding:1.3rem}}
</style>
