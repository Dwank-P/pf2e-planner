<script>
  import '../app.css';
  import {setLocale} from '../lib/i18n/index.js';
  let {data,children}=$props();
  // Set before any page renders; the language only changes with a reload.
  setLocale(data.locale,data.messages);
</script>
{@render children()}
