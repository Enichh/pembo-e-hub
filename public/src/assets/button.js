// src/assets/button.js
// Centralized button loading / pending state utility (single source of truth).
//
// One contract, exposed as a global so it can be reused across the whole
// codebase regardless of module system:
//   window.PemboButton.loading(...), .pending(...), .confirm(...),
//   .setBusy(...). This file is a classic script (no ES `export`), so it loads
//   identically via <script> on the login page and every dashboard shell.
//
// Responsibilities (kept narrow — SRP):
//   - Toggle a <button> (or any element) into an accessible "busy" state:
//       * `disabled` is set on the button itself
//       * an inline CSS spinner is injected
//       * the original label is preserved and restored automatically
//       * `aria-busy="true"` is set for screen readers
//   - Provide a `pending(...)` helper for generic "waiting" states.
//   - Provide a `confirm(...)` helper for a lightweight confirmation dialog.
//
// It intentionally does NOT depend on any other module and injects its own
// minimal styles, so it is fully drop-in.

/* ------------------------------------------------------------------ *
 * Minimal self-contained styles (injected once, idempotent)
 * ------------------------------------------------------------------ */

/** @type {boolean} */
let stylesInjected = false;

function injectStyles() {
    if (stylesInjected || typeof document === 'undefined') return;
    stylesInjected = true;

    const css = [
        '.pembo-btn-busy{position:relative;pointer-events:none;}',
        '.pembo-btn-busy:disabled{opacity:.7;cursor:not-allowed;}',
        '.pembo-btn-spinner{display:inline-block;width:0.9em;height:0.9em;margin-right:0.5em;',
        '  vertical-align:-0.125em;border:2px solid rgba(255,255,255,.4);',
        '  border-top-color:currentColor;border-radius:50%;',
        '  animation:pembo-spin .6s linear infinite;flex-shrink:0;}',
        '.pembo-btn-spinner--dark{border-color:rgba(15,23,42,.25);border-top-color:currentColor;}',
        '@keyframes pembo-spin{to{transform:rotate(360deg);}}',
        '.pembo-confirm-backdrop{position:fixed;inset:0;z-index:10000;',
        '  display:flex;align-items:center;justify-content:center;',
        '  background:rgba(15,23,42,.45);padding:16px;}',
        '.pembo-confirm-dialog{background:var(--card-bg,#fff);color:var(--text-main,#0f172a);',
        '  max-width:360px;width:100%;border-radius:12px;padding:20px;',
        '  box-shadow:0 20px 50px rgba(15,23,42,.3);}',
        '.pembo-confirm-title{font-size:1.05rem;font-weight:700;margin:0 0 8px;}',
        '.pembo-confirm-message{font-size:0.9rem;color:var(--text-muted,#64748b);margin:0 0 18px;line-height:1.5;}',
        '.pembo-confirm-actions{display:flex;gap:10px;justify-content:flex-end;}',
        '.pembo-confirm-actions button{padding:8px 14px;border-radius:8px;border:none;',
        '  font-size:0.88rem;font-weight:600;cursor:pointer;}',
        '.pembo-confirm-cancel{background:#f1f5f9;color:var(--text-main,#0f172a);border:1px solid var(--border,#e2e8f0);}',
        '.pembo-confirm-ok{background:var(--primary,#2563eb);color:#fff;}',
    ].join('\n');

    const style = document.createElement('style');
    style.setAttribute('data-pembo-button', '1');
    style.textContent = css;
    document.head.appendChild(style);
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Build the inline spinner element.
 * @param {boolean} dark - Use a dark spinner (for light/neutral buttons).
 * @returns {HTMLSpanElement}
 */
function buildSpinner(dark) {
    const spinner = document.createElement('span');
    spinner.className = 'pembo-btn-spinner' + (dark ? ' pembo-btn-spinner--dark' : '');
    spinner.setAttribute('aria-hidden', 'true');
    return spinner;
}

/**
 * Determine whether a spinner on this button should be "dark" (for light
 * backgrounds). Heuristic: light/neutral buttons (.btn-secondary, or white-ish
 * computed background) get a dark spinner; primary/danger (colored) get light.
 * @param {HTMLElement} btn
 * @returns {boolean}
 */
function isDarkSpinner(btn) {
    if (btn.classList.contains('btn-secondary')) return true;
    const bg = getComputedStyle(btn).backgroundColor;
    // Match "rgba(255, 255, 255, ...)" or "#fff..." light backgrounds.
    const m = bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        return (r + g + b) / 3 > 200; // bright background -> dark spinner
    }
    return false;
}

/**
 * Set a button into (or out of) a busy/loading state. When `busy` is true, the
 * button is disabled, an inline spinner is prepended, `aria-busy` is set, and
 * the original label is preserved for later restoration.
 *
 * @param {HTMLElement|null} btn - The button (or button-like) element.
 * @param {boolean} busy - True to enable busy state, false to restore.
 * @param {string} [loadingLabel] - Optional label shown while busy. Defaults to preserving the current label.
 * @returns {void}
 */
function setBusy(btn, busy, loadingLabel) {
    if (!btn) return;
    injectStyles();

    if (busy) {
        // Preserve original label only once (avoid clobbering on re-entry).
        if (!btn.dataset.pemboOriginalLabel) {
            btn.dataset.pemboOriginalLabel = btn.textContent.trim();
        }
        btn.dataset.pemboBusy = '1';
        btn.setAttribute('aria-busy', 'true');
        btn.classList.add('pembo-btn-busy');
        if (btn instanceof HTMLButtonElement) btn.disabled = true;

        // Swap in spinner + loading label.
        const dark = isDarkSpinner(btn);
        btn.textContent = '';
        if (btn.prepend) {
            btn.prepend(buildSpinner(dark));
        } else {
            // Fallback for browsers without prepend.
            btn.insertBefore(buildSpinner(dark), btn.firstChild);
        }
        // Append the label text after the spinner.
        const labelNode = document.createElement('span');
        labelNode.className = 'pembo-btn-label';
        labelNode.textContent = (typeof loadingLabel === 'string' && loadingLabel !== '')
            ? loadingLabel
            : btn.dataset.pemboOriginalLabel;
        btn.appendChild(labelNode);
    } else {
        // Restore original label and cleanup.
        const original = btn.dataset.pemboOriginalLabel || '';
        btn.classList.remove('pembo-btn-busy');
        btn.removeAttribute('aria-busy');
        if (btn instanceof HTMLButtonElement) btn.disabled = false;
        btn.textContent = original;
        delete btn.dataset.pemboBusy;
        // Keep original label stored so future toggles still work (harmless).
    }
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Run an async operation while showing a loading state on the given button.
 * Returns the same promise the operation returns, and always restores the
 * button (even on throw), so callers can await/`.then` safely.
 *
 * @template T
 * @param {HTMLElement|null} btn - The button to show loading state on.
 * @param {function(): Promise<T>|T} operation - The async work to perform.
 * @param {{ loadingLabel?: string }} [opts] - Options.
 * @returns {Promise<T>}
 */
async function loading(btn, operation, opts) {
    if (!btn) return operation();
    const o = opts || {};
    setBusy(btn, true, o.loadingLabel);
    try {
        return await operation();
    } finally {
        setBusy(btn, false);
    }
}

/**
 * A generic "pending" state toggler. Unlike `loading`, this does not run an
 * operation for you — it simply puts a button into (or out of) a busy pending
 * state. Useful when the async work is dispatched elsewhere.
 *
 * @param {HTMLElement|null} btn - Target button.
 * @param {boolean} waiting - True to show pending, false to clear.
 * @param {string} [label] - Label shown while pending.
 * @returns {void}
 */
function pending(btn, waiting, label) {
    setBusy(btn, waiting, label);
}

/**
 * Show a minimal confirmation dialog and await the user's answer.
 * This gives the user a clear confirmation step (addresses "no confirmation").
 *
 * @param {{ title?: string, message: string, confirmText?: string, cancelText?: string, danger?: boolean }} opts
 * @returns {Promise<boolean>} Resolves true if confirmed, false otherwise.
 */
function confirm(opts) {
    return new Promise((resolve) => {
        injectStyles();

        const o = opts || {};
        const backdrop = document.createElement('div');
        backdrop.className = 'pembo-confirm-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-label', o.title || 'Confirm');

        const dialog = document.createElement('div');
        dialog.className = 'pembo-confirm-dialog';

        if (o.title) {
            const title = document.createElement('h3');
            title.className = 'pembo-confirm-title';
            title.textContent = o.title;
            dialog.appendChild(title);
        }

        const message = document.createElement('p');
        message.className = 'pembo-confirm-message';
        message.textContent = o.message;
        dialog.appendChild(message);

        const actions = document.createElement('div');
        actions.className = 'pembo-confirm-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'pembo-confirm-cancel';
        cancelBtn.textContent = o.cancelText || 'Cancel';

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'pembo-confirm-ok';
        okBtn.textContent = o.confirmText || 'Confirm';

        const cleanup = (value) => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey);
            resolve(value);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup(false);
        };

        cancelBtn.addEventListener('click', () => cleanup(false));
        okBtn.addEventListener('click', () => cleanup(true));
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
        document.addEventListener('keydown', onKey);

        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        okBtn.focus();
    });
}

/* ------------------------------------------------------------------ *
 * Expose the global contract
 * ------------------------------------------------------------------ */

// Global window contract. The buttons on the login page, dashboard shells, and
// all feature slices are loaded as classic <script> tags and access these via
// `window.PemboButton.*`. Keeping this file free of ES `export` statements
// ensures it works identically whether loaded as a classic script or (via a
// wrapper) as a module — a single code path for everyone.
if (typeof window !== 'undefined') {
    window.PemboButton = { setBusy, loading, pending, confirm };
}
