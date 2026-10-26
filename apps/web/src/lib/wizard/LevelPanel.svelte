<script>
  import OptionGrid from './OptionGrid.svelte';
  import Icon from '../ui/Icon.svelte';
  import RankLadder from '../ui/RankLadder.svelte';
  import * as P from '../builder/plan.js';
  import {buildState,checkFeat,featNameIndex,skillRanks,maxSkillRank} from '../builder/legality.js';
  import {ATTRIBUTES,ATTRIBUTE_NAMES,SKILLS,RANKS,titleCase,attributeModifiers,formatModifier} from '../builder/rules.js';
  import {featOptions,spellOptions} from './options.js';
  import {classFeaturesAt} from '../leveler-progression.js';
  import {wishlist,formatPrice} from '../builder/equipment.js';
  import GrantsPanel from './GrantsPanel.svelte';
  import {levelGrantRequirements,toggleGrantSelection,takenFormulas} from '../builder/grants.js';
  /** One planned level (2–20): every slot Leveler's schedule gives, editable inline. */
  let {level,slots,creation,plan,planner={},catalog,variants,updatePlan,info,currentLevel=1,onEquipment=()=>{}}=$props();
  const lookup=$derived(catalog.get);
  const state=$derived(buildState(creation,plan,lookup,level,variants));
  const names=$derived(featNameIndex(catalog));
  const features=$derived(classFeaturesAt([lookup(creation.class?.uuid),variants.dualClass===true?lookup(creation.dualClass?.uuid):null],level));
  const before=$derived(attributeModifiers(creation,lookup,plan?.levels??{},level-1));
  const ranksBefore=$derived(skillRanks(creation,plan,lookup,level-1));
  const lores=$derived([...ranksBefore.keys()].filter(k=>k.endsWith(' lore')));
  const tradition=$derived(lookup(creation.class?.uuid)?.metadata?.levelerProgression?.spellcasting?.tradition??'');
  let open=$state(null);

  function featDone(slot){return !!P.planFeat(plan,slot);}
  /** The slot's source as an icon: class feats show the class, dual-class the second class, ancestry the ancestry. */
  const entryImg=entry=>entry?.uuid?lookup(entry.uuid)?.img??entry.img??null:null;
  // With two classes, name them: "Bard feat" and "Barbarian feat" instead of "Class feat".
  const slotLabel=slot=>creation.dualClass&&slot.kind==='class'?creation.class.name+' feat'
    :slot.kind==='dual-class'&&creation.dualClass?creation.dualClass.name+' feat':slot.label;
  function sourceIcon(kind){
    if(kind==='class')return entryImg(creation.class);
    if(kind==='dual-class')return entryImg(creation.dualClass);
    if(kind==='ancestry')return entryImg(creation.ancestry);
    if(kind==='skill')return entryImg(creation.background);
    return null;
  }
  function setFeat(slot,item){
    const current=P.planFeat(plan,slot);
    updatePlan(p=>P.setPlanFeat(p,slot,current?.uuid===item.uuid?null:item));
    if(current?.uuid!==item.uuid)open=null;
  }
  function spellRows(slot){
    const a=slot.allowance;
    const rows=[];
    if(a.cantrips)rows.push([0,'Cantrips',a.cantrips]);
    for(const [rank,count] of Object.entries(a.ranks))rows.push([Number(rank),'Rank '+rank,count]);
    if(a.any)for(let rank=1;rank<=a.maxRank;rank++)rows.push([rank,'Rank '+rank,null]);
    return rows;
  }
  function spellRoom(slot,rank){
    const a=slot.allowance;
    const picks=P.planSpells(plan,level,slot.entryType);
    const cantrips=picks.filter(s=>s.isCantrip).length;
    const ranked=picks.filter(s=>!s.isCantrip);
    if(rank===0)return a.cantrips-cantrips;
    if(a.any)return rank<=a.maxRank?a.any-ranked.length:0;
    return (a.ranks[rank]??0)-ranked.filter(s=>Number(s.rank)===rank).length;
  }
  const wishes=$derived(wishlist(planner).filter(w=>w.targetLevel===level));
  const extras=$derived(P.customFeats(plan,level));
  const extraIncreases=$derived(P.customSkillIncreases(plan,level));
  const grants=$derived(levelGrantRequirements(creation,plan,lookup,level));
  function toggleGrant(requirement,item){
    updatePlan(p=>{
      const next=JSON.parse(JSON.stringify(p));
      next.levels??={};
      next.levels[level]=toggleGrantSelection(next.levels[level]??{},requirement,item);
      return next;
    });
  }
</script>
<div class="level">
  {#if level>currentLevel}<p class="future muted">Planned. This becomes active when the character reaches level {level}.</p>{/if}
  {#if wishes.length}
    <div class="gained">
      <span class="eyebrow">Equipment planned for level {level} · {formatPrice(wishes.reduce((n,w)=>n+(w.price??0)*(w.quantity||1),0))}</span>
      <ul>{#each wishes as w (w.id)}<li class:bought={w.status==='bought'}><button class="link" onclick={()=>info(w.uuid)}>{w.quantity>1?w.quantity+'× ':''}{w.name}</button>
        <small class="muted">{formatPrice(w.price)}</small></li>{/each}
        <li><button class="link" onclick={onEquipment}>Edit plan →</button></li></ul>
    </div>
  {/if}
  {#if features.length}
    <div class="gained">
      <span class="eyebrow">Gained automatically</span>
      <ul>{#each features as f}<li>{#if f.uuid}<button class="link" onclick={()=>info(f.uuid)}>{f.name}</button>{:else}{f.name}{/if}</li>{/each}</ul>
    </div>
  {/if}
  {#each slots as slot (slot.key)}
    {#if slot.type==='feat'}
      {@const chosen=P.planFeat(plan,slot)}
      {@const src=sourceIcon(slot.kind)??(chosen?lookup(chosen.uuid)?.img??chosen.img:null)}
      {@const verdict=chosen?checkFeat(lookup(chosen.uuid)??chosen,state,{kind:slot.kind,featNames:names,currentUuid:chosen.uuid}):null}
      <section class="slot" class:open={open===slot.key} class:done={!!chosen}>
        <button class="head" aria-expanded={open===slot.key} onclick={()=>open=open===slot.key?null:slot.key}>
          {#if src}<span class="icon pic" aria-hidden="true"><Icon {src} size={30}/></span>
          {:else}<span class="icon" aria-hidden="true">{slot.kind==='class'?'C':slot.kind==='skill'?'S':slot.kind==='general'?'G':slot.kind==='ancestry'?'A':slot.kind==='archetype'?'Ar':slot.kind==='mythic'?'M':'D'}</span>{/if}
          <span class="text"><span class="eyebrow">{slotLabel(slot)}</span>
            <span class="value" class:unset={!chosen}>{chosen?.name??'Choose a feat'}</span>
            {#if verdict?.blocked}<small class="warn">⚠ {verdict.blocked}</small>{/if}</span>
          <span class="action">{chosen?'Change':'Choose'}</span>
        </button>
        {#if open===slot.key}
          <OptionGrid id={slot.key} items={featOptions(catalog,slot.kind,creation)} selected={chosen?[chosen.uuid]:[]}
            onToggle={item=>setFeat(slot,item)} onInfo={item=>info(item.uuid)}
            check={item=>checkFeat(item,state,{kind:slot.kind,featNames:names,currentUuid:chosen?.uuid})}
            detail={item=>item.metadata?.prerequisites?.length?'Requires '+item.metadata.prerequisites.join('; '):''}
            placeholder={'Search '+slot.label.toLowerCase()+'s'}/>
        {/if}
      </section>
    {:else if slot.type==='ability'}
      {@const picks=P.planBoosts(plan,level)}
      {@const gradual=slot.count<4}
      {@const usedInSet=gradual?P.boostsUsedInSet(plan,level):new Map()}
      <section class="slot" class:done={picks.length>=slot.count}>
        <div class="head static"><span class="icon" aria-hidden="true">◈</span>
          <span class="text"><span class="eyebrow">{gradual?'Gradual attribute boost':'Attribute boosts'} · {picks.length}/{slot.count}</span>
            <span class="muted small">{gradual?`One boost a level; levels ${P.gradualSet(level).join(', ')} boost four different attributes.`:'Four different attributes.'} At +4 or higher a boost is partial: two make +1.</span></span></div>
        <div class="boosts">
          {#each ATTRIBUTES as a}
            {@const on=picks.includes(a)}
            {@const from=before.mods[a]}
            {@const takenAt=usedInSet.get(a)}
            <button class="attr" class:on aria-pressed={on} disabled={!on&&(picks.length>=slot.count||!!takenAt)}
              title={takenAt?`Boosted at level ${takenAt} in this set`:''}
              onclick={()=>updatePlan(p=>P.toggleLevelBoost(p,level,a,slot.count,{gradual}))}>
              <b>{a.toUpperCase()}</b>
              <small class="num">{takenAt&&!on?'Level '+takenAt:formatModifier(from)+(on?(from>=4?(before.partial[a]?' → '+formatModifier(from+1):' → ½'):' → '+formatModifier(from+1)):'')}</small>
            </button>
          {/each}
        </div>
      </section>
    {:else if slot.type==='skill'}
      {@const chosen=P.planSkillIncrease(plan,slot)}
      {@const cap=maxSkillRank(level)}
      <section class="slot" class:open={open===slot.key} class:done={!!chosen}>
        <button class="head" aria-expanded={open===slot.key} onclick={()=>open=open===slot.key?null:slot.key}>
          <span class="icon" aria-hidden="true">↑</span>
          <span class="text"><span class="eyebrow">{slot.label}</span>
            <span class="value" class:unset={!chosen}>{chosen?titleCase(chosen.skill)+' → '+(RANKS[chosen.toRank]??'+1'):'Choose a skill'}</span></span>
          <span class="action">{chosen?'Change':'Choose'}</span>
        </button>
        {#if open===slot.key}
          <div class="skills">
            {#each [...SKILLS,...lores].filter(s=>!slot.allowedSkills?.length||slot.allowedSkills.includes(s)) as skill}
              {@const rank=ranksBefore.get(skill)??0}
              {@const on=chosen?.skill===P.levelerSkill(skill)}
              <button class="skill" class:on disabled={!on&&rank>=cap}
                onclick={()=>{updatePlan(p=>P.setSkillIncrease(p,slot,on?null:skill,rank+1));open=null;}}>
                <span>{titleCase(skill)}</span><RankLadder rank={on?rank+1:rank}/>
                <small>{rank>=cap&&!on?(rank>=4?'Legendary':`Max ${RANKS[cap]} at level ${level}`):RANKS[rank]+' → '+RANKS[rank+1]}</small>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {:else if slot.type==='spells'}
      {@const picks=P.planSpells(plan,level,slot.entryType)}
      {@const learned=P.learnedSpellLevels(creation,plan,slot.entryType)}
      {@const entry={entryType:slot.entryType}}
      <section class="slot">
        <div class="head static"><span class="icon" aria-hidden="true">✧</span>
          <span class="text"><span class="eyebrow">{slot.label} · {picks.length}/{slot.allowance.total}</span>
            {#if slot.allowance.any}<span class="muted small">Add {slot.allowance.any} spells of any rank you can cast to your spellbook.</span>{/if}</span></div>
        {#each spellRows(slot) as [rank,label,allowed]}
          {@const here=picks.filter(s=>rank===0?s.isCantrip:!s.isCantrip&&Number(s.rank)===rank)}
          {#if allowed!==null||here.length||spellRoom(slot,rank)>0}
            {@const rowKey=slot.key+rank}
            <div class="spell-row">
              <button class="rank" aria-expanded={open===rowKey} onclick={()=>open=open===rowKey?null:rowKey}>
                <span aria-hidden="true">{open===rowKey?'▾':'▸'}</span> {label}{allowed!==null?` · ${here.length}/${allowed}`:''}</button>
              <span class="chips-row">
                {#each here as s}<span class="spell-chip"><button class="link" onclick={()=>info(s.uuid)}>{s.name}</button>
                  <button class="link x" aria-label={'Remove '+s.name} onclick={()=>updatePlan(p=>P.togglePlanSpell(p,level,s,{rank,cantrip:rank===0,...entry}))}>×</button></span>{/each}
                {#if spellRoom(slot,rank)>0&&open!==rowKey}<button class="btn small" onclick={()=>open=rowKey}>+ Add</button>{/if}
              </span>
            </div>
            {#if open===rowKey}
              <OptionGrid id={slot.key+'-'+rank} items={spellOptions(catalog,{cantrip:rank===0,tradition:slot.tradition||tradition,rank})}
                selected={here.map(s=>s.uuid)} max={99}
                check={item=>{
                  // A spell already learned at another level can't be learned again.
                  const at=learned.get(item.uuid);
                  return at&&at!==level?{blocked:`Learned at level ${at}`,unknown:[],hard:true}:null;
                }}
                onToggle={item=>{if(here.some(s=>s.uuid===item.uuid)||spellRoom(slot,rank)>0)updatePlan(p=>P.togglePlanSpell(p,level,item,{rank,cantrip:rank===0,...entry}));}}
                onInfo={item=>info(item.uuid)} placeholder={'Search '+label.toLowerCase()+' spells'}/>
            {/if}
          {/if}
        {/each}
      </section>
    {:else if slot.type==='signature'}
      <section class="slot">
        <div class="head static"><span class="icon" aria-hidden="true">★</span>
          <span class="text"><span class="eyebrow">{slot.label}</span>
            <span class="muted small">One spell per rank from your repertoire; you can cast it at any higher rank you have slots for.</span></span></div>
        {#each slot.ranks as rank}
          {@const chosen=P.planSignature(plan,level,rank,slot.entryType)}
          {@const options=P.repertoire(creation,plan,level,slot.entryType).filter(s=>Number(s.rank)===rank)}
          <div class="spell-row">
            <span class="rank">Rank {rank}</span>
            <span class="chips-row">
              {#each options as s (s.uuid)}
                <button class="sig" class:on={chosen?.uuid===s.uuid} aria-pressed={chosen?.uuid===s.uuid}
                  onclick={()=>updatePlan(p=>P.setSignatureSpell(p,level,rank,chosen?.uuid===s.uuid?null:s,slot.entryType))}>{s.name}</button>
              {:else}<span class="muted small">Learn a rank-{rank} spell first.</span>{/each}
            </span>
          </div>
        {/each}
      </section>
    {:else}
      <section class="slot"><div class="head static"><span class="icon" aria-hidden="true">·</span>
        <span class="text"><span class="eyebrow">{slot.label}</span><span class="muted small">Applied automatically.</span></span></div></section>
    {/if}
  {:else}
    {#if !grants.length}<p class="empty">Nothing to choose at level {level}.</p>{/if}
  {/each}
  <GrantsPanel requirements={grants} store={plan?.levels?.[level]??{}} {catalog} {level}
    taken={takenFormulas(creation,plan)} onToggle={toggleGrant} {info}/>

  <!-- Extras a GM grants beyond the schedule (Leveler's bonus feats and extra skill increases). -->
  <section class="slot extras" class:open={open==='extra-feat'||open==='extra-skill'}>
    <div class="head static"><span class="icon" aria-hidden="true">+</span>
      <span class="text"><span class="eyebrow">Extras from your GM</span>
        <span class="muted small">Bonus feats or skill increases beyond the normal schedule. Leveler adds them as bonus feats.</span></span></div>
    {#if extras.length||extraIncreases.length}
      <ul class="extra-list">
        {#each extras as feat,i (feat.uuid+i)}
          <li><button class="link" onclick={()=>info(feat.uuid)}>{feat.name}</button><small class="muted">bonus feat</small>
            <button class="link x" aria-label={'Remove '+feat.name} onclick={()=>updatePlan(p=>P.removeCustomFeat(p,level,i))}>×</button></li>
        {/each}
        {#each extraIncreases as inc,i (inc.skill+i)}
          <li><span>{titleCase(String(inc.skill).replace(/-/g,' '))} → {RANKS[inc.toRank]??'+1'}</span><small class="muted">extra skill increase</small>
            <button class="link x" aria-label={'Remove '+inc.skill} onclick={()=>updatePlan(p=>P.removeCustomSkillIncrease(p,level,i))}>×</button></li>
        {/each}
      </ul>
    {/if}
    <div class="extra-actions">
      <button class="btn small" onclick={()=>open=open==='extra-feat'?null:'extra-feat'}>{open==='extra-feat'?'Close':'+ Add extra feat'}</button>
      <button class="btn small ghost" onclick={()=>open=open==='extra-skill'?null:'extra-skill'}>{open==='extra-skill'?'Close':'+ Add extra skill increase'}</button>
    </div>
    {#if open==='extra-feat'}
      <OptionGrid id={'extra-feat-'+level} items={catalog.ofType('feat')} selected={extras.map(f=>f.uuid)} max={99}
        check={item=>checkFeat(item,state,{kind:'bonus',featNames:names})}
        detail={item=>[item.metadata?.category??item.metadata?.featType,item.level!=null?'Level '+item.level:''].filter(Boolean).join(' · ')}
        onToggle={item=>{const i=extras.findIndex(f=>f.uuid===item.uuid);updatePlan(p=>i>=0?P.removeCustomFeat(p,level,i):P.addCustomFeat(p,level,item));}}
        onInfo={item=>info(item.uuid)} placeholder="Search any feat or feature"/>
    {:else if open==='extra-skill'}
      <div class="skills">
        {#each [...SKILLS,...lores] as skill}
          {@const rank=ranksBefore.get(skill)??0}
          <button class="skill" disabled={rank>=4}
            onclick={()=>{updatePlan(p=>P.addCustomSkillIncrease(p,level,skill,rank+1));open=null;}}>
            <span>{titleCase(skill)}</span><RankLadder {rank}/>
            <small>{rank>=4?'Legendary':RANKS[rank]+' → '+RANKS[rank+1]}</small>
          </button>
        {/each}
      </div>
    {/if}
  </section>
</div>
<style>
  .level{display:grid;gap:10px}
  .extras{border-style:dashed}
  .extra-list{list-style:none;margin:0;padding:0 14px;display:grid;gap:4px}
  .extra-list li{display:flex;gap:8px;align-items:baseline}
  .extra-actions{display:flex;gap:8px;flex-wrap:wrap;padding:0 14px 12px}
  .future{font-size:.88rem}
  .gained{border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px;background:var(--panel);display:grid;gap:6px}
  .gained ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
  .gained li{padding:3px 8px;border-radius:6px;background:var(--panel-2);font-size:.88rem}
  .slot{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}
  .slot.open{border-color:var(--line-strong)}
  .slot.open :global(.options),.slot :global(.options){padding:0 12px 12px}
  .head{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;
    background:none;border:0;padding:12px 14px;color:var(--text)}
  .head.static{grid-template-columns:32px minmax(0,1fr)}
  .icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--panel-2);font:700 .75rem var(--mono);color:var(--brass)}
  .icon.pic{background:none;overflow:hidden}
  .done .icon{background:var(--brass-soft)}
  .text{display:grid;gap:2px;min-width:0}
  .value{font:800 1rem var(--display)}
  .value.unset{font:400 .95rem var(--body);color:var(--muted)}
  .warn{color:var(--warn)}
  .small{font-size:.84rem}
  .action{font-weight:700;color:var(--brass);font-size:.88rem}
  .boosts{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;padding:0 12px 12px}
  .attr{border:1px solid var(--line);background:var(--panel-2);border-radius:8px;padding:8px 4px;display:grid;gap:2px;text-align:center}
  .attr b{font:700 .85rem var(--mono)}
  .attr small{font-size:.72rem;color:var(--muted)}
  .attr.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  .attr.on small{color:var(--on-brass)}
  .attr:disabled:not(.on){opacity:.35}
  .skills{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px;padding:0 12px 12px}
  .skill{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;border:1px solid var(--line);background:var(--panel-2);
    border-radius:8px;padding:8px 10px;text-align:left}
  .skill span{font-weight:700}
  .skill small{grid-column:1/-1;color:var(--muted);font-size:.75rem}
  .skill.on{border-color:var(--brass);background:var(--brass-soft)}
  .skill:disabled{opacity:.4}
  .spell-row{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;padding:6px 14px;border-top:1px solid var(--line)}
  .rank{min-width:7rem;font:600 .78rem var(--mono);color:var(--muted);background:none;border:0;padding:4px 0;text-align:left}
  .rank:hover{color:var(--text)}
  .gained li.bought{opacity:.55;text-decoration:line-through}
  .gained li small{margin-left:4px}
  .chips-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:1;min-width:0}
  .spell-chip{display:inline-flex;gap:2px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:2px 4px 2px 10px;background:var(--panel-2);font-size:.85rem}
  .x{padding:0 6px;color:var(--muted)}
  .sig{border:1px solid var(--line);background:var(--panel-2);border-radius:999px;padding:4px 12px;font-size:.85rem}
  .sig.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  @media(max-width:520px){.boosts{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>
