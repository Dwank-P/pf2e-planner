<script>
  import {tr} from '../lib/i18n/index.js';
  import {page} from '$app/state';
  /** Friendly error page (unknown links, server errors). */
  const notFound=$derived(page.status===404);
</script>
<svelte:head><title>{tr("{0} · PF2e Planner", notFound?tr('Not found'):tr('Something went wrong'))}</title></svelte:head>
<main class="page oops">
  <span class="eyebrow">{page.status}</span>
  <h1>{notFound?tr('That page isn’t here'):tr('Something went wrong')}</h1>
  <p class="muted">{notFound?tr('The link may be old, or the character or campaign was removed.')
    :tr('The planner hit an error. Try again in a moment; if it keeps happening, tell the server owner.')}</p>
  <p class="row"><a class="btn primary" href="/">{tr("Go to your campaigns")}</a><a class="btn ghost" href="/characters">{tr("My characters")}</a></p>
</main>
<style>
  .oops{max-width:640px;padding-top:72px;display:grid;gap:12px}
  h1{font-size:clamp(1.6rem,4vw,2.2rem);font-weight:800}
  p{margin:0}
  .row{display:flex;gap:8px;flex-wrap:wrap}
</style>
