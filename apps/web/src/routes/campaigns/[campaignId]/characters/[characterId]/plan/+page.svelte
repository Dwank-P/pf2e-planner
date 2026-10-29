<script>
  // Levels 2–20 now live in the character builder itself.
  import {onMount} from 'svelte';
  import {page} from '$app/state';
  onMount(()=>location.replace('/campaigns/'+encodeURIComponent(page.params.campaignId)+
    '/characters/'+encodeURIComponent(page.params.characterId)+'?at=level-2'));
</script>
