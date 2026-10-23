<svelte:head>
  <title>PF2e Planner — Development</title>
  <meta name="description" content="PF2e/SF2e character planning prototype" />
</svelte:head>
<main>
  <p class="eyebrow">PROJECT BOOTSTRAP</p>
  <h1>PF2e Planner</h1>
  <p>Foundry-integrated PF2e/SF2e character creation and advancement planning.</p>
  <div class="status">Web shell running · pairing and sync are not implemented yet.</div>
  <p>Next milestone: pair a Foundry world and transfer a class/feat snapshot.</p>
  <a href="/health">Health endpoint</a>
</main>
<style>
  :global(body) { margin: 0; background: #101820; color: #edf3f6; font: 16px system-ui, sans-serif; }
  main { max-width: 760px; margin: 12vh auto; padding: 2rem; }
  .eyebrow { color: #8fbccc; letter-spacing: .15em; font-weight: 700; font-size: .75rem; }
  h1 { font-size: clamp(2.5rem, 7vw, 4rem); margin: .2em 0; }
  p { line-height: 1.6; }
  .status { border: 1px solid #476471; background: #1c2a34; padding: 1rem; border-radius: .5rem; }
  a { color: #afd6ff; }
</style>
