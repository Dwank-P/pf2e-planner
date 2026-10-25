<script>
  import RankLadder from '../ui/RankLadder.svelte';
  import Traits from '../ui/Traits.svelte';
  import {ATTRIBUTES,attributeModifiers,formatModifier,hitPoints,classProficiencies,titleCase,
    keyAttributeOptions} from '../builder/rules.js';
  import {skillRanks} from '../builder/legality.js';
  /** The character at `level`: level-1 creation plus planned boosts and skill increases. */
  let {name,creation,plan=null,lookup,steps=[],onStep,level=1}=$props();
  const result=$derived(attributeModifiers(creation,lookup,plan?.levels??{},level));
  const mods=$derived(result.mods);
  const hp=$derived(hitPoints(creation,lookup,mods.con,level));
  const prof=$derived(classProficiencies(creation,lookup));
  const skills=$derived([...skillRanks(creation,plan,lookup,level).entries()].filter(([,r])=>r>0).sort((a,b)=>a[0].localeCompare(b[0])));
  const key=$derived(creation.boosts?.class?.[0]??keyAttributeOptions(creation,lookup(creation.class?.uuid))[0]);
  const todo=$derived(steps.filter(s=>!s.complete&&!s.optional&&s.id!=='review'));
  const lineage=$derived(creation.heritage?.name&&creation.ancestry?.name&&
    creation.heritage.name.toLowerCase().includes(creation.ancestry.name.toLowerCase())
    ?[creation.heritage.name]:[creation.heritage?.name,creation.ancestry?.name].filter(Boolean));
  // Proficiency bonus = rank × 2 + level for a trained+ statistic.
  const classDC=$derived(creation.class&&key?10+mods[key]+2+level:null);
</script>
<aside class="summary" aria-label="Character summary">
  <div class="who">
    <span class="eyebrow">Level {level}</span>
    <h2>{name}</h2>
    <p class="muted">{[lineage.join(' '),creation.background?.name,[creation.class?.name,creation.dualClass?.name].filter(Boolean).join(' / ')]
      .filter(Boolean).join(' · ')||'Choose an ancestry to begin'}</p>
    <Traits traits={[...(creation.ancestry?.traits??[]),creation.class?.slug].filter(Boolean)} max={5}/>
  </div>
  <div class="attrs">
    {#each ATTRIBUTES as a}
      <div class="attr" class:key={a===key} title={result.partial[a]?'Partial boost pending':''}>
        <span>{a.toUpperCase()}</span><b class="num">{formatModifier(mods[a])}{result.partial[a]?'½':''}</b></div>
    {/each}
  </div>
  <dl class="stats">
    <div><dt>Hit Points</dt><dd class="num">{hp??'—'}</dd></div>
    <div><dt>Class DC</dt><dd class="num">{classDC??'—'}</dd></div>
  </dl>
  {#if creation.class&&level===1}
    <div class="ranks">
      {#each [['Perception',prof.perception],['Fortitude',prof.fortitude],['Reflex',prof.reflex],['Will',prof.will]] as [label,rank]}
        <div><span>{label}</span><RankLadder {rank}/></div>
      {/each}
    </div>
  {/if}
  {#if skills.length}
    <div class="block"><span class="eyebrow">Skills</span>
      <div class="ranks">{#each skills as [skill,rank]}<div><span>{titleCase(skill)}</span><RankLadder {rank}/></div>{/each}</div></div>
  {/if}
  {#if todo.length}
    <div class="block"><span class="eyebrow">Still to choose at level 1</span>
      <ul class="todo">{#each todo as step}<li><button class="link" onclick={()=>onStep(step.id)}>{step.label}</button></li>{/each}</ul></div>
  {/if}
</aside>
<style>
  .summary{display:grid;gap:16px;align-content:start}
  .who{display:grid;gap:6px}
  h2{font-size:1.35rem;font-weight:800;overflow-wrap:anywhere}
  .who p{font-size:.88rem}
  .attrs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  .attr{background:var(--panel-2);border-radius:8px;padding:7px;text-align:center;border:1px solid transparent}
  .attr.key{border-color:var(--brass)}
  .attr span{display:block;font:600 .66rem var(--mono);color:var(--muted)}
  .attr b{font:800 1.15rem var(--display)}
  .stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0}
  .stats div{background:var(--panel-2);border-radius:8px;padding:8px 10px}
  dt{font-size:.75rem;color:var(--muted)}dd{margin:0;font:700 1.1rem var(--mono)}
  .ranks{display:grid;gap:6px}
  .ranks div{display:flex;justify-content:space-between;align-items:center;font-size:.9rem;gap:8px}
  .ranks span{color:var(--text-2)}
  .block{display:grid;gap:6px;font-size:.9rem}
  .todo{margin:0;padding-left:1rem;display:grid;gap:3px}
</style>
