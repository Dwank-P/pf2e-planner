<script>
  import {page} from '$app/state';
  import {getContext} from 'svelte';
  /**
   * An item's icon from this campaign's world (uploaded by the Bridge on sync), or from a
   * personal character's sources.
   * Renders nothing until the GM syncs icons, or when the file is missing.
   */
  let {src=null,size=32,alt=''}=$props();
  let failed=$state(false);
  // Builders for personal characters and public links set their own catalog address.
  const contextBase=getContext('catalogBase');
  const base=$derived(contextBase??(page.params.campaignId?'/api/v1/campaigns/'+page.params.campaignId:null));
  const url=$derived(src&&base&&!/^[a-z]+:|^\//i.test(src)
    ?`${base}/icons/${src.split('/').map(encodeURIComponent).join('/')}`:null);
  $effect(()=>{url;failed=false;});
</script>
{#if url&&!failed}
  <img class="icon" src={url} {alt} width={size} height={size} loading="lazy" decoding="async"
    style:--size={size+'px'} onerror={()=>failed=true}/>
{/if}
<style>
  .icon{width:var(--size);height:var(--size);border-radius:6px;object-fit:cover;flex:none;background:var(--panel-2)}
</style>
