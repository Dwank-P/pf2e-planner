<script>
  import RankLadder from '../ui/RankLadder.svelte';
  import Traits from '../ui/Traits.svelte';
  import {ATTRIBUTES,attributeModifiers,formatModifier,hitPoints,proficienciesAt,proficiencyBonus,titleCase,
    keyAttributeOptions,SKILL_ATTRIBUTE} from '../builder/rules.js';
  import {skillRanks} from '../builder/legality.js';
  import {classTitle} from '../builder/summaries.js';
  import Icon from '../ui/Icon.svelte';
  import AcBadge from '../ui/AcBadge.svelte';
  import Portrait from '../ui/Portrait.svelte';
  import Glyph from '../ui/Glyph.svelte';
  import {grantsAt} from '../builder/granted.js';
  import {SAVE_GLYPHS,skillGlyph} from '../ui/glyph-names.js';
  import {equipped,itemBonuses,skillBonus,armorClass,strike,runedName} from '../builder/gear.js';
  /** The character at its current `level`: level-1 creation plus planned boosts, increases and class features. */
  let {name,creation,plan=null,lookup,steps=[],onStep,level=1,variants={},planner={},portrait=null,onPortrait=null}=$props();
  const pwl=$derived(variants?.proficiencyWithoutLevel===true);
  const result=$derived(attributeModifiers(creation,lookup,plan?.levels??{},level));
  const mods=$derived(result.mods);
  const hp=$derived(hitPoints(creation,lookup,mods.con,level));
  const prof=$derived(proficienciesAt(creation,lookup,level,{plan,variants}));
  // Size and land Speed: the ancestry's, plus bonuses from rules (Fleet) and armor's penalty.
  const SIZES={tiny:'Tiny',sm:'Small',med:'Medium',lg:'Large',huge:'Huge',grg:'Gargantuan'};
  const ancestryRules=$derived(lookup(creation.ancestry?.uuid)?.metadata?.rules??{});
  const size=$derived(SIZES[ancestryRules.size]??null);
  const speed=$derived(Number(ancestryRules.speed)>0?Number(ancestryRules.speed)+grantsAt(creation,plan,lookup,level,variants).speed:null);
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
  // Equipped gear from the equipment plan: AC, item bonuses, armor check penalty.
  const gear=$derived(equipped(planner,lookup,level));
  const bonuses=$derived(itemBonuses(gear,{level,variants}));
  const ac=$derived(armorClass({gear,mods,ranks:prof,level,proficiency:(r,l)=>proficiencyBonus(r,l,pwl),bonuses}));
  const total=(attribute,rank,extra=0)=>formatModifier((mods[attribute]??0)+proficiencyBonus(rank,level,pwl)+extra);
  const defenseBonus=label=>bonuses.get(label.toLowerCase())?.value??0;
  const skillExtra=skill=>skillBonus(bonuses,skill)+(['str','dex'].includes(SKILL_ATTRIBUTE[skill])?ac.checkPenalty:0);
  const acTitle=$derived(`10 + Dex ${formatModifier(ac.parts.dex)} + proficiency ${formatModifier(ac.parts.prof)} (${ac.category}) + item ${formatModifier(ac.parts.item)}`);
  // Armor and weapon training, as rank letters with the full name on hover.
  const RANK_NAMES=['Untrained','Trained','Expert','Master','Legendary'];
  const training=$derived([
    ['Armor',[['U','unarmored','Unarmored defense'],['L','light','Light armor'],['M','medium','Medium armor'],['H','heavy','Heavy armor']]],
    ['Weapons',[['U','unarmed','Unarmed attacks'],['S','simple','Simple weapons'],['M','martial','Martial weapons'],['A','advanced','Advanced weapons']]]
  ].map(([label,keys])=>[label,keys.map(([short,key,name])=>({short,rank:Number(prof[key]??0),title:name+': '+RANK_NAMES[Number(prof[key]??0)]}))]));
  // Up to three equipped weapons, with attack modifier and damage.
  const strikes=$derived(gear.filter(g=>g.item.type==='weapon').slice(0,3)
    .map(g=>strike(g,{mods,ranks:prof,level,proficiency:(r,l)=>proficiencyBonus(r,l,pwl),variants,lookup})));
  const defenses=$derived([['Perception','wis',prof.perception],['Fortitude','con',prof.fortitude],
    ['Reflex','dex',prof.reflex],['Will','wis',prof.will]]);
  const classDC=$derived(creation.class&&key?10+mods[key]+proficiencyBonus(Math.max(1,prof.classDC),level,pwl):null);
</script>
<aside class="summary" aria-label="Character summary">
  <div class="who">
    <span class="eyebrow">Level {level}</span>
    <div class="title"><h2>{name}</h2><Portrait src={portrait} {name} size={64} onEdit={onPortrait}/></div>
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
  <dl class="stats" class:with-ac={!!creation.class}>
    {#if creation.class}<div class="ac"><AcBadge value={ac.total} title={acTitle}/></div>{/if}
    <div><dt>Hit Points</dt><dd class="num">{hp??'—'}</dd></div>
    <div><dt>Class DC</dt><dd class="num">{classDC??'—'}</dd></div>
  </dl>
  {#if size||speed}
    <dl class="stats body">
      <div><dt>Size</dt><dd>{size??'—'}</dd></div>
      <div title={ac.speedPenalty?ac.armor.name+': '+ac.speedPenalty+' ft.':''}><dt>Speed</dt>
        <dd class="num">{speed!==null?speed+(ac.speedPenalty||0)+' ft.':'—'}</dd></div>
    </dl>
  {/if}
  {#if creation.class}
    <div class="block"><span class="eyebrow">Perception &amp; saves</span>
      <div class="ranks">
        {#each defenses as [label,attribute,rank]}
          <div><span class="label"><Glyph name={SAVE_GLYPHS[label.toLowerCase()]}/>{label}{#if defenseBonus(label)}<small class="bonus" title={'Item bonus from '+bonuses.get(label.toLowerCase()).source}> +{defenseBonus(label)} item</small>{/if}</span>
            <span class="right"><b class="num">{total(attribute,rank,defenseBonus(label))}</b><RankLadder {rank}/></span></div>
        {/each}
      </div>
    </div>
  {/if}
  {#if creation.class}
    <div class="block"><span class="eyebrow">Training</span>
      {#each training as [label,ranks]}
        <div class="training"><span>{label}</span><span class="chips">
          {#each ranks as r}<span class="tchip rank-{r.rank}" title={r.title}>{r.short}<b>{'UTEML'[r.rank]}</b></span>{/each}</span></div>
      {/each}
    </div>
  {/if}
  {#if skills.length}
    <div class="block"><span class="eyebrow">Skills</span>
      <div class="ranks">{#each skills as [skill,rank]}
        <div><span class="label">{#if skillGlyph(skill)}<Glyph name={skillGlyph(skill)}/>{:else}<span class="gap"></span>{/if}{titleCase(skill)}{#if skillExtra(skill)}<small class="bonus">{skillExtra(skill)>0?' +':' '}{skillExtra(skill)}</small>{/if}</span>
          <span class="right"><b class="num">{total(SKILL_ATTRIBUTE[skill]??'int',rank,skillExtra(skill))}</b><RankLadder {rank}/></span></div>
      {/each}</div></div>
  {/if}
  {#if strikes.length&&creation.class}
    <div class="block"><span class="eyebrow">Strikes</span>
      <div class="ranks">{#each strikes as s}
        <div><span>{s.name}</span>
          <span class="right strike"><b class="num">{formatModifier(s.attack)}</b><small class="num">{s.damage}</small></span></div>
      {/each}</div></div>
  {/if}
  {#if gear.length}
    <div class="block"><span class="eyebrow">Equipped</span>
      <ul class="gear">{#each gear as g (g.entry.id)}<li><Icon src={g.item.img} size={20}/><span>{runedName(g,lookup)}</span></li>{/each}</ul>
      {#if ac.checkPenalty}<p class="muted small">Not strong enough for {ac.armor.name}: {ac.checkPenalty} to Strength and Dexterity skills.</p>{/if}
      {#if ac.speedPenalty}<p class="muted small">{ac.armor.name}: {ac.speedPenalty} ft. Speed.</p>{/if}
    </div>
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
  .stats.with-ac{grid-template-columns:auto 1fr 1fr}
  .stats.body dd{font:700 1rem var(--display)}
  .stats div.ac{background:none;padding:0;display:grid;place-items:center}
  .stats div{background:var(--panel-2);border-radius:8px;padding:8px 10px}
  dt{font-size:.75rem;color:var(--muted)}dd{margin:0;font:700 1.1rem var(--mono)}
  .block{display:grid;gap:6px;font-size:.9rem}
  .ranks{display:grid;gap:5px}
  .ranks>div{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .ranks span{color:var(--text-2)}
  .right{display:flex;align-items:center;gap:8px}
  .right b{min-width:2.4em;text-align:right;color:var(--text)}
  .todo{margin:0;padding-left:1rem;display:grid;gap:3px}
  .bonus{color:var(--good);font-size:.72rem;font-weight:700}
  .gear{list-style:none;margin:0;padding:0;display:grid;gap:4px;font-size:.88rem}
  .gear li{display:flex;gap:6px;align-items:center}
  .title{display:flex;justify-content:space-between;align-items:center;gap:10px}
  .strike{display:grid!important;justify-items:end;gap:0}
  .strike small{color:var(--text-2);font-size:.75rem}
  .label{display:inline-flex;align-items:center;gap:6px}
  .gap{width:16px;display:inline-block}
  .training{display:flex;justify-content:space-between;align-items:center;font-size:.88rem;padding:2px 0}
  .chips{display:flex;gap:4px}
  .tchip{display:inline-flex;align-items:baseline;gap:2px;border:1px solid var(--line);border-radius:5px;padding:1px 6px;
    font:700 .72rem var(--mono);color:var(--muted);cursor:help}
  .tchip b{font-size:.62rem;color:var(--faint)}
  .tchip.rank-1{color:var(--text);border-color:var(--brass)}
  .tchip.rank-2,.tchip.rank-3,.tchip.rank-4{color:var(--on-brass);background:var(--brass);border-color:var(--brass)}
  .tchip.rank-2 b,.tchip.rank-3 b,.tchip.rank-4 b{color:var(--on-brass)}
</style>
