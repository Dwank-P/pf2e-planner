<script>
  import OptionGrid from './OptionGrid.svelte';
  import FeatChoices from './FeatChoices.svelte';
  import {choiceContext} from '../builder/choice-sets.js';
  import RankLadder from '../ui/RankLadder.svelte';
  import * as P from '../builder/plan.js';
  import {buildState,checkFeat,featNameIndex,skillRanks} from '../builder/legality.js';
  import {SKILLS,RANKS,titleCase} from '../builder/rules.js';
  /**
   * Extra feats and skill increases at a level, beyond the class schedule (a GM's bonus,
   * a homebrew feat). Saved as Leveler's customFeats / customSkillIncreases. Opened from
   * the "+" beside the next-level button; `mode` is 'feat', 'skill' or null.
   */
  let {level,creation,plan,catalog,variants={},updatePlan,info,mode=$bindable(null)}=$props();
  const lookup=$derived(catalog.get);
  const extras=$derived(P.customFeats(plan,level));
  const increases=$derived(P.customSkillIncreases(plan,level));
  const state=$derived(buildState(creation,plan,lookup,level,variants));
  const names=$derived(featNameIndex(catalog));
  const ranksBefore=$derived(skillRanks(creation,plan,lookup,level));
  const lores=$derived([...ranksBefore.keys()].filter(k=>k.endsWith(' lore')));
</script>
{#if mode||extras.length||increases.length}
  <section class="extras" aria-label="Extras at level {level}">
    <div class="head"><span class="eyebrow">Extras at level {level}</span>
      {#if mode}<button class="link" onclick={()=>mode=null}>Done</button>{/if}</div>
    {#if extras.length||increases.length}
      <ul>
        {#each extras as feat,i (feat.uuid+i)}
          <li><button class="link" onclick={()=>info(feat.uuid)}>{feat.name}</button><small class="muted">extra feat</small>
            <button class="link x" aria-label={'Remove '+feat.name} onclick={()=>updatePlan(p=>P.removeCustomFeat(p,level,i))}>×</button>
            <div class="extra-choices"><FeatChoices entry={feat} {catalog} context={choiceContext(creation,plan,lookup)} {info}
              onChange={choices=>updatePlan(p=>P.setCustomFeatChoices(p,level,i,choices))}/></div></li>
        {/each}
        {#each increases as inc,i (inc.skill+i)}
          <li><span>{titleCase(String(inc.skill).replace(/-/g,' '))} → {RANKS[inc.toRank]??'+1'}</span><small class="muted">extra skill increase</small>
            <button class="link x" aria-label={'Remove '+inc.skill} onclick={()=>updatePlan(p=>P.removeCustomSkillIncrease(p,level,i))}>×</button></li>
        {/each}
      </ul>
    {/if}
    {#if level===1&&extras.length}
      <p class="muted small">Leveler applies extras from level 2 on; add level-1 extras to the actor in Foundry after its Character Wizard.</p>
    {/if}
    {#if mode==='feat'}
      <OptionGrid id={'extra-feat-'+level} items={catalog.ofType('feat')} selected={extras.map(f=>f.uuid)} max={99}
        check={item=>checkFeat(item,state,{kind:'bonus',featNames:names})}
        detail={item=>[item.metadata?.category??item.metadata?.featType,item.level!=null?'Level '+item.level:''].filter(Boolean).join(' · ')}
        onToggle={item=>{const i=extras.findIndex(f=>f.uuid===item.uuid);updatePlan(p=>i>=0?P.removeCustomFeat(p,level,i):P.addCustomFeat(p,level,item));}}
        onInfo={item=>info(item.uuid)} placeholder="Search any feat or feature"/>
    {:else if mode==='skill'}
      <div class="skills">
        {#each [...SKILLS,...lores] as skill}
          {@const rank=ranksBefore.get(skill)??0}
          <button class="skill" disabled={rank>=4}
            onclick={()=>{updatePlan(p=>P.addCustomSkillIncrease(p,level,skill,rank+1));mode=null;}}>
            <span>{titleCase(skill)}</span><RankLadder {rank}/>
            <small>{rank>=4?'Legendary':RANKS[rank]+' → '+RANKS[rank+1]}</small>
          </button>
        {/each}
      </div>
    {/if}
  </section>
{/if}
<style>
  .extras{border:1px dashed var(--line-strong);border-radius:var(--radius);background:var(--panel);padding:12px 14px;display:grid;gap:10px}
  .head{display:flex;justify-content:space-between;align-items:center}
  ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
  li{display:flex;gap:8px;align-items:baseline}
  .x{padding:0 6px;color:var(--muted)}
  .small{font-size:.84rem}
  .skills{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px}
  .skill{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;border:1px solid var(--line);background:var(--panel-2);
    border-radius:8px;padding:8px 10px;text-align:left}
  .skill span{font-weight:700}
  .skill small{grid-column:1/-1;color:var(--muted);font-size:.75rem}
  .skill:disabled{opacity:.4}
  .extra-choices{flex-basis:100%}
</style>
