<script>
  import {languageAllowance,attributeModifiers,titleCase} from '../builder/rules.js';
  import {toggleListValue} from '../builder/creation.js';
  import {languageRarityMap} from './options.js';
  let {creation,lookup,variants,update}=$props();
  const mods=$derived(attributeModifiers(creation,lookup).mods);
  const allowance=$derived(languageAllowance(creation,lookup,mods.int));
  const rarity=$derived(languageRarityMap(variants?.languages,allowance.options));
  const chosen=$derived((creation.languages??[]).filter(l=>!allowance.granted.includes(l)));
  let show=$state({uncommon:false,rare:false,secret:false});
  const groups=$derived(['common','uncommon','rare','secret'].map(r=>({rarity:r,
    languages:[...rarity.entries()].filter(([l,v])=>v===r&&!allowance.granted.includes(l)).map(([l])=>l).sort()}))
    .filter(g=>g.languages.length));
  // Languages the ancestry lists are always shown, whatever their rarity.
  const visible=g=>g.rarity==='common'||show[g.rarity];
</script>
<div class="langs">
  <p class="muted">You speak {allowance.granted.map(titleCase).join(', ')||'your ancestry’s languages'}.
    {#if allowance.count}Choose <b class="num">{allowance.count}</b> more{chosen.length?` (${chosen.length} chosen)`:''}.{:else}Your ancestry and Intelligence give no extra languages, but you can still note any you plan to learn.{/if}</p>
  <div class="toggles">
    {#each ['uncommon','rare','secret'] as r}
      {#if groups.some(g=>g.rarity===r)}
        <label><input type="checkbox" bind:checked={show[r]}/> Show {r}</label>
      {/if}
    {/each}
    {#if !variants?.languages}<small class="muted">Rarities follow the PF2e remaster until the GM syncs with Bridge 0.9.</small>{/if}
  </div>
  {#each groups as group (group.rarity)}
    {#if visible(group)||group.languages.some(l=>chosen.includes(l)||allowance.options.includes(l))}
      <section class="group">
        <span class="eyebrow">{group.rarity}</span>
        <div class="list">
          {#each group.languages.filter(l=>visible(group)||chosen.includes(l)||allowance.options.includes(l)) as language}
            {@const on=chosen.includes(language)}
            <button class="lang {group.rarity}" class:on aria-pressed={on}
              onclick={()=>update(c=>toggleListValue(c,'languages',language,99))}>{titleCase(language)}
              {#if allowance.options.includes(language)}<small>ancestry</small>{/if}</button>
          {/each}
        </div>
      </section>
    {/if}
  {/each}
  {#if chosen.length>allowance.count}<p class="notice warn">That’s {chosen.length-allowance.count} more than your level-1 allowance. Fine for planning; you’ll need a feat or GM approval for the extra.</p>{/if}
</div>
<style>
  .langs{display:grid;gap:12px}
  .toggles{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:.88rem}
  .toggles label{display:flex;gap:6px;align-items:center}
  .group{display:grid;gap:6px}
  .list{display:flex;flex-wrap:wrap;gap:6px}
  .lang{border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:6px 14px;font-weight:700;display:flex;gap:6px;align-items:baseline}
  .lang small{font-weight:400;color:var(--muted);font-size:.72rem}
  .lang.uncommon{border-color:color-mix(in srgb,var(--uncommon) 55%,var(--line))}
  .lang.rare{border-color:color-mix(in srgb,var(--rare) 55%,var(--line))}
  .lang.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  .lang.on small{color:var(--on-brass)}
</style>
