<script>
  import RankLadder from '../ui/RankLadder.svelte';
  import Traits from '../ui/Traits.svelte';
  import {ATTRIBUTES,attributeModifiers,formatModifier,hitPoints,proficienciesAt,proficiencyBonus,titleCase,
    keyAttributeOptions,SKILL_ATTRIBUTE} from '../builder/rules.js';
  import {skillRanks} from '../builder/legality.js';
  import {classTitle} from '../builder/summaries.js';
  import Icon from '../ui/Icon.svelte';
  /** The character at its current `level`: level-1 creation plus planned boosts, increases and class features. */
  let {name,creation,plan=null,lookup,steps=[],onStep,level=1}=$props();
  const result=$derived(attributeModifiers(creation,lookup,plan?.levels??{},level));
  const mods=$derived(result.mods);
  const hp=$derived(hitPoints(creation,lookup,mods.con,level));
  const prof=$derived(proficienciesAt(creation,lookup,level));
  const key=$derived(creation.boosts?.class?.[0]??keyAttributeOptions(creation,lookup(creation.class?.uuid))[0]);
  const skills=$derived([...skillRanks(creation,plan,lookup,level).entries()].filter(([,r])=>r>0)
    .sort((a,b)=>a[0].localeCompare(b[0])));
  const todo=$derived(steps.filter(s=>!s.complete&&!s.optional&&s.id!=='review'));
  const lineage=$derived(creation.heritage?.name&&creation.ancestry?.name&&
    creation.heritage.name.toLowerCase().includes(creation.ancestry.name.toLowerCase())
    ?[creation.heritage.name]:[creation.heritage?.name,creation.ancestry?.name].filter(Boolean));
  const img=entry=>entry?.uuid?lookup(entry.uuid)?.img??entry.img??null:null;
  // Ancestry and each class, with the specialization in the class name ("Enigma Bard").
  const identity=$derived([
    creation.ancestry?{label:lineage.join(' '),img:img(creation.heritage)??img(creation.ancestry)}:null,
    creation.class?{label:classTitle(creation.class,creation.subclass),img:img(creation.class)}:null,
    creation.dualClass?{label:classTitle(creation.dualClass,creation.dualSubclass),img:img(creation.dualClass)}:null
  ].filter(Boolean));
  const total=(attribute,rank)=>formatModifier((mods[attribute]??0)+proficiencyBonus(rank,level));
  const defenses=$derived([['Perception','wis',prof.perception],['Fortitude','con',prof.fortitude],
    ['Reflex','dex',prof.reflex],['Will','wis',prof.will]]);
  const classDC=$derived(creation.class&&key?10+mods[key]+proficiencyBonus(Math.max(1,prof.classDC),level):null);
</script>
<aside class="summary" aria-label="Character summary">
  <div class="who">
    <span class="eyebrow">Level {level}</span>
    <h2>{name}</h2>
    {#if identity.length}
      <ul class="identity">
        {#each identity as part}<li><Icon src={part.img} size={28}/><span>{part.label}</span></li>{/each}
      </ul>
      {#if creation.background}<p class="muted">{creation.background.name}</p>{/if}
    {:else}<p class="muted">Choose an ancestry to begin</p>{/if}
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
  {#if creation.class}
    <div class="block"><span class="eyebrow">Perception &amp; saves</span>
      <div class="ranks">
        {#each defenses as [label,attribute,rank]}
          <div><span>{label}</span><span class="right"><b class="num">{total(attribute,rank)}</b><RankLadder {rank}/></span></div>
        {/each}
      </div>
    </div>
  {/if}
  {#if skills.length}
    <div class="block"><span class="eyebrow">Skills</span>
      <div class="ranks">{#each skills as [skill,rank]}
        <div><span>{titleCase(skill)}</span><span class="right"><b class="num">{total(SKILL_ATTRIBUTE[skill]??'int',rank)}</b><RankLadder {rank}/></span></div>
      {/each}</div></div>
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
  .identity{list-style:none;margin:0;padding:0;display:grid;gap:6px}
  .identity li{display:flex;gap:8px;align-items:center;font-weight:700;font-size:.92rem}
  .attrs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  .attr{background:var(--panel-2);border-radius:8px;padding:7px;text-align:center;border:1px solid transparent}
  .attr.key{border-color:var(--brass)}
  .attr span{display:block;font:600 .66rem var(--mono);color:var(--muted)}
  .attr b{font:800 1.15rem var(--display)}
  .stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0}
  .stats div{background:var(--panel-2);border-radius:8px;padding:8px 10px}
  dt{font-size:.75rem;color:var(--muted)}dd{margin:0;font:700 1.1rem var(--mono)}
  .block{display:grid;gap:6px;font-size:.9rem}
  .ranks{display:grid;gap:5px}
  .ranks>div{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .ranks span{color:var(--text-2)}
  .right{display:flex;align-items:center;gap:8px}
  .right b{min-width:2.4em;text-align:right;color:var(--text)}
  .todo{margin:0;padding-left:1rem;display:grid;gap:3px}
</style>
