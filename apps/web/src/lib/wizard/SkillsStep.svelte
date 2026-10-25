<script>
  import {SKILLS,SKILL_ATTRIBUTE,skillTraining,attributeModifiers,titleCase,formatModifier} from '../builder/rules.js';
  import {toggleListValue} from '../builder/creation.js';
  let {creation,lookup,update}=$props();
  const mods=$derived(attributeModifiers(creation,lookup).mods);
  const training=$derived(skillTraining(creation,lookup,mods.int));
  const chosen=$derived(training.chosen);
</script>
<div class="skills">
  <p class="muted">Your class and background train some skills. Choose
    <b class="num">{training.choices}</b> more{training.choices&&mods.int>0?` (includes +${mods.int} from Intelligence)`:''}.</p>
  <div class="count num" class:done={chosen.length>=training.choices}>{chosen.length}/{training.choices} chosen</div>
  <div class="list">
    {#each SKILLS as skill}
      {@const source=training.granted.get(skill)}
      {@const on=!!source||chosen.includes(skill)}
      <button class="skill" class:on class:granted={!!source} aria-pressed={on}
        disabled={!!source||(!on&&chosen.length>=training.choices)}
        onclick={()=>update(c=>toggleListValue(c,'skills',skill,training.choices))}>
        <span class="name">{titleCase(skill)}</span>
        <span class="meta"><span class="num">{SKILL_ATTRIBUTE[skill].toUpperCase()} {formatModifier(mods[SKILL_ATTRIBUTE[skill]])}</span>
          {#if source}<small>from {source}</small>{:else if on}<small>trained</small>{/if}</span>
      </button>
    {/each}
  </div>
  {#if training.lores.length}<p class="muted">Lore from background: {training.lores.join(', ')}.</p>{/if}
</div>
<style>
  .skills{display:grid;gap:12px}
  .count{justify-self:start;font-size:.85rem;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:2px 10px}
  .count.done{color:var(--good);border-color:var(--good)}
  .list{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px}
  .skill{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--line);background:var(--panel);
    border-radius:8px;padding:10px 12px;text-align:left}
  .skill.on{border-color:var(--brass);background:var(--brass-soft)}
  .skill.granted{border-style:dashed}
  .skill:disabled{opacity:1}
  .skill:disabled:not(.on){opacity:.45}
  .name{font-weight:700}
  .meta{display:grid;justify-items:end;font-size:.75rem;color:var(--muted)}
  .meta small{color:var(--brass)}
</style>
