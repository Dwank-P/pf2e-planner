<script>
  import {readTheme,applyTheme} from './ui/theme.js';
  let theme=$state('system');
  $effect(()=>{theme=readTheme();});
</script>
<label class="theme-picker">
  <span class="sr">Theme</span>
  <select value={theme} onchange={e=>{theme=e.currentTarget.value;applyTheme(theme);}}>
    <option value="system">Auto theme</option>
    <option value="dark">Dark</option>
    <option value="light">Light</option>
  </select>
</label>
<style>
  .theme-picker select{padding:.35rem .5rem;font-size:.8rem}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
</style>
