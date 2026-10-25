<script>
  /** PF2e trait chips; rarity (if not common) comes first in its system colour. */
  let {traits=[],rarity='common',max=6}=$props();
  const shown=$derived(traits.filter(t=>!['common','uncommon','rare','unique'].includes(t)).slice(0,max));
</script>
{#if rarity!=='common'||shown.length}
  <span class="chips">
    {#if rarity&&rarity!=='common'}<span class="chip {rarity}">{rarity}</span>{/if}
    {#each shown as trait}<span class="chip">{trait.replace(/-/g,' ')}</span>{/each}
  </span>
{/if}
