<script>
  import {ATTRIBUTES,ATTRIBUTE_NAMES,boostSources,boostAllowed,attributeModifiers,formatModifier} from '../builder/rules.js';
  import {toggleBoost,setAlternateAncestryBoosts} from '../builder/creation.js';
  let {creation,lookup,update}=$props();
  const sources=$derived(boostSources(creation,lookup));
  const result=$derived(attributeModifiers(creation,lookup));
  const picked=source=>creation.boosts?.[source.source]??[];
</script>
<div class="boosts">
  <div class="totals" aria-label="Attribute modifiers">
    {#each ATTRIBUTES as a}
      <div class="total"><span>{a.toUpperCase()}</span><b class="num">{formatModifier(result.mods[a])}</b></div>
    {/each}
  </div>
  {#each sources as source (source.source)}
    {@const chosen=picked(source)}
    <section class="source">
      <header>
        <div><h3>{source.label}</h3>
          <p class="muted">
            {#if source.fixed.length}Fixed: {source.fixed.map(a=>ATTRIBUTE_NAMES[a]).join(', ')}.{/if}
            {#if source.flaws.length} Flaw: {source.flaws.map(a=>ATTRIBUTE_NAMES[a]).join(', ')}.{/if}
            {#if source.restricted?.length} One boost must be {source.restricted.map(a=>ATTRIBUTE_NAMES[a]).join(' or ')}; the other is free.{/if}
            {#if source.count===0} Nothing to choose.{/if}
          </p>
        </div>
        {#if source.count}<span class="count num" class:done={chosen.length>=source.count}>{chosen.length}/{source.count}</span>{/if}
      </header>
      {#if source.count}
        <div class="row" role="group" aria-label={source.label}>
          {#each ATTRIBUTES as a}
            {@const on=chosen.includes(a)}
            {@const fixed=source.fixed.includes(a)}
            <button class="attr" class:on class:fixed aria-pressed={on}
              disabled={fixed||!boostAllowed(source,chosen,a)}
              onclick={()=>update(c=>toggleBoost(c,source.source,a,source.count))}>
              <b>{a.toUpperCase()}</b><small>{ATTRIBUTE_NAMES[a]}</small>
            </button>
          {/each}
        </div>
        {#if chosen.length>=source.count&&source.count>1}<p class="hint muted">Full. Deselect one to change it.</p>{/if}
      {/if}
      {#if source.source==='ancestry'&&(source.canUseAlternate||creation.alternateAncestryBoosts)}
        <label class="alt"><input type="checkbox" checked={!!creation.alternateAncestryBoosts}
          onchange={e=>update(c=>setAlternateAncestryBoosts(c,e.currentTarget.checked))}/>
          Use two free boosts instead (no flaw)</label>
      {/if}
    </section>
  {/each}
</div>
<style>
  .boosts{display:grid;gap:14px}
  .totals{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
  .total{background:var(--panel-2);border-radius:8px;padding:8px;text-align:center}
  .total span{display:block;font:600 .68rem var(--mono);color:var(--muted)}
  .total b{font:800 1.3rem var(--display)}
  .source{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px;display:grid;gap:10px}
  header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
  h3{font-size:1rem;font-weight:800}
  header p{font-size:.86rem;margin-top:2px}
  .count{font-size:.85rem;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:2px 9px}
  .count.done{color:var(--good);border-color:var(--good)}
  .row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
  .attr{border:1px solid var(--line);background:var(--panel-2);border-radius:8px;padding:8px 4px;display:grid;gap:2px;text-align:center}
  .attr b{font:700 .85rem var(--mono)}
  .attr small{font-size:.66rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .attr.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  .attr.on small{color:var(--on-brass)}
  .attr.fixed{border-style:dashed}
  .attr:disabled:not(.on){opacity:.35}
  .hint{font-size:.8rem}
  .alt{display:flex;gap:8px;align-items:center;font-size:.88rem;color:var(--text-2)}
  @media(max-width:520px){.row,.totals{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>
