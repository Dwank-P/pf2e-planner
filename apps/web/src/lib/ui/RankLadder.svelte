<script>
  import {tr} from '../i18n/index.js';
  /** PF2e proficiency rank as the T/E/M/L ladder (0 = untrained). */
  import {RANKS} from '../builder/rules.js';
  let {rank=0}=$props();
</script>
<span class="ladder" role="img" aria-label={RANKS[rank]??tr('Untrained')} title={RANKS[rank]??tr('Untrained')}>
  {#each ['T','E','M','L'] as letter,i}<i class:on={rank>i}>{letter}</i>{/each}
</span>
<style>
  .ladder{display:inline-flex;gap:3px}
  i{width:15px;height:15px;border-radius:3px;border:1px solid var(--line);font:600 9px/13px var(--mono);
    text-align:center;font-style:normal;color:var(--faint)}
  i.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
</style>
