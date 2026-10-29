<script>
  import {tr} from '../i18n/index.js';
  import OptionGrid from './OptionGrid.svelte';
  import {grantSelections,grantCandidates,GRANT_KIND_LABEL} from '../builder/grants.js';
  /**
   * Formulas, items and spells that feats or the class let you choose (Leveler's
   * feat grants). `store` holds featGrants: the creation at level 1, else the level's plan data.
   */
  let {requirements=[],store={},catalog,level=1,taken=new Map(),onToggle,info,maxLevelCap=null}=$props();
  let open=$state(null);
  const label=r=>(r.sourceFeatName??tr('Feat'))+' · '+(GRANT_KIND_LABEL[r.kind]??tr('Choices'));
</script>
{#each requirements as requirement (requirement.id)}
  {@const picks=grantSelections(store,requirement)}
  {@const count=requirement.count}
  {@const fixed=new Set((requirement.fixedSelections??[]).map(s=>s.uuid??s.slug??s.name))}
  <section class="slot" class:open={open===requirement.id} class:done={count!=null&&picks.length>=count}>
    <button class="head" aria-expanded={open===requirement.id} onclick={()=>open=open===requirement.id?null:requirement.id}>
      <span class="icon" aria-hidden="true">{requirement.kind==='spell'?'✧':'⚗'}</span>
      <span class="text"><span class="eyebrow">{label(requirement)}{count!=null?` · ${picks.length}/${count}`:''}</span>
        <span class="value" class:unset={!picks.length}>{picks.map(p=>p.name).join(', ')||'—'}</span>
        {#if requirement.grantingSourceName}<small class="muted">{tr("From {0}", requirement.grantingSourceName)}</small>{/if}
        {#if count==null}<small class="muted">{tr("Leveler couldn't tell how many; pick what the feat says.")}</small>{/if}</span>
      <span class="action">{open===requirement.id?tr('Close'):picks.length?tr('Change'):tr('Choose')}</span>
    </button>
    {#if open===requirement.id}
      <div class="body">
        <OptionGrid id={'grant-'+requirement.id} items={grantCandidates(catalog,requirement,{maxLevelCap:requirement.kind==='formula'?maxLevelCap:null})}
          selected={picks.map(p=>p.uuid)} max={count??99}
          check={item=>{
            if(fixed.has(item.uuid))return {blocked:tr('Granted automatically'),unknown:[],hard:true};
            const at=requirement.kind==='formula'?taken.get(item.uuid):null;
            return at&&!picks.some(p=>p.uuid===item.uuid)?{blocked:tr("Formula already chosen{0}",at===level?'':tr(' at level {0}',at)),unknown:[],hard:true}:null;
          }}
          detail={item=>[item.level!=null?tr('Level {0}',item.level):'',(item.traits??[]).includes('consumable')?tr('Consumable'):''].filter(Boolean).join(' · ')}
          onToggle={item=>onToggle(requirement,item)} onInfo={item=>info(item.uuid)}
          placeholder={tr('Search {0}',(GRANT_KIND_LABEL[requirement.kind]??tr('options')).toLowerCase())}
          empty={tr("Nothing in the synced compendiums matches. Ask the GM to add the equipment packs in Leveler’s Compendium Manager.")}/>
      </div>
    {/if}
  </section>
{/each}
<style>
  .slot{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}
  .slot.open{border-color:var(--line-strong)}
  .head{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;
    background:none;border:0;padding:12px 14px;color:var(--text)}
  .icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--panel-2);font:700 .85rem var(--mono);color:var(--brass)}
  .done .icon{background:var(--brass-soft)}
  .text{display:grid;gap:2px;min-width:0}
  .value{font:800 1rem var(--display);overflow-wrap:anywhere}
  .value.unset{font:400 .95rem var(--body);color:var(--muted)}
  .action{font-weight:700;color:var(--brass);font-size:.88rem}
  .body{padding:0 12px 12px}
</style>
