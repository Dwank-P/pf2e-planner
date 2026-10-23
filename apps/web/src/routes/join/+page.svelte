<script>
  let step = $state('code');
  let code = $state('');
  let username = $state('');
  let password = $state('');
  let confirm = $state('');
  let errorText = $state('');
  let busy = $state(false);

  async function call(path, data) {
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (result.message === 'invalid_or_expired_code') {
        throw Error('This invitation code is invalid, expired or already used. Ask your GM for another.');
      }
      if (result.message === 'username_unavailable') throw Error('That username is already taken. Try another.');
      throw Error(result.message || 'Unable to complete this step.');
    }
    return result;
  }

  async function validateCode(event) {
    event.preventDefault();
    errorText = ''; busy = true;
    try {
      code = code.trim();
      const result = await call('/api/v1/join/validate', { code });
      if (!result.valid) throw Error('This invitation cannot be used.');
      step = 'account';
    } catch (error) { errorText = error.message; }
    finally { busy = false; }
  }

  async function activate(event) {
    event.preventDefault();
    errorText = '';
    if (password !== confirm) { errorText = 'Passwords do not match.'; return; }
    busy = true;
    try {
      await call('/api/v1/join/redeem', { code, username, password });
      code = password = confirm = '';
      const check = await fetch('/api/v1/me', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store'
      });
      if (!check.ok) {
        throw Error('Your account was activated, but sign-in was not retained. Return to Sign in using your new username and password.');
      }
      step = 'done';
    } catch (error) { errorText = error.message; }
    finally { busy = false; }
  }
</script>

<svelte:head><title>Join PF2e Planner</title></svelte:head>
<main>
  <p class="eyebrow">PF2E PLANNER · INVITATION</p>
  {#if step === 'code'}
    <div class="step">Step 1 of 2</div>
    <h1>Join PF2e Planner</h1>
    <p>Enter the one-time invitation code your GM sent you. We'll check that it's valid before you create your account.</p>
    {#if errorText}<p role="alert" class="error">{errorText}</p>{/if}
    <form onsubmit={validateCode}>
      <label>Invitation code
        <input required autocomplete="off" spellcheck="false" autocapitalize="off"
          placeholder="Paste your invitation code" bind:value={code}/>
      </label>
      <button disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Validate code'}</button>
    </form>
  {:else if step === 'account'}
    <div class="step">Step 2 of 2 · Invitation verified</div>
    <h1>Create your account</h1>
    <p>Your invitation is valid. Choose a username and password. You'll use these across any campaigns you're invited to.</p>
    {#if errorText}<p role="alert" class="error">{errorText}</p>{/if}
    <form onsubmit={activate}>
      <label>Username
        <input required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_.-]{3,32}"
          autocomplete="username" autocapitalize="off" bind:value={username}/>
      </label>
      <label>Password (12+ characters)
        <input type="password" required minlength="12" maxlength="256"
          autocomplete="new-password" bind:value={password}/>
      </label>
      <label>Confirm password
        <input type="password" required minlength="12" maxlength="256"
          autocomplete="new-password" bind:value={confirm}/>
      </label>
      <div class="actions">
        <button type="button" class="quiet" onclick={() => { step = 'code'; errorText = ''; }}>Back</button>
        <button disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </div>
    </form>
  {:else}
    <div class="step">Complete</div>
    <h1>You're in!</h1>
    <p>Your account has been activated. You're signed in and can use the same account for other campaigns.</p>
    <a class="button" href="/">Open PF2e Planner</a>
  {/if}
  <footer>Already have an account? <a href="/">Sign in</a></footer>
</main>
<style>
  :global(body){margin:0;background:#101820;color:#f0f4f6;font:16px system-ui,sans-serif;}
  main{max-width:530px;margin:8vh auto;padding:2rem;background:#1d2934;border:1px solid #415260;border-radius:10px;}
  .eyebrow{color:#9abfd1;font-size:.78rem;font-weight:700;letter-spacing:.12em;}
  .step{display:inline-block;border-radius:30px;background:#274558;padding:.35rem .8rem;color:#b7deed;font-size:.82rem;font-weight:600;}
  h1{font-size:2rem;margin:1rem 0 .5rem;}p{line-height:1.6;}
  label{display:block;margin:1.25rem 0;font-weight:600;}
  input{display:block;box-sizing:border-box;width:100%;padding:.8rem;margin-top:.4rem;background:#09151e;color:#fff;border:1px solid #6d889b;border-radius:5px;font:inherit;}
  button,.button{display:inline-block;background:#b7d6e7;color:#102029;padding:.75rem 1.1rem;border:0;border-radius:5px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;}
  button:disabled{opacity:.65;cursor:not-allowed;}button.quiet{background:transparent;color:#eff6fb;border:1px solid #8199aa;}
  .actions{display:flex;gap:.75rem;}
  .error{padding:.8rem;border:1px solid #d88989;background:#602729;border-radius:5px;}
  a{color:#addaff;}footer{margin-top:2.5rem;color:#a3b2bc;}
</style>
