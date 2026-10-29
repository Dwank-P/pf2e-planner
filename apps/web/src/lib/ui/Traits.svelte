<script>
  import {tr} from '../i18n/index.js';
  /** PF2e trait chips; rarity (if not common) comes first in its system colour. */
  let {traits=[],rarity='common',max=6}=$props();
  const shown=$derived(traits.filter(t=>!['common','uncommon','rare','unique'].includes(t)).slice(0,max));
  // A translated trait name where there is one, else the slug as before.
  function label(slug){
    const plain=String(slug).replace(/-/g,' ');
    const key=plain.replace(/\b\w/g,c=>c.toUpperCase());
    const text=tr(key);
    return text===key?plain:text;
  }
</script>
{#if rarity!=='common'||shown.length}
  <span class="chips">
    {#if rarity&&rarity!=='common'}<span class="chip {rarity}">{label(rarity)}</span>{/if}
    {#each shown as trait}<span class="chip">{label(trait)}</span>{/each}
  </span>
{/if}
