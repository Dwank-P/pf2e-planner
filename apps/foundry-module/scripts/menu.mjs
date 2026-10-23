import { pairWebsite, testWebsite } from './sync.mjs';
import { normalizeWebsiteUrl } from './url.mjs';

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
function fields(button, dialog) {
  // DialogV2's generated form and callback element differ slightly across
  // versions. Prefer the DOM of this rendered dialog and a named form.
  const element = dialog?.element || button?.closest?.('.window-app') ||
    button?.closest?.('.application');
  const scope = element?.querySelector?.('.planner-pair-form') || button?.form;
  const inputUrl = scope?.querySelector?.('input[name="website"]');
  const inputCode = scope?.querySelector?.('input[name="code"]');
  if (!inputUrl) throw Error('Unable to read the pairing form. Reload Foundry and reopen the dialog.');
  const url = normalizeWebsiteUrl(String(inputUrl.value ?? ''));
  // Reflect the normalized origin back in the dialog for clarity.
  inputUrl.value = url;
  return { url, code: String(inputCode?.value ?? '').trim() };
}

export class PlannerConnectionMenu extends foundry.applications.api.DialogV2 {
  constructor(options = {}) {
    const saved = game.settings.get(MODULE_ID, 'websiteUrl') || '';
    const paired = game.settings.get(MODULE_ID, 'integrationId');
    const content = `
      <div class="planner-pair-form">
        <p>Get a one-time code from the Planner website's <strong>Generate pairing code</strong> button.</p>
        <div class="form-group">
          <label for="planner-website">Website domain or IP</label>
          <input id="planner-website" type="text" name="website" inputmode="url"
            placeholder="level.dwank.uk" value="${escapeAttribute(saved)}" required />
          <p class="hint">HTTPS is added automatically if you omit it. HTTP works only for local loopback tests.</p>
        </div>
        <div class="form-group">
          <label for="planner-code">One-time pairing code</label>
          <input id="planner-code" type="text" name="code"
            placeholder="Paste your code here" spellcheck="false" autocapitalize="off" />
        </div>
        <p class="hint">Status: ${paired ? 'World paired — enter a fresh code to authorize this browser.' : 'Not yet paired.'}</p>
        <div class="form-group">
          <button id="planner-test-website" type="button">
            <i class="fa-solid fa-wifi"></i> Test Website
          </button>
          <p id="planner-test-result" class="hint" role="status" aria-live="polite">
            Test the address without consuming your pairing code. The dialog stays open.
          </p>
        </div>
      </div>`;
    super({
      ...options,
      window: { ...options.window, title: 'PF2e Planner — Pair World' },
      content,
      rejectClose: false,
      buttons: [
        {
          action: 'pair',
          label: 'Pair & Sync',
          icon: 'fa-solid fa-link',
          default: true,
          callback: async (_event, button, dialog) => {
            try {
              const { url, code } = fields(button, dialog || this);
              if (!/^[A-Za-z0-9_-]{40,70}$/.test(code)) {
                throw Error('Enter a valid one-time pairing code from the Planner website.');
              }
              const result = await pairWebsite(url, code);
              ui.notifications.info('PF2e Planner: World paired and preview synchronized.');
              return result;
            } catch (error) { notifyError(error); return null; }
          }
        },
        { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark' }
      ]
    });
  }

  /**
   * Keep website testing inside the dialog content as a non-submit button.
   * DialogV2 footer buttons submit and close the dialog, regardless of
   * the callback's return value; this control must not do that.
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const button = this.element?.querySelector('#planner-test-website');
    const status = this.element?.querySelector('#planner-test-result');
    if (!button || !status) return;

    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = 'Checking website…';
      try {
        const { url } = fields(button, this);
        const result = await testWebsite(url);
        status.textContent = 'Connected successfully to PF2e Planner v' +
          (result.version ?? 'unknown') + '. Enter your code and click Pair & Sync.';
      } catch (error) {
        const message = error?.message ?? String(error);
        status.textContent = 'Connection failed: ' + message;
        notifyError(error);
      } finally {
        button.disabled = false;
      }
    });
  }
}
