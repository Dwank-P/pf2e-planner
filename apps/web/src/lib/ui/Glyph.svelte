<script>
  import {GLYPHS} from './glyphs.js';
  /** A game-icons.net glyph (see glyphs.js) in the current text colour. */
  let {name,size=16,title=''}=$props();
  const body=$derived(GLYPHS[name]??'');
</script>
{#if body}
  <svg class="glyph" viewBox="0 0 512 512" width={size} height={size} role={title?'img':undefined} aria-hidden={title?undefined:'true'}
    aria-label={title||undefined}>{#if title}<title>{title}</title>{/if}{@html body}</svg>
{/if}
<style>.glyph{flex:none;vertical-align:-2px;color:var(--brass)}</style>
