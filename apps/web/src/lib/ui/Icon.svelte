<script>
  import {page} from '$app/state';
  /**
   * An item's icon from this campaign's world (uploaded by the Bridge on sync).
   * Renders nothing until the GM syncs icons, or when the file is missing.
   */
  let {src=null,size=32,alt=''}=$props();
  let failed=$state(false);
  const campaignId=$derived(page.params.campaignId);
  const url=$derived(src&&campaignId&&!/^[a-z]+:|^\//i.test(src)
    ?`/api/v1/campaigns/${campaignId}/icons/${src.split('/').map(encodeURIComponent).join('/')}`:null);
  $effect(()=>{url;failed=false;});
</script>
{#if url&&!failed}
  <img class="icon" src={url} {alt} width={size} height={size} loading="lazy" decoding="async"
    style:--size={size+'px'} onerror={()=>failed=true}/>
{/if}
<style>
  .icon{width:var(--size);height:var(--size);border-radius:6px;object-fit:cover;flex:none;background:var(--panel-2)}
</style>
