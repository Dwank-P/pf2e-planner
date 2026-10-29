<script>
  import {page} from '$app/state';
  import {getContext} from 'svelte';
  import {tr} from '../i18n/index.js';
  /**
   * An item's icon from this campaign's world (uploaded by the Bridge on sync), or from a
   * personal character's sources.
   * Renders nothing until the GM syncs icons, or when the file is missing.
   * onzoom(url): makes the icon a button that opens it full size.
   */
  let {src=null,size=32,alt='',onzoom=null}=$props();
  let failed=$state(false);
  // Builders for personal characters and public links set their own catalog address.
  const contextBase=getContext('catalogBase');
  const base=$derived(contextBase??(page.params.campaignId?'/api/v1/campaigns/'+page.params.campaignId:null));
  const url=$derived(src&&base&&!/^[a-z]+:|^\//i.test(src)
    ?`${base}/icons/${src.split('/').map(encodeURIComponent).join('/')}`:null);
  $effect(()=>{url;failed=false;});
</script>
{#if url&&!failed}
  {#if onzoom}
    <button type="button" class="zoom" title={tr("Enlarge image")} aria-label={tr("Enlarge image")} onclick={()=>onzoom(url)}>
      <img class="icon" src={url} {alt} width={size} height={size} loading="lazy" decoding="async"
        style:--size={size+'px'} onerror={()=>failed=true}/>
    </button>
  {:else}
    <img class="icon" src={url} {alt} width={size} height={size} loading="lazy" decoding="async"
      style:--size={size+'px'} onerror={()=>failed=true}/>
  {/if}
{/if}
<style>
  .icon{width:var(--size);height:var(--size);border-radius:6px;object-fit:cover;flex:none;background:var(--panel-2)}
  .zoom{padding:0;border:0;background:none;border-radius:6px;cursor:zoom-in;flex:none;line-height:0}
  .zoom:focus-visible{outline:2px solid var(--brass);outline-offset:2px}
</style>
