<script>
  import {tr} from '../i18n/index.js';
  /** Armor Class in a shield, beside the character's name. title: how it's made up. */
  let {value,title=''}=$props();
</script>
<span class="ac" {title} role="img" aria-label={tr('Armor Class {0}',value)}>
  <svg viewBox="0 0 64 72" aria-hidden="true">
    <path d="M32 3 L59 12 V34 C59 52 46 63 32 69 C18 63 5 52 5 34 V12 Z"/>
  </svg>
  <span class="text"><small>{tr("AC")}</small><b class="num">{value}</b></span>
</span>
<style>
  .ac{position:relative;display:inline-grid;place-items:center;width:52px;height:58px;flex:none}
  svg{position:absolute;inset:0;width:100%;height:100%}
  path{fill:var(--panel-3);stroke:var(--brass-strong,var(--brass));stroke-width:4;stroke-linejoin:round}
  .text{position:relative;display:grid;justify-items:center;line-height:1;margin-top:-4px}
  small{font:800 .62rem var(--display);letter-spacing:.06em;color:var(--text-2)}
  b{font:800 1.25rem var(--display);color:var(--text)}
</style>
