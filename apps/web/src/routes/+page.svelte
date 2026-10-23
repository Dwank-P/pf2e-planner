<script>
  import { onMount } from 'svelte';

  let me = null;
  let campaigns = [];
  let errorText = '';
  let notice = '';
  let busy = false;
  let loginName = '';
  let loginPassword = '';
  let bootstrapSecret = '';
  let bootstrapName = '';
  let bootstrapUsername = '';
  let bootstrapPassword = '';
  let initialSetup = false;
  let activeCampaign = '';
  let roster = [];
  let playerName = '';
  let search = '';
  let userMatches = [];
  let selectedUser = '';
  let issuedInvite = null;
  let pairing = null;

  async function api(path, data = undefined, method = 'POST') {
    const options = { method, credentials: 'same-origin' };
    if (data !== undefined) {
      options.headers = { 'content-type': 'application/json' };
      options.body = JSON.stringify(data);
    }
    const response = await fetch(path, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.message || result.error || `HTTP ${response.status}`);
    return result;
  }

  async function run(operation) {
    errorText = '';
    notice = '';
    busy = true;
    try { await operation(); }
    catch (error) { errorText = error.message || 'Unexpected error'; }
    finally { busy = false; }
  }
  async function refresh() {
    try {
      const result = await api('/api/v1/me', undefined, 'GET');
      me = result.user;
      campaigns = result.campaigns;
      if (!activeCampaign && campaigns.length) activeCampaign = campaigns[0].id;
      await loadRoster();
    } catch { me = null; campaigns = []; roster = []; }
  }
  async function loadRoster() {
    if (!activeCampaign || !me) { roster = []; return; }
    const result = await api('/api/v1/campaigns/' + activeCampaign + '/members', undefined, 'GET');
    roster = result.members;
  }
  async function login() {
    await run(async () => {
      await api('/api/v1/auth/login', { username: loginName, password: loginPassword });
      loginPassword = '';
      await refresh();
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
      me = null; campaigns = []; roster = [];
    });
  }
  async function pairingCode() {
    await run(async () => {
      pairing = await api('/api/v1/pairing-codes', {});
      notice = 'Copy the code into PF2e Planner Bridge in the Foundry GM client. Expires in 10 minutes.';
    });
  }
  async function addNew() {
    await run(async () => {
      issuedInvite = await api('/api/v1/campaigns/' + activeCampaign + '/members', { displayName: playerName });
      playerName = '';
      notice = 'Player account reserved. Share the one-time code privately; the player sets their own username and password.';
      await loadRoster();
    });
  }
  async function searchUsers() {
    await run(async () => {
      const response = await api('/api/v1/users?q=' + encodeURIComponent(search), undefined, 'GET');
      userMatches = response.users;
      selectedUser = response.users[0]?.id ?? '';
    });
  }
  async function addExisting() {
    await run(async () => {
      const response = await api('/api/v1/campaigns/' + activeCampaign + '/members', { existingUserId: selectedUser });
      notice = response.alreadyMember ? 'User already belongs to this campaign.' : 'Existing user added. Their password is unchanged.';
      await loadRoster();
    });
  }
  onMount(refresh);
</script>

<svelte:head>
  <title>PF2e Planner</title>
  <meta name="description" content="Self-hosted PF2e / SF2e character planner" />
</svelte:head>

<main>
  <header>
    <div><span class="eyebrow">FOUNDRY-INTEGRATED PLANNING</span><h1>PF2e Planner</h1></div>
    {#if me}<button class="quiet" onclick={logout} disabled={busy}>Sign out</button>{/if}
  </header>
  {#if errorText}<p class="alert" role="alert">{errorText}</p>{/if}
  {#if notice}<p class="success" role="status">{notice}</p>{/if}

  {#if !me}
    <section>
      <h2>Sign in</h2>
      <form onsubmit={(e) => { e.preventDefault(); login(); }}>
        <label>Username <input required autocomplete="username" bind:value={loginName}/></label>
        <label>Password <input type="password" required autocomplete="current-password" bind:value={loginPassword}/></label>
        <button disabled={busy}>Sign in</button>
      </form>
      <p>New player? Your GM will provide a one-time code. <a href="/join">Activate your account</a>.</p>
    </section>
    <section>
      <button class="quiet" onclick={() => initialSetup = !initialSetup}>Initial server setup</button>
      {#if initialSetup}
        <p>Only works before the first owner exists. Obtain the bootstrap secret from the server environment.</p>
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
    <section>
      <h2>Pair a Foundry world</h2>
      <p>From an authorized GM account, generate a single-use pairing code, then paste it into the Foundry Bridge pairing dialog.</p>
      <button disabled={busy} onclick={pairingCode}>Generate pairing code</button>
      {#if pairing}
        <div class="secret"><strong>One-time pairing code</strong><code>{pairing.code}</code><small>Expires: {new Date(pairing.expiresAt * 1000).toLocaleString()}</small></div>
      {/if}
    </section>

    <section>
      <h2>Campaigns</h2>
      {#if campaigns.length === 0}
        <p>No campaigns yet. Pair a Foundry world to create one automatically.</p>
      {:else}
        <label>World
          <select bind:value={activeCampaign} onchange={() => { issuedInvite = null; userMatches = []; run(loadRoster); }}>
            {#each campaigns as campaign}
              <option value={campaign.id}>{campaign.title} — {campaign.system_id}</option>
            {/each}
          </select>
        </label>
        <h3>Players</h3>
        <table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>{#each roster as player}
            <tr><td>{player.displayName}</td><td>{player.username || 'Not activated'}</td><td>{player.role}</td><td>{player.status}</td></tr>
          {/each}</tbody>
        </table>
        <div class="cols">
          <div>
            <h3>Add existing user</h3>
            <p>Search users who may already belong to other worlds.</p>
            <form onsubmit={(e) => { e.preventDefault(); searchUsers(); }}>
              <label>Find user <input minlength="2" bind:value={search}/></label>
              <button disabled={busy}>Search</button>
            </form>
            {#if userMatches.length}
              <label>Match
                <select bind:value={selectedUser}>
                  {#each userMatches as user}
                    <option value={user.id}>{user.displayName} ({user.username})</option>
                  {/each}
                </select>
              </label>
              <button disabled={busy || !selectedUser} onclick={addExisting}>Add selected user</button>
            {/if}
          </div>
          <div>
            <h3>Create new player</h3>
            <form onsubmit={(e) => { e.preventDefault(); addNew(); }}>
              <label>Player display name <input required maxlength="80" bind:value={playerName}/></label>
              <button disabled={busy}>Add player &amp; generate code</button>
            </form>
            {#if issuedInvite}
              <div class="secret">
                <strong>Share once — activation code</strong>
                <code>{issuedInvite.inviteCode}</code>
                <small>Player opens {issuedInvite.joinUrl}, enters code and creates username/password.</small>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <footer>Integration foundation · no character building or production sync yet</footer>
</main>
<style>
  :global(body) { margin:0; background:#101820; color:#f0f4f6; font:16px system-ui, sans-serif; }
  main { max-width:1000px; margin:0 auto; padding:2rem; }
  header { display:flex; justify-content:space-between; align-items:center; }
  .eyebrow {color:#8db4c4; font-weight:bold; letter-spacing:.13em;font-size:.78rem;}
  h1 {font-size:3rem; margin:.2rem 0 1.5rem;}
  section {background:#1d2934; padding:1.5rem; margin:1rem 0; border:1px solid #415260;border-radius:10px;}
  h2 {margin-top:0;}
  p {line-height:1.5}
  label {display:block; margin:1rem 0; font-weight:600;}
  input,select {display:block; width:100%; box-sizing:border-box; margin-top:.35rem; padding:.65rem; background:#0f1d27; color:#fff; border:1px solid #668092; border-radius:5px; font:inherit;}
  button {padding:.68rem 1rem; background:#b7d6e7; color:#102029; border:0; border-radius:5px; font:inherit; font-weight:700; cursor:pointer; }
  button:disabled {opacity:.6; cursor:not-allowed;}
  button.quiet {background:transparent; border:1px solid #90a6b6;color:#e6eff5;}
  .cols {display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:1rem;}
  .secret {border:1px solid #9cbfd4; padding:1rem; margin:1rem 0; background:#273a4a;overflow-wrap:anywhere;}
  .secret strong, .secret code,.secret small {display:block;margin:.5rem 0}
  code {font-family:monospace;font-size:1rem;user-select:all;}
  table {width:100%;border-collapse:collapse;} td,th{padding:.6rem;text-align:left;border-bottom:1px solid #3b5261;}
  .alert {padding:1rem;background:#6e2727;color:#fff;} .success{padding:1rem;background:#23543a;color:#fff;}
  a{color:#a8d5ff;} footer{color:#8ba0af;margin:2rem 0;}
  @media(max-width:720px){.cols{grid-template-columns:1fr;} header{gap:1rem;} h1{font-size:2.1rem;}}
</style>
