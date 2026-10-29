<script>
  import {tr} from '../../../lib/i18n/index.js';
  import {page} from '$app/state';
  import BuilderPf2e from '../../../lib/wizard/BuilderPf2e.svelte';
  import Builder5e from '../../../lib/wizard5e/Builder5e.svelte';
  import {api} from '../../../lib/ui/api.js';
  /** A personal character opened from its public link: read-only, no sign-in needed. */
  const token=$derived(page.params.token);
  let character=$state(null);
  let error=$state('');
  $effect(()=>{
    api('/api/v1/public/'+encodeURIComponent(token)).then(r=>character=r.character)
      .catch(e=>error=e.status===404?'This link doesn’t work any more — the owner may have turned it off or made a new one.':e.message);
  });
  const ctx={me:null,campaigns:[],campaign:null,sync:null};
  const base=$derived('/api/v1/public/'+encodeURIComponent(token));
  const scope=$derived({characterUrl:base,catalogBase:base,catalogKey:'public:'+token,sharingUrl:null,
    home:'/',campaignId:null,publicView:true,exportUrl:base+'/export'});
</script>
<svelte:head><meta name="robots" content="noindex"/></svelte:head>
{#if character}
  {#if character.system==='dnd5e'}<Builder5e {ctx} {scope}/>{:else}<BuilderPf2e {ctx} {scope}/>{/if}
{:else if error}
  <main class="page"><p class="notice bad" role="alert">{error}</p></main>
{:else}
  <p class="muted" style="padding:32px">{tr("Loading the character…")}</p>
{/if}
