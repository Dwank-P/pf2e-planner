<script>
  import {languageAllowance,attributeModifiers,titleCase} from '../builder/rules.js';
  import {toggleListValue} from '../builder/creation.js';
  import {COMMON_LANGUAGES} from './options.js';
  let {creation,lookup,update}=$props();
  const mods=$derived(attributeModifiers(creation,lookup).mods);
  const allowance=$derived(languageAllowance(creation,lookup,mods.int));
  const options=$derived([...new Set([...allowance.options,...COMMON_LANGUAGES])].filter(l=>!allowance.granted.includes(l)).sort());
  const chosen=$derived((creation.languages??[]).filter(l=>!allowance.granted.includes(l)));
</script>
<div class="langs">
  <p class="muted">You speak {allowance.granted.map(titleCase).join(', ')||'your ancestry’s languages'}.
    {#if allowance.count}Choose <b class="num">{allowance.count}</b> more.{:else}You have no extra languages to choose.{/if}</p>
  {#if allowance.count}
    <div class="list">
      {#each options as language}
        {@const on=chosen.includes(language)}
        <button class="lang" class:on aria-pressed={on} disabled={!on&&chosen.length>=allowance.count}
          onclick={()=>update(c=>toggleListValue(c,'languages',language,allowance.count))}>{titleCase(language)}</button>
      {/each}
    </div>
    <p class="muted small">Uncommon languages need your GM’s approval or a feat that grants access.</p>
  {/if}
</div>
<style>
  .langs{display:grid;gap:12px}
  .list{display:flex;flex-wrap:wrap;gap:6px}
  .lang{border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:6px 14px;font-weight:700}
  .lang.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  .lang:disabled:not(.on){opacity:.4}
  .small{font-size:.85rem}
</style>
