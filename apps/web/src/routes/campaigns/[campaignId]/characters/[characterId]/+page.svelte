<script>
  import {page} from '$app/state';
  import BuilderPf2e from '../../../../../lib/wizard/BuilderPf2e.svelte';
  import Builder5e from '../../../../../lib/wizard5e/Builder5e.svelte';
  import {campaignPath} from '../../../../../lib/ui/api.js';
  import {loadCampaign} from '../../../../../lib/ui/session.js';
  // A campaign character: D&D 5e campaigns use their own builder (lib/wizard5e).
  const campaignId=$derived(page.params.campaignId);
  const characterId=$derived(page.params.characterId);
  let ctx=$state(null);
  let error=$state('');
  $effect(()=>{
    const cid=campaignId;
    loadCampaign(cid).then(loaded=>ctx=loaded).catch(e=>error=e.message);
  });
  const scope=$derived({characterUrl:'/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+encodeURIComponent(characterId),
    catalogBase:'/api/v1/campaigns/'+encodeURIComponent(campaignId),catalogKey:'campaign:'+campaignId,
    sharingUrl:'/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+encodeURIComponent(characterId)+'/sharing',
    home:campaignPath(campaignId),campaignId,publicView:false});
</script>
{#if ctx}
  {#key characterId}
    {#if ctx.campaign.system_id==='dnd5e'}<Builder5e {ctx} {scope}/>{:else}<BuilderPf2e {ctx} {scope}/>{/if}
  {/key}
{:else if error}
  <main class="page"><p class="notice bad" role="alert">{error}</p></main>
{:else}
  <p class="muted" style="padding:32px">Loading the character…</p>
{/if}
