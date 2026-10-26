<script>
  import {ABILITIES,modifier,signed} from '../systems/dnd5e/rules.js';
  import {traitLabel} from '../systems/dnd5e/build.js';
  /** At-a-glance sheet for the planned character at its last planned level. */
  let {name,sheet,catalog,variants}=$props();
  const p=$derived(sheet.proficiencies);
  const skills=$derived(Object.entries(variants?.skills??{}).map(([key,s])=>{
    const rank=p.skills.get(key)??0;
    const ability=s.ability??'dex';
    return {key,label:s.label??key,rank,bonus:modifier(sheet.scores[ability])+rank*sheet.proficiencyBonus};
  }));
  const list=set=>[...set].map(k=>traitLabel(k,variants)).join(', ');
  const ordinal=n=>['','1st','2nd','3rd'][n]??n+'th';
</script>
<div class="sheet">
  <header>
    <span class="eyebrow">Planned to level {sheet.level||0}</span>
    <h2>{name||'Character'}</h2>
    <p>{[sheet.species?.name,sheet.background?.name].filter(Boolean).join(' · ')||'No origin yet'}</p>
    <p class="classes">{sheet.classes.map(c=>(c.item?.name??'?')+' '+c.levels+(c.subclass?' ('+c.subclass.name+')':'')).join(' / ')||'No class yet'}</p>
  </header>
  <div class="stats">
    <span><small>HP</small><b class="num">{sheet.hp||'—'}</b></span>
    <span><small>Prof.</small><b class="num">{signed(sheet.proficiencyBonus)}</b></span>
    <span><small>Init.</small><b class="num">{signed(modifier(sheet.scores.dex))}</b></span>
  </div>
  <div class="scores">
    {#each ABILITIES as a}
      <span class:save={p.saves.has(a)} title={p.saves.has(a)?'Proficient in saves':''}><small>{a.toUpperCase()}</small><b class="num">{sheet.scores[a]}</b>
        <em class="num">{signed(modifier(sheet.scores[a]))}</em></span>
    {/each}
  </div>
  {#if p.saves.size}<p class="line"><b>Saves</b> {[...p.saves].map(a=>a.toUpperCase()).join(', ')}</p>{/if}
  <div class="skills">
    {#each skills as s}<span class:prof={s.rank>=1} class:exp={s.rank>=2}><i aria-hidden="true">{s.rank>=2?'◆':s.rank?'●':'○'}</i>{s.label}<b class="num">{signed(s.bonus)}</b></span>{/each}
  </div>
  {#if p.armor.size||p.weapon.size}<p class="line"><b>Armor & weapons</b> {[list(p.armor),list(p.weapon)].filter(Boolean).join('; ')}</p>{/if}
  {#if p.mastery.size}<p class="line"><b>Weapon mastery</b> {list(p.mastery)}</p>{/if}
  {#if p.tools.size}<p class="line"><b>Tools</b> {[...p.tools.keys()].map(k=>traitLabel(k,variants)).join(', ')}</p>{/if}
  {#if p.languages.size}<p class="line"><b>Languages</b> {list(p.languages)}</p>{/if}
  {#if sheet.spellcasting.slots.length||sheet.spellcasting.pact}
    <p class="line"><b>Spell slots</b>
      {sheet.spellcasting.slots.map((n,i)=>ordinal(i+1)+' '+n).join(' · ')}
      {#if sheet.spellcasting.pact}{sheet.spellcasting.slots.length?' · ':''}Pact {sheet.spellcasting.pact.count}× {ordinal(sheet.spellcasting.pact.level)}{/if}</p>
  {/if}
  {#if sheet.scales.length}
    <p class="line"><b>Scaling</b> {sheet.scales.map(s=>s.title+' '+s.value).join(' · ')}</p>
  {/if}
  {#if sheet.feats.length}<p class="line"><b>Feats</b> {sheet.feats.map(f=>catalog.get(f.uuid)?.name??'?').join(', ')}</p>{/if}
  {#if sheet.warnings.length}
    <ul class="warn">{#each sheet.warnings as w}<li>{w}</li>{/each}</ul>
  {/if}
</div>
<style>
  .sheet{display:grid;gap:12px;font-size:.88rem}
  header{display:grid;gap:2px}
  h2{font:800 1.25rem var(--display);margin:0}
  header p{margin:0;color:var(--text-2)}
  .classes{font-weight:700;color:var(--text)!important}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .stats span,.scores span{display:grid;justify-items:center;border:1px solid var(--line);border-radius:8px;padding:6px 4px;background:var(--panel-2)}
  small{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}
  .stats b{font-size:1.1rem}
  .scores{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .scores span.save{border-color:var(--brass)}
  .scores em{font-style:normal;color:var(--text-2);font-size:.8rem}
  .skills{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px}
  .skills span{display:grid;grid-template-columns:14px 1fr auto;gap:4px;color:var(--muted)}
  .skills span.prof{color:var(--text)}
  .skills i{font-style:normal;color:var(--brass);font-size:.7rem}
  .line{margin:0;color:var(--text-2)}
  .line b{color:var(--text)}
  .warn{margin:0;padding-left:1rem;color:var(--warn)}
</style>
