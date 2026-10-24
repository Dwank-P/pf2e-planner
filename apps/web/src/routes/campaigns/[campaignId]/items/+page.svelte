<script>
  import {onMount} from 'svelte';
  import ItemInspector from '../../../../lib/ItemInspector.svelte';
  let campaignId=$state('');
  let level=$state(1);
  let item=$state(null);
  let history=$state([]);
  let errorText=$state('');
  let busy=$state(true);
  async function lookup(){
    busy=true;
    try{
      const params=new URLSearchParams(window.location.search);
      campaignId=decodeURIComponent(window.location.pathname.split('/')[2]||'');
      const raw=Number(params.get('level')||1);
      level=Math.max(1,Math.min(20,Number.isFinite(raw)?Math.floor(raw):1));
      const query=params.has('uuid')?'uuid='+encodeURIComponent(params.get('uuid')):
        'slug='+encodeURIComponent(params.get('slug')||'');
      const response=await fetch('/api/v1/campaigns/'+encodeURIComponent(campaignId)+
        '/catalog-item?'+query,{credentials:'same-origin'});
      if(!response.ok)throw Error('This item is unavailable. Check campaign access and synced packs.');
      item=(await response.json()).item;
    }catch(e){errorText=e.message;}finally{busy=false;}
  }
  function open(next){if(item)history=[...history,item];item=next;}
  function back(){item=history.at(-1)||item;history=history.slice(0,-1);}
  function close(){window.close();if(!window.closed)location.href='/';}
  onMount(lookup);
</script>
<svelte:head><title>{item?.name||'Item preview'} · PF2e Planner</title></svelte:head>
<main class="popout">
  {#if errorText}<p role="alert">{errorText}</p>
  {:else if busy}<p>Loading item…</p>
  {:else}<ItemInspector {item} {level} {campaignId} onOpen={open} onBack={back}
    onClose={close} canBack={history.length>0}/>{/if}
</main>
<style>
  .popout{height:100vh;background:var(--surface-strong);overflow:hidden}
  .popout :global(.inspector-main){max-width:780px;margin:0 auto}
</style>
