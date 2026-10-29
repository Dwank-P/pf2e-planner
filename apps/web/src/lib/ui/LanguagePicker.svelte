<script>
  import {LOCALES,locale,chooseLocale,tr} from '../i18n/index.js';
  /** The interface language; choosing one saves it for this browser and reloads the page. */
  let {wide=false}=$props();
</script>
<label class="language" class:wide>
  <span class="sr">{tr("Language")}</span>
  <span aria-hidden="true" class="globe">🌐</span>
  <select value={locale()} onchange={e=>chooseLocale(e.currentTarget.value)}>
    {#each LOCALES as [code,name]}<option value={code} lang={code}>{name}</option>{/each}
  </select>
</label>
<style>
  .language{display:flex;align-items:center;gap:6px;padding:4px}
  .language select{flex:1;padding:.35rem .5rem;font-size:.85rem}
  .language:not(.wide){justify-content:center}
  .language:not(.wide) select{flex:none}
  .globe{font-size:.9rem;line-height:1}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
</style>
