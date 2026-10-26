<script>
  import Icon from '../ui/Icon.svelte';
  import AcBadge from '../ui/AcBadge.svelte';
  import {ABILITIES,ABILITY_NAMES,modifier,signed,multiclassRequirement,armorClass5e,weaponAttack5e} from '../systems/dnd5e/rules.js';
  import {unarmoredDefenses,weaponProficient} from '../systems/dnd5e/build.js';
  import {equipped} from '../builder/gear.js';
  import {traitLabel} from '../systems/dnd5e/build.js';
  /** At-a-glance sheet for the planned character at its last planned level. */
  let {name,sheet,catalog,variants,planner={}}=$props();
  // Worn armor and shield from the equipment plan, from the level they're planned for.
  const gear=$derived(equipped(planner,catalog.get,Math.max(1,sheet.level)));
  const armor=$derived(gear.find(g=>g.item.metadata?.armor&&!['shield','clothing','trinket'].includes(g.item.metadata.armor.type))??null);
  const shield=$derived(gear.find(g=>g.item.metadata?.armor?.type==='shield')??null);
  const ac=$derived(armorClass5e(sheet.scores,armor,shield,unarmoredDefenses(sheet)));
  // Up to three equipped weapons, with attack bonus and damage.
  const attacks=$derived(gear.filter(g=>g.item.metadata?.weapon).slice(0,3).map(g=>weaponAttack5e(g,{scores:sheet.scores,
    proficiencyBonus:sheet.proficiencyBonus,proficient:weaponProficient(sheet,g.item)})));
  const p=$derived(sheet.proficiencies);
  const skills=$derived(Object.entries(variants?.skills??{}).map(([key,s])=>{
    const rank=p.skills.get(key)??0;
    const ability=s.ability??'dex';
    return {key,label:s.label??key,rank,bonus:modifier(sheet.scores[ability])+rank*sheet.proficiencyBonus};
  }));
  const list=set=>[...set].map(k=>traitLabel(k,variants)).join(', ');
  const ordinal=n=>['','1st','2nd','3rd'][n]??n+'th';
  // Primary abilities of every class (what multiclassing checks), marked on the scores.
  const primary=$derived.by(()=>{
    const out=new Map();
    for(const c of sheet.classes)for(const group of multiclassRequirement(c.item,variants))for(const a of group){
      if(!out.has(a))out.set(a,[]);
      out.get(a).push(c.item?.name??'?');
    }
    return out;
  });
  const identity=$derived([
    sheet.species?{label:sheet.species.name,img:sheet.species.img}:null,
    ...sheet.classes.map(c=>({label:(c.item?.name??'?')+' '+c.levels+(c.subclass?' ('+c.subclass.name+')':''),img:c.subclass?.img??c.item?.img}))
  ].filter(Boolean));
</script>
<div class="sheet">
  <header>
    <span class="eyebrow">Planned to level {sheet.level||0}</span>
    <div class="title"><h2>{name||'Character'}</h2><AcBadge value={ac.total} title={ac.parts}/></div>
    {#each identity as row}<p class="identity"><Icon src={row.img} size={26}/><span>{row.label}</span></p>{/each}
    {#if !identity.length}<p>No origin or class yet</p>{/if}
    {#if sheet.background}<p class="muted">{sheet.background.name}</p>{/if}
  </header>
  <div class="stats">
    <span><small>HP</small><b class="num">{sheet.hp||'—'}</b></span>
    <span><small>Prof.</small><b class="num">{signed(sheet.proficiencyBonus)}</b></span>
    <span><small>Init.</small><b class="num">{signed(modifier(sheet.scores.dex))}</b></span>
  </div>
  <div class="scores">
    {#each ABILITIES as a}
      <span class:save={p.saves.has(a)} title={[p.saves.has(a)?'Saving throw proficiency (starting class)':'',
        primary.has(a)?'Primary ability: '+primary.get(a).join(', '):''].filter(Boolean).join(' · ')}>
        <small>{a.toUpperCase()}{#if primary.has(a)}<i class="key" aria-label={'Primary ability of '+primary.get(a).join(', ')}>◆</i>{/if}</small><b class="num">{sheet.scores[a]}</b>
        <em class="num">{signed(modifier(sheet.scores[a]))}</em></span>
    {/each}
  </div>
  {#if attacks.length}
    <div class="attacks"><b class="eyebrow">Attacks</b>
      {#each attacks as a}<div><span>{a.name}{#if !a.proficient}<small class="muted"> · not proficient</small>{/if}</span>
        <span><b class="num">{signed(a.attack)}</b> <small class="num">{a.damage}</small></span></div>{/each}</div>
  {/if}
  {#if p.saves.size}<p class="line"><b>Saves</b> {[...p.saves].map(a=>a.toUpperCase()).join(', ')}</p>{/if}
  {#if primary.size}<p class="legend muted">Outlined: saving throws (from the starting class). ◆ primary ability:
    {[...primary.entries()].map(([a,names])=>ABILITY_NAMES[a]+' ('+names.join(', ')+')').join(', ')}.</p>{/if}
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
  .identity{display:flex;gap:8px;align-items:center;font-weight:700;color:var(--text)!important}
  .key{font-style:normal;color:var(--brass);margin-left:3px;font-size:.65rem}
  .legend{margin:0;font-size:.78rem}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .title{display:flex;justify-content:space-between;align-items:center;gap:10px}
  .attacks{display:grid;gap:4px}
  .attacks div{display:flex;justify-content:space-between;gap:8px}
  .attacks small{color:var(--text-2)}
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
