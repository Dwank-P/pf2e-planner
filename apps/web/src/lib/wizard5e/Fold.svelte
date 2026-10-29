<script>
  import {tr} from '../i18n/index.js';
  import Icon from '../ui/Icon.svelte';
  /** A collapsible box: the header shows what's chosen (and its icon); click to open or close. */
  let {title,summary='',img=null,done=false,open=$bindable(false),children}=$props();
</script>
<section class="fold" class:done>
  <button class="head" aria-expanded={open} onclick={()=>open=!open}>
    <span class="mark" aria-hidden="true">{#if img}<Icon src={img} size={28}/>{:else}{done?'✓':'·'}{/if}</span>
    <span class="text"><span class="eyebrow">{title}</span><b>{summary||tr('Choose')}</b></span>
    <span class="toggle">{open?tr('Close'):done?tr('Change'):tr('Choose')}</span>
  </button>
  {#if open}<div class="body">{@render children()}</div>{/if}
</section>
<style>
  .fold{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}
  .head{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;background:none;border:0;
    padding:10px 14px;text-align:left;color:var(--text)}
  .head:hover{background:var(--panel-2)}
  .mark{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--panel-3);color:var(--muted);font-weight:700}
  .done .mark{color:var(--good)}
  .text{display:grid;min-width:0}
  .text b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .toggle{font-weight:700;font-size:.85rem;color:var(--brass)}
  .body{padding:4px 14px 14px;display:grid;gap:10px;border-top:1px solid var(--line)}
</style>
