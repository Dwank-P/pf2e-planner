import { pairWebsite, testWebsite } from './sync.mjs';

const MODULE_ID = 'pf2e-planner-bridge';

function escapeAttribute(value) {
  return String(value ?? '').replaceAll('&','&amp;')
    .replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}
function notifyError(error) {
  const message = error?.message ?? String(error);
  ui.notifications.error('PF2e Planner: ' + message);
  console.error('[PF2e Planner Bridge] Connection failed:', message);
}
function fields(button) {
  const form = button.form;
  if (!form) throw Error('The pairing form could not be read.');
  const url = String(form.elements.namedItem('website')?.value ?? '').trim();
  const code = String(form.elements.namedItem('code')?.value ?? '').trim();
  if (!url) throw Error('Enter a Planner website URL, such as https://level.dwank.uk.');
  return { url, code };
}

/**
 * Foundry v14 native module settings submenu. A plain website URL setting
 * was misleading: saving it never redeemed the pairing code.
 */
export class PlannerConnectionMenu extends foundry.applications.api.DialogV2 {
  constructor(options = {}) {
    const saved = game.settings.get(MODULE_ID, 'websiteUrl') || '';
    const paired = game.settings.get(MODULE_ID, 'integrationId');
    const content = `
      <p>1. Sign in to your Planner website as a GM and choose
      <strong>Generate pairing code</strong>.</p>
      <p>2. Paste the website address and <strong>one-time code</strong> below.</p>
      <p>3. Select <strong>Pair &amp; Sync</strong>; saving a URL alone does not connect the world.</p>
      <div class="form-group">
        <label>Planner website URL</label>
        <input type="url" name="website" placeholder="https://level.dwank.uk"
          autocomplete="url" value="${escapeAttribute(saved)}" required />
      </div>
      <div class="form-group">
        <label>One-time pairing code</label>
        <input type="text" name="code" autocomplete="off"
          placeholder="Paste the code from the Planner website" />
      </div>
      <p class="hint">Current state: ${paired ? 'World registered; authorize this GM browser if needed.' : 'Not paired.'}</p>
      <p class="hint">Use <strong>Test Website</strong> first to check DNS, HTTPS and API compatibility.
      Testing does not consume a pairing code.</p>`;
    super({
      ...options,
      window: { ...options.window, title: 'PF2e Planner — Connect World' },
      content,
      rejectClose: false,
      buttons: [
        {
          action: 'test',
          label: 'Test Website',
          icon: 'fa-solid fa-wifi',
          callback: async (_event, button) => {
            try {
              const { url } = fields(button);
              await testWebsite(url);
              return 'connected';
            } catch (error) { notifyError(error); return 'error'; }
          }
        },
        {
          action: 'pair',
          label: 'Pair & Sync',
          icon: 'fa-solid fa-link',
          default: true,
          callback: async (_event, button) => {
            try {
              const { url, code } = fields(button);
              if (!code) throw Error('Paste the one-time pairing code from the Planner website.');
              const result = await pairWebsite(url, code);
              ui.notifications.info('PF2e Planner: Paired world and synchronized preview successfully.');
              return result;
            } catch (error) { notifyError(error); return 'error'; }
          }
        },
        { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark' }
      ]
    });
  }
}
