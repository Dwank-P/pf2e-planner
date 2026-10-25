<script>
  import {SKILLS,SKILL_ATTRIBUTE,skillTraining,attributeModifiers,titleCase,formatModifier,loreName} from '../builder/rules.js';
  import {toggleSkill,toggleLore} from '../builder/creation.js';
  let {creation,lookup,update}=$props();
  const mods=$derived(attributeModifiers(creation,lookup).mods);
  const training=$derived(skillTraining(creation,lookup,mods.int));
  const chosen=$derived(training.chosen);
  const used=$derived(chosen.length+training.chosenLores.length);
  const full=$derived(used>=training.choices);
  const granted=$derived(SKILLS.filter(s=>training.granted.has(s)));
  const open=$derived(SKILLS.filter(s=>!training.granted.has(s)));
  // Lores: the background's are automatic; extra ones use a skill pick (Leveler's selectedLoreSkills).
  let lore=$state('');
  const SUGGESTED=['Warfare','Underworld','Library','Sailing','Engineering','Genealogy','Herbalism','Labor','Legal','Academia'];
  const knownLores=$derived(new Set([...training.lores,...training.chosenLores].map(l=>loreName(l).toLowerCase())));
  function addLore(name){
    const value=loreName(name);
    if(!value||knownLores.has(value.toLowerCase()))return;
    update(c=>toggleLore(c,value,training));lore='';
  }
</script>
<div class="skills">
  <div class="counter" class:met={used===training.choices&&training.choices>0} class:over={used>training.choices}>
    <b class="num">{used}<span>/{training.choices}</span></b>
    <span><strong>{full?'All picks used':(training.choices-used)+' left to choose'}</strong>
      <small class="muted">Skills or extra lores. {training.choices} = class picks{mods.int?` ${mods.int>0?'+':'−'} ${Math.abs(mods.int)} from Intelligence`:''}{training.duplicates?` + ${training.duplicates} because your background repeats a class skill`:''}.</small></span>
  </div>

  <section>
    <span class="eyebrow">Choose skills</span>
    <div class="list">
      {#each open as skill}
        {@const on=chosen.includes(skill)}
        <button class="skill" class:on aria-pressed={on} disabled={!on&&full}
          onclick={()=>update(c=>toggleSkill(c,skill,training))}>
          <span class="name">{titleCase(skill)}</span>
          <span class="meta"><span class="num">{SKILL_ATTRIBUTE[skill].toUpperCase()} {formatModifier(mods[SKILL_ATTRIBUTE[skill]])}</span>
            {#if on}<small>trained</small>{/if}</span>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <span class="eyebrow">Lores</span>
    <div class="lores">
      {#each training.lores as l}<span class="chip auto">{loreName(l)} <small>from background</small></span>{/each}
      {#each training.chosenLores as l}<span class="chip on">{l}
        <button class="x" aria-label={'Remove '+l} onclick={()=>update(c=>toggleLore(c,l,training))}>×</button></span>{/each}
    </div>
    <form class="add" onsubmit={e=>{e.preventDefault();addLore(lore);}}>
      <input list="lore-suggestions" maxlength="40" placeholder="Add a lore, e.g. Warfare" aria-label="Lore name" bind:value={lore} disabled={full}/>
      <datalist id="lore-suggestions">{#each SUGGESTED as s}<option value={s+' Lore'}></option>{/each}</datalist>
      <button class="btn small" disabled={full||!lore.trim()}>Add lore</button>
    </form>
    <p class="muted small">Feats such as Additional Lore add more; Leveler asks for those in Foundry.</p>
  </section>

  {#if granted.length}
    <section>
      <span class="eyebrow">Trained automatically</span>
      <div class="list">
        {#each granted as skill}
          <div class="skill on granted"><span class="name">{titleCase(skill)}</span>
            <span class="meta"><span class="num">{SKILL_ATTRIBUTE[skill].toUpperCase()} {formatModifier(mods[SKILL_ATTRIBUTE[skill]])}</span>
              <small>from {training.granted.get(skill)}</small></span></div>
        {/each}
      </div>
    </section>
  {/if}
</div>
<style>
  .skills{display:grid;gap:16px}
  section{display:grid;gap:8px}
  .counter{display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;background:var(--panel)}
  .counter b{font:800 2rem/1 var(--display)}
  .counter b span{font-size:1.1rem;color:var(--muted)}
  .counter>span{display:grid;gap:2px}
  .counter.met{border-color:var(--good)}.counter.met b{color:var(--good)}
  .counter.over{border-color:var(--warn)}.counter.over b{color:var(--warn)}
  .list{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px}
  .skill{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--line);background:var(--panel);
    border-radius:8px;padding:10px 12px;text-align:left}
  .skill.on{border-color:var(--brass);background:var(--brass-soft)}
  .skill.granted{border-style:dashed}
  .skill:disabled:not(.on){opacity:.45}
  .name{font-weight:700}
  .meta{display:grid;justify-items:end;font-size:.75rem;color:var(--muted)}
  .meta small{color:var(--brass)}
  .lores{display:flex;flex-wrap:wrap;gap:6px}
  .chip{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:4px 10px;font-weight:700;font-size:.88rem}
  .chip.on{background:var(--brass-soft);border-color:var(--brass)}
  .chip.auto{border-style:dashed}
  .chip small{font-weight:400;color:var(--muted)}
  .x{background:none;border:0;padding:0 2px;color:var(--muted);font-size:1rem}
  .add{display:flex;gap:6px;flex-wrap:wrap}
  .add input{flex:1 1 200px}
  .small{font-size:.84rem}
</style>
