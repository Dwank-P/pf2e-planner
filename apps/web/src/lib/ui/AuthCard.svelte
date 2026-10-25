<script>
  /** Centered card for sign-in, setup and invitation screens. */
  let {title,subtitle='',children,footer}=$props();
</script>
<main class="auth">
  <div class="card panel">
    <a class="brand" href="/"><span class="mark" aria-hidden="true"></span>PF2e Planner</a>
    <div class="head"><h1>{title}</h1>{#if subtitle}<p class="muted">{subtitle}</p>{/if}</div>
    {@render children()}
  </div>
  {#if footer}<div class="footer">{@render footer()}</div>{/if}
</main>
<style>
  .auth{min-height:100vh;display:grid;place-content:center;gap:16px;
    padding:32px max(16px,env(safe-area-inset-right,0px)) 32px max(16px,env(safe-area-inset-left,0px));
    background:radial-gradient(1200px 600px at 50% -10%,var(--brass-soft),transparent 70%),var(--bg)}
  .card{width:min(420px,100%);padding:28px;display:grid;gap:20px;box-shadow:var(--shadow)}
  .brand{display:flex;align-items:center;gap:8px;font:800 15px var(--display);color:var(--text);text-decoration:none}
  .mark{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,var(--brass-strong),var(--brass) 55%,#7a5714)}
  .head{display:grid;gap:6px}
  h1{font-size:1.6rem;font-weight:800}
  .footer{text-align:center;color:var(--muted);font-size:.88rem;display:grid;gap:6px}
</style>
