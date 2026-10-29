<script>
  // The party screen replaced the old character list.
  import {onMount} from 'svelte';
  import {page} from '$app/state';
  onMount(()=>location.replace('/campaigns/'+encodeURIComponent(page.params.campaignId)));
</script>
