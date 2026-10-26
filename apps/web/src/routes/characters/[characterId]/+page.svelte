<script>
  import {page} from '$app/state';
  import BuilderPf2e from '../../../lib/wizard/BuilderPf2e.svelte';
  import Builder5e from '../../../lib/wizard5e/Builder5e.svelte';
  import SourcesPanel from '../../../lib/personal/SourcesPanel.svelte';
  import PersonalShare from '../../../lib/personal/PersonalShare.svelte';
  import CopyPanel from '../../../lib/personal/CopyPanel.svelte';
  import {api} from '../../../lib/ui/api.js';
  import {requireSession} from '../../../lib/ui/session.js';
  import {forgetCatalog} from '../../../lib/builder/catalog.js';
  /** A personal character: the usual builder, reading the character's own sources and rules. */
  const characterId=$derived(page.params.characterId);
  let ctx=$state(null);
  let character=$state(null);
  let error=$state('');
  let panel=$state(null);
  // Bumped when sources or rules change, so the builder reloads the combined catalog.
  let version=$state(0);
  $effect(()=>{
    const id=characterId;
    (async()=>{
      try{
        const [session,result]=await Promise.all([requireSession(),api('/api/v1/personal/'+encodeURIComponent(id))]);
        ctx={me:session.user,campaigns:session.campaigns,campaign:null,sync:null};
        character=result.character;
        if(character.access.manage&&!character.sources.length)panel='sources';
      }catch(e){error=e.message;}
    })();
  });
  const base=$derived('/api/v1/personal/'+encodeURIComponent(characterId));
  const scope=$derived({characterUrl:base,catalogBase:base,catalogKey:'personal:'+characterId,sharingUrl:null,
    home:'/characters',campaignId:null,publicView:false,onShare:()=>panel='share'});
  function saved(result){
    character={...character,variants:result.variants,sources:result.sources};
    forgetCatalog('personal:'+characterId);
    version++;
  }
  const unavailable=$derived((character?.sources??[]).filter(s=>!s.available).length);
</script>
{#if ctx&&character}
  {#key version}
    {#snippet actions()}
      {#if character.access.manage}<button class="btn small ghost" onclick={()=>panel='sources'}>Rules &amp; sources</button>{/if}
      <button class="btn small ghost" onclick={()=>panel='copy'}>Copy to campaign</button>
    {/snippet}
    {#snippet banner()}
      {#if !character.sources.length}
        <div class="banner"><p class="notice">This character has no sources yet{character.access.manage?'':' — its owner picks them'}.
          {#if character.access.manage}<button class="link" onclick={()=>panel='sources'}>Choose rules &amp; sources</button>{/if}</p></div>
      {:else if unavailable||character.keptItems}
        <div class="banner"><p class="notice muted">{unavailable?unavailable+' source'+(unavailable===1?' is':'s are')+' no longer shared. ':''}
          {character.keptItems?character.keptItems+' picked item'+(character.keptItems===1?' is':'s are')+' kept from removed sources.':''}</p></div>
      {/if}
    {/snippet}
    {#if character.system==='dnd5e'}<Builder5e {ctx} {scope} {actions} {banner}/>{:else}<BuilderPf2e {ctx} {scope} {actions} {banner}/>{/if}
  {/key}
  {#if panel==='sources'}<SourcesPanel {character} onClose={()=>panel=null} onSaved={saved}/>{/if}
  {#if panel==='share'}<PersonalShare {characterId} onClose={()=>panel=null}/>{/if}
  {#if panel==='copy'}<CopyPanel {character} campaigns={ctx.campaigns} onClose={()=>panel=null}/>{/if}
{:else if error}
  <main class="page"><p class="notice bad" role="alert">{error}</p><a href="/characters">My characters</a></main>
{:else}
  <p class="muted" style="padding:32px">Loading the character…</p>
{/if}
<style>
  .banner{padding:12px max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px))}
  .link{background:none;border:0;color:var(--brass);text-decoration:underline;padding:0;font:inherit}
</style>
