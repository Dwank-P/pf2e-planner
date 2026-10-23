<script>
  import { onMount } from 'svelte';

  let report = $state(null);
  let errorText = $state('');
  let loading = $state(true);
  let searchText = $state('');
  let featLevel = $state('all');
  let page = $state(1);
  const pageSize = 30;

  const filteredFeats = $derived((report?.feats ?? []).filter(feat => {
    const phrase = searchText.trim().toLowerCase();
    const matches = !phrase || String(feat.name).toLowerCase().includes(phrase) ||
      String(feat.slug || '').toLowerCase().includes(phrase) ||
      String(feat.uuid || '').toLowerCase().includes(phrase);
    return matches && (featLevel === 'all' || String(feat.level ?? 'Unknown') === featLevel);
  }));
  const maxPage = $derived(Math.max(1, Math.ceil(filteredFeats.length / pageSize)));
  const visibleFeats = $derived(filteredFeats.slice((Math.min(page,maxPage)-1)*pageSize,
    Math.min(page,maxPage)*pageSize));

  async function load() {
    loading = true;
    errorText = '';
    try {
      const id = decodeURIComponent(window.location.pathname.split('/')[2] || '');
      const res = await fetch('/api/v1/campaigns/' + encodeURIComponent(id) +
        '/catalog-details', {credentials:'same-origin',cache:'no-store'});
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Error(body.message || 'Unable to read catalog report (HTTP ' + res.status + ')');
      report = body;
    } catch(error) { errorText = error.message; }
    finally { loading = false; }
  }
  onMount(load);
  const when = (seconds) => seconds ? new Date(seconds * 1000).toLocaleString() : 'Never';
</script>

<svelte:head><title>Ruleset Sync Details — PF2e Planner</title></svelte:head>
<main>
  <nav><a href="/">← Back to campaigns</a> <button type="button" onclick={load} disabled={loading}>Refresh report</button></nav>
  <h1>Ruleset &amp; Synchronization</h1>
  <p>Administrator view of what this site's SQLite database actually received from the Foundry bridge.</p>
  {#if loading}
    <section>Loading received data…</section>
  {:else if errorText}
    <section class="error" role="alert">{errorText}</section>
  {:else if !report?.synced}
    <section><h2>No snapshot yet</h2><p>{report?.message || 'Sync the world from Foundry first.'}</p></section>
  {:else}
    <section>
      <div class="badges">
        <span class="badge">{report.ruleset.systemId?.toUpperCase() || 'Unknown system'} {report.ruleset.systemVersion || '?'}</span>
        <span class="badge">PF2e Leveler {report.ruleset.levelerVersion || 'unknown'}</span>
        <span class="badge amber">Partial content preview</span>
      </div>
      <h2>Last accepted snapshot</h2>
      <div class="stats">
        <div><strong>{report.totals.classes}</strong><span>Class items saved</span></div>
        <div><strong>{report.totals.feats}</strong><span>Feat entries saved</span></div>
        <div><strong>{report.totals.savedItems}</strong><span>Total saved items</span></div>
      </div>
      <dl class="metadata">
        <dt>Last received</dt><dd>{when(report.updatedAt)}</dd>
        <dt>World ID</dt><dd><code>{report.ruleset.worldId || 'Unknown'}</code></dd>
        <dt>Snapshot ID</dt><dd><code>{report.snapshotId}</code></dd>
        <dt>Stored SHA-256</dt><dd><code>{report.sha256}</code></dd>
        <dt>Schema version</dt><dd>{report.schemaVersion}</dd>
      </dl>
      <h3>What's missing</h3>
      <ul>{#each report.limits as limit}<li>{limit}</li>{/each}</ul>
      {#if report.note}<p class="muted">Bridge note: {report.note}</p>{/if}
    </section>
    <section>
      <h2>Source compendiums</h2>
      <p>These pack names were derived from the UUIDs actually saved in this snapshot.</p>
      <div class="cols">
        <div><h3>Classes</h3>
          {#each report.sources.classes as source}
            <div class="metric"><code>{source.label}</code><strong>{source.count}</strong></div>
          {/each}
        </div>
        <div><h3>Feats</h3>
          {#each report.sources.feats as source}
            <div class="metric"><code>{source.label}</code><strong>{source.count}</strong></div>
          {/each}
        </div>
      </div>
    </section>
    <section>
      <h2>Class progression received ({report.classes?.length ?? 0})</h2>
      <p>Based on the actual Foundry class Item schedules, not predefined website class names.</p>
      <div class="scroll">
        <table>
          <thead><tr><th>Class</th><th>Class feats</th><th>Skill feats</th><th>General feats</th><th>Skill increases</th></tr></thead>
          <tbody>
            {#each report.classes || [] as cls (cls.uuid)}
              <tr>
                <td><strong>{cls.name}</strong><small>{cls.uuid}</small></td>
                <td>{(cls.classFeatLevels || []).join(', ') || '—'}</td>
                <td>{(cls.skillFeatLevels || []).join(', ') || '—'}</td>
                <td>{(cls.generalFeatLevels || []).join(', ') || '—'}</td>
                <td>{(cls.skillIncreaseLevels || []).join(', ') || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
    <section>
      <h2>Feat metadata received ({report.feats?.length ?? 0})</h2>
      <p>This is a searchable view of the first 1,000 indexed feat entries received. It is not the complete feats catalogue.</p>
      <div class="filters">
        <label>Search <input type="search" placeholder="Name, slug or UUID" bind:value={searchText} oninput={() => page = 1}/></label>
        <label>Feat level
          <select bind:value={featLevel} onchange={() => page = 1}>
            <option value="all">All levels</option>
            {#each report.featLevels as level}
              <option value={level.label}>{level.label}</option>
            {/each}
          </select>
        </label>
      </div>
      <p class="muted">{filteredFeats.length} matching entries · Page {Math.min(page,maxPage)} of {maxPage}</p>
      <div class="scroll">
        <table>
          <thead><tr><th>Feat</th><th>Level</th><th>Rarity</th><th>Compendium UUID</th></tr></thead>
          <tbody>
            {#each visibleFeats as feat (feat.uuid)}
              <tr><td><strong>{feat.name}</strong></td><td>{feat.level ?? '—'}</td>
                <td>{feat.rarity || '—'}</td><td><code>{feat.uuid}</code></td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button type="button" disabled={page<=1} onclick={() => page--}>Previous</button>
        <button type="button" disabled={page>=maxPage} onclick={() => page++}>Next</button>
      </div>
      <h3>Feat level distribution</h3>
      <div class="chips">{#each report.featLevels as level}<span class="chip">Level {level.label}: {level.count}</span>{/each}</div>
      <h3>Rarities</h3>
      <div class="chips">{#each report.featRarities as rarity}<span class="chip">{rarity.label}: {rarity.count}</span>{/each}</div>
    </section>
  {/if}
</main>
<style>
  :global(body){background:#101820;color:#e9f1f5;font:16px system-ui,sans-serif;margin:0}
  main{max-width:1140px;margin:0 auto;padding:2rem}h1{font-size:2.5rem}h2{margin-top:0}
  section{background:#1e2b36;border:1px solid #415260;border-radius:8px;padding:1.5rem;margin:1.2rem 0;}
  nav{display:flex;justify-content:space-between;gap:1rem;align-items:center}
  a{color:#a4d9f6}button{cursor:pointer;background:#bbd8e5;color:#13232c;border:0;border-radius:4px;padding:.6rem .9rem;font:inherit}
  button:disabled{opacity:.5}.badges,.chips{display:flex;flex-wrap:wrap;gap:.5rem}
  .badge,.chip{border:1px solid #648b9d;background:#253f4e;padding:.3rem .65rem;border-radius:4px}
  .amber{border-color:#bb9447;color:#ffe1a1;background:#45381f}
  .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:1rem 0}
  .stats>div{padding:1rem;background:#132634;border-radius:6px}.stats strong{display:block;font-size:2rem}
  .stats span,.muted,small{color:#b3c3cd}.metadata{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.7rem 1rem}
  dt{color:#9dbbd0}dd{margin:0;overflow-wrap:anywhere}.cols{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
  .metric{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid #415260;padding:.6rem 0}
  .scroll{overflow:auto}table{width:100%;border-collapse:collapse}td,th{padding:.75rem .6rem;border-bottom:1px solid #415260;text-align:left;vertical-align:top}
  td small{display:block;overflow-wrap:anywhere;font:11px monospace;margin-top:.4rem}
  code{overflow-wrap:anywhere;font-size:.8rem}.filters{display:flex;gap:1rem;flex-wrap:wrap}
  label{display:block}input,select{display:block;margin-top:.4rem;background:#122631;color:#fff;border:1px solid #7894a7;padding:.7rem;border-radius:4px;min-width:190px}
  .pagination{display:flex;gap:.7rem;margin-top:1rem}.error{background:#61272c}
  @media(max-width:740px){.cols,.stats{grid-template-columns:1fr}.metadata{grid-template-columns:1fr}main{padding:1rem}}
</style>
