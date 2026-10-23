<script>
  import { onMount } from 'svelte';

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

  onMount(() => { refresh(); });
</script>

<svelte:head>
  <title>PF2e Planner</title>
  <meta name="description" content="Foundry-integrated Pathfinder 2e / Starfinder 2e planner" />
</svelte:head>

{#snippet copyButton(text, label)}
  <button type="button" class="copy-btn" aria-label={'Copy ' + label} title={'Copy ' + label}
    onclick={() => copyText(text, label)}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none"
      stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
    </svg>
    <span class="sr-only">Copy {label}</span>
  </button>
{/snippet}

<main>
  <header>
    <div><span class="eyebrow">FOUNDRY-INTEGRATED PLANNING</span><h1>PF2e Planner</h1></div>
    {#if me}<button class="quiet" type="button" onclick={logout} disabled={busy}>Sign out</button>{/if}
  </header>
  {#if errorText}<p class="alert" role="alert">{errorText}</p>{/if}
  {#if notice}<p class="success" role="status">{notice}</p>{/if}
  {#if copyStatus}<p class="success" role="status">{copyStatus}</p>{/if}

  {#if booting}
    <section><p>Checking your session…</p></section>
  {:else if !me}
    <section class="login">
      <h2>Sign in</h2>
      <form onsubmit={(e) => { e.preventDefault(); login(); }}>
        <label>Username <input required autocomplete="username" bind:value={loginName}/></label>
        <label>Password <input type="password" required autocomplete="current-password" bind:value={loginPassword}/></label>
        <button disabled={busy}>Sign in</button>
      </form>
      <p>New player? <a href="/join">Activate your account with an invitation code.</a></p>
    </section>
    <section>
      <button class="quiet" type="button" onclick={() => initialSetup = !initialSetup}>Initial server setup</button>
      {#if initialSetup}
        <p>Only available before the first owner account exists.</p>
        <form onsubmit={(e) => { e.preventDefault(); setup(); }}>
          <label>Bootstrap token <input type="password" required bind:value={bootstrapSecret}/></label>
          <label>Display name <input required bind:value={bootstrapName}/></label>
          <label>Admin username <input required minlength="3" maxlength="32" bind:value={bootstrapUsername}/></label>
          <label>Admin password <input type="password" required minlength="12" autocomplete="new-password" bind:value={bootstrapPassword}/></label>
          <button disabled={busy}>Create first owner</button>
        </form>
      {/if}
    </section>
  {:else}
    <p>Signed in as <strong>{me.displayName}</strong> ({me.siteRole})</p>
    {#if me.siteRole === 'owner' || campaigns.some(c => c.role === 'gm')}
      <section>
        <h2>Pair a Foundry world</h2>
        <p>Generate a code and enter it in the <strong>PF2e Planner Bridge → Connection Settings</strong> menu in Foundry.</p>
        <button type="button" disabled={busy} onclick={pairingCode}>Generate pairing code</button>
        {#if pairing}
          <div class="secret">
            <strong>One-time pairing code</strong>
            <div class="copy-row">
              <code>{pairing.code}</code>
              {@render copyButton(pairing.code, 'pairing code')}
            </div>
            <small>Expires {new Date(pairing.expiresAt * 1000).toLocaleString()}. Do not share with players.</small>
          </div>
        {/if}
      </section>
    {/if}

    <section>
      <h2>Campaigns</h2>
      {#if campaigns.length === 0}
        <p>No campaigns yet. Pair a Foundry world to create one.</p>
      {:else}
        <label>World
          <select bind:value={activeCampaign}
            onchange={() => { issuedInvite = null; userMatches = []; run(async () => {
              await Promise.all([loadRoster(), loadRuleset()]);
            }); }}>
            {#each campaigns as campaign (campaign.id)}
              <option value={campaign.id}>{campaign.title} — {campaign.system_id}</option>
            {/each}
          </select>
        </label>
        <div class="ruleset-card" aria-label="Campaign ruleset status">
          <div class="ruleset-head"><h3>Campaign ruleset</h3>
            <button type="button" class="quiet" disabled={rulesetLoading}
              onclick={() => run(loadRuleset)}>Refresh status</button></div>
          {#if rulesetLoading}
            <p>Checking what the website has received…</p>
          {:else if rulesetError}
            <p class="alert">Unable to read ruleset status: {rulesetError}</p>
          {:else if ruleset?.synced}
            <div class="ruleset-stats">
              <div><strong>{ruleset.ruleset.systemId?.toUpperCase() ?? 'System'} {ruleset.ruleset.systemVersion ?? '?'}</strong><span>Rules system</span></div>
              <div><strong>Leveler {ruleset.ruleset.levelerVersion ?? '?'}</strong><span>Module version</span></div>
              <div><strong>{ruleset.totals.classes} classes</strong><span>Saved in SQLite</span></div>
              <div><strong>{ruleset.totals.feats} feats</strong><span>Saved in SQLite</span></div>
              <div><strong>{ruleset.complete ? 'Selected packs' : 'Preview only'}</strong><span>Sync scope</span></div>
            </div>
            <p><span class="partial">{ruleset.complete ? 'Selected packs imported' : 'Partial preview'}</span> · Last received {new Date(ruleset.updatedAt * 1000).toLocaleString()}</p>
            {#if ruleset.variants}
              <p><strong>Variant rules:</strong>
                {Object.entries(ruleset.variants).map(([key,value]) => key.replace(/([A-Z])/g,' $1') + ': ' + (value === null ? 'Unknown' : String(value))).join(' · ')}
              </p>
            {/if}
            <p class="muted">{ruleset.complete ? 'All feat/class Items in GM-selected packs; spell/equipment/ancestry import still pending.' : 'Only the first 1,000 core feat entries. Full descriptions and variant settings not yet imported.'}</p>
            {#if ruleset.complete}
              <p><a href={'/campaigns/' + encodeURIComponent(activeCampaign) + '/feats'}>Browse imported feats &amp; descriptions →</a></p>
            {/if}
            {#if canManage}<a href={'/campaigns/' + encodeURIComponent(activeCampaign) + '/ruleset'}>View received data &amp; sync details →</a>{/if}
          {:else}
            <p>No ruleset snapshot received. Authorize this Foundry world and run Sync Now in the bridge.</p>
          {/if}
        </div>
        {#if canManage}
          <h3>Players</h3>
          {#if roster.length}
            <table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>{#each roster as player (player.id)}
                <tr><td>{player.displayName}</td><td>{player.username || 'Not activated'}</td>
                  <td>{player.role}</td><td>{player.status}</td></tr>
              {/each}</tbody>
            </table>
          {:else}
            <p>No players have been added yet.</p>
          {/if}
          <div class="cols">
            <div>
              <h3>Add existing user</h3>
              <p>Find someone who already has a Planner account from another world.</p>
              <form onsubmit={(e) => { e.preventDefault(); searchUsers(); }}>
                <label>Find user <input required minlength="2" bind:value={search}/></label>
                <button disabled={busy}>Search</button>
              </form>
              {#if userMatches.length}
                <label>Match
                  <select bind:value={selectedUser}>
                    {#each userMatches as user (user.id)}
                      <option value={user.id}>{user.displayName} ({user.username})</option>
                    {/each}
                  </select>
                </label>
                <button type="button" disabled={busy || !selectedUser} onclick={addExisting}>Add selected user</button>
              {/if}
            </div>
            <div>
              <h3>Invite a new player</h3>
              <p>Generate a single-use invitation. The player chooses their own username and password.</p>
              <button type="button" disabled={busy} onclick={addNew}>Generate invitation</button>
            </div>
          </div>
          {#if issuedInvite}
            <div class="secret invitation" aria-label="Player invitation">
              <div class="message-heading">
                <strong>Message to send to the player</strong>
                {@render copyButton(invitationText, 'invitation message')}
              </div>
              <p class="invite-message">{invitationText}</p>
              <small>This code is displayed once and expires in 24 hours. Send it privately.</small>
            </div>
          {/if}
        {:else}
          <div class="status">You're a player in this campaign. Character planning will appear here in a later release.</div>
        {/if}
      {/if}
    </section>
  {/if}
  <footer>Development preview · character building not yet implemented</footer>
</main>
<style>
  :global(body) { margin:0; background:#101820; color:#f0f4f6; font:16px system-ui,sans-serif; }
  main { max-width:1000px; margin:0 auto; padding:2rem; }
  header { display:flex; justify-content:space-between; align-items:center; gap:1rem; }
  .eyebrow {color:#8db4c4; font-weight:bold; letter-spacing:.13em;font-size:.78rem;}
  h1 {font-size:3rem; margin:.2rem 0 1.5rem;}
  section {background:#1d2934; padding:1.5rem; margin:1rem 0; border:1px solid #415260;border-radius:10px;}
  h2 {margin-top:0;}
  p {line-height:1.5}
  label {display:block; margin:1rem 0; font-weight:600;}
  input,select {display:block; width:100%; box-sizing:border-box; margin-top:.35rem; padding:.65rem; background:#0f1d27; color:#fff; border:1px solid #668092; border-radius:5px; font:inherit;}
  button {padding:.68rem 1rem; background:#b7d6e7; color:#102029; border:0; border-radius:5px; font:inherit; font-weight:700; cursor:pointer;}
  button:disabled {opacity:.6; cursor:not-allowed;}
  button.quiet {background:transparent; border:1px solid #90a6b6;color:#e6eff5;}
  .cols {display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:1rem;}
  .secret {border:1px solid #9cbfd4; padding:1rem; margin:1rem 0; background:#273a4a;overflow-wrap:anywhere;}
  .secret strong,.secret small {display:block;margin:.5rem 0}
  .copy-row,.message-heading {display:flex;align-items:center;gap:.5rem;justify-content:space-between;}
  .copy-row code {flex:1;min-width:0;overflow-wrap:anywhere}
  .copy-btn {display:inline-flex;align-items:center;justify-content:center;min-width:40px;min-height:40px;border:1px solid #93bdcf;background:#142b3a;color:#fff;padding:.5rem; flex:0 0 auto;}
  .copy-btn:hover {background:#365568;}
  .invite-message {white-space:pre-wrap;line-height:1.75;overflow-wrap:anywhere;}
  code {font-family:monospace;font-size:1rem;user-select:all;}
  table {width:100%;border-collapse:collapse;} td,th{padding:.6rem;text-align:left;border-bottom:1px solid #3b5261;}
  .alert {padding:1rem;background:#6e2727;color:#fff;} .success{padding:1rem;background:#23543a;color:#fff;}
  a{color:#a8d5ff;} footer{color:#8ba0af;margin:2rem 0;}
  .status{padding:1rem;background:#263847;border-radius:4px;}
  .ruleset-card{margin:1rem 0;padding:1.25rem;border:1px solid #537384;border-radius:7px;background:#132633}
  .ruleset-head{display:flex;align-items:center;justify-content:space-between;gap:.6rem}
  .ruleset-head h3{margin:0}
  .ruleset-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem;margin-top:1rem}
  .ruleset-stats div{background:#263947;padding:.8rem;border-radius:5px}
  .ruleset-stats strong{display:block;overflow-wrap:anywhere}
  .ruleset-stats span,.muted{color:#b0c0cb;font-size:.85rem}
  .partial{background:#59441b;border:1px solid #bf9852;border-radius:4px;color:#ffe4ab;padding:.2rem .4rem}
  @media(max-width:720px){.ruleset-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;}
  @media(max-width:720px){.cols{grid-template-columns:1fr;} header{gap:1rem;} h1{font-size:2.1rem;}}
</style>
