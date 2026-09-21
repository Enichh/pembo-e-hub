// src/assets/verification.js
// Shared verification modal + auto-submit 6-digit PIN input. A single reusable
// primitive: call PemboVerification.prompt(opts) to open the modal and await a
// submit/resend/cancel. Exposes only the narrow `window.PemboVerification`
// contract (like PemboSession), never ad-hoc globals.
//
// opts: {
//   email: string,        // shown in the modal
//   onSubmit(code, done)  // called on auto-submit; done(errMsg|null)
//   onResend(done)        // called on "Resend code"
//   onCancel()            // optional; called when the modal is dismissed
// }

/**
 * @typedef {Object} VerificationOptions
 * @property {string} email - Email address shown in the verification modal.
 * @property {function(string, function(string|null): void): void} onSubmit - Handler called when code is submitted.
 * @property {function(function(string|null): void): void} onResend - Handler called when resend is requested.
 * @property {function(): void} [onCancel] - Optional handler called when modal is closed/cancelled.
 */

(function () {
    'use strict';

    /**
     * Helper to create DOM elements with attributes and children.
     * @param {string} tag - HTML tag name.
     * @param {Record<string, string>} [attrs] - Element attributes.
     * @param {Array<HTMLElement|Node>} [children] - Child nodes.
     * @returns {HTMLElement} Created element.
     */
    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        if (attrs) {
            for (const k in attrs) {
                if (k === 'class') node.className = attrs[k];
                else if (k === 'text') node.textContent = attrs[k];
                else node.setAttribute(k, attrs[k]);
            }
        }
        (children || []).forEach((c) => { if (c) node.appendChild(c); });
        return node;
    }

    /** @type {{ backdrop: HTMLElement, inputs: HTMLInputElement[], error: HTMLElement, status: HTMLElement, resend: HTMLButtonElement, opts: VerificationOptions, submitting: boolean } | null} */
    let active = null; // { backdrop, inputs, opts, submitting }

    /**
     * Builds the verification modal DOM tree.
     * @param {VerificationOptions} opts - Modal options.
     * @returns {{ backdrop: HTMLElement, inputs: HTMLInputElement[], error: HTMLElement, status: HTMLElement, resend: HTMLButtonElement }} Modal elements.
     */
    function buildModal(opts) {
        const backdrop = el('div', { class: 'verify-backdrop is-open' });

        const modal = el('div', { class: 'verify-modal' });
        modal.appendChild(el('h2', { text: 'Verify your email' }));
        modal.appendChild(el('p', { text: 'Enter the 6-digit code sent to' }));
        modal.appendChild(el('p', { class: 'verify-email', text: opts.email }));

        const row = el('div', { class: 'verify-pin-row' });
        /** @type {HTMLInputElement[]} */
        const inputs = [];
        for (let i = 0; i < 6; i++) {
            const attrs = {
                class: 'verify-pin-input',
                type: 'text',
                inputmode: 'numeric',
                pattern: '[0-9]*',
                maxlength: '1',
                'aria-label': 'Digit ' + (i + 1),
            };
            if (i === 0) {
                attrs.autocomplete = 'one-time-code';
            }
            const input = el('input', attrs);
            inputs.push(/** @type {HTMLInputElement} */ (input));
            row.appendChild(input);
        }
        modal.appendChild(row);

        const error = el('p', { class: 'verify-error', text: '' });
        modal.appendChild(error);

        const status = el('div', { class: 'verify-status', 'aria-live': 'polite' });
        status.appendChild(el('span', { class: 'verify-spinner' }));
        status.appendChild(el('span', { class: 'verify-status-text', text: '' }));
        status.appendChild(el('span', { class: 'verify-check', text: '\u2713' }));
        modal.appendChild(status);

        const actions = el('div', { class: 'verify-actions' });
        const resend = el('button', { class: 'verify-resend', text: 'Resend code' });
        actions.appendChild(resend);
        modal.appendChild(actions);

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        wireInputs(inputs, () => submit(opts, inputs, error, status, /** @type {HTMLButtonElement} */ (resend)));
        resend.addEventListener('click', () => resendCode(opts, /** @type {HTMLButtonElement} */ (resend), error, status));

        return { backdrop, inputs, error, status, resend: /** @type {HTMLButtonElement} */ (resend) };
    }

    /**
     * Wires keyboard and paste input handlers to the 6 PIN input boxes.
     * @param {HTMLInputElement[]} inputs - Array of 6 PIN input elements.
     * @param {function(): void} onSubmit - Auto-submit callback.
     */
    function wireInputs(inputs, onSubmit) {
        inputs.forEach((input, idx) => {
            input.addEventListener('input', () => {
                input.value = input.value.replace(/\D/g, '').slice(0, 1);
                if (input.value && idx < inputs.length - 1) {
                    inputs[idx + 1].focus();
                } else if (!input.value && idx > 0) {
                    inputs[idx - 1].focus();
                }
                // Auto-submit as soon as all 6 digits are filled.
                if (readCode(inputs).length === 6) {
                    onSubmit();
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && idx > 0) {
                    inputs[idx - 1].focus();
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
                text.split('').forEach((ch, i) => { if (inputs[i]) inputs[i].value = ch; });
                const nextIndex = Math.min(text.length, 5);
                inputs[nextIndex].focus();
                if (text.length === 6) onSubmit();
            });
        });
    }

    /**
     * Reads and concatenates the 6 digit values from inputs.
     * @param {HTMLInputElement[]} inputs - PIN inputs array.
     * @returns {string} 6-digit PIN code.
     */
    function readCode(inputs) {
        return inputs.map((i) => i.value).join('');
    }

    /**
     * Updates the status container message and state.
     * @param {HTMLElement} statusEl - Status element container.
     * @param {string} text - Status text message.
     * @param {'success'|'loading'|null} kind - Visual indicator style.
     */
    function setStatusEl(statusEl, text, kind) {
        statusEl.querySelector('.verify-status-text').textContent = text;
        statusEl.classList.toggle('is-visible', !!text);
        statusEl.classList.toggle('is-success', kind === 'success');
    }

    /**
     * Submits the entered 6-digit verification code.
     * @param {VerificationOptions} opts - Verification options.
     * @param {HTMLInputElement[]} inputs - PIN inputs array.
     * @param {HTMLElement} errorEl - Error display element.
     * @param {HTMLElement} statusEl - Status indicator element.
     * @param {HTMLButtonElement} resendBtn - Resend button element.
     */
    function submit(opts, inputs, errorEl, statusEl, resendBtn) {
        const code = readCode(inputs);
        if (code.length !== 6) {
            errorEl.textContent = 'Please enter all 6 digits.';
            return;
        }
        if (active.submitting) return;
        active.submitting = true;
        errorEl.textContent = '';
        resendBtn.disabled = true;
        inputs.forEach((i) => { i.disabled = true; });
        setStatusEl(statusEl, 'Verifying\u2026', 'loading');

        opts.onSubmit(code, (errMsg) => {
            active.submitting = false;
            if (errMsg) {
                setStatusEl(statusEl, '', null);
                errorEl.textContent = errMsg;
                resendBtn.disabled = false;
                inputs.forEach((i) => { i.disabled = false; i.value = ''; });
                inputs[0].focus();
            }
            // On success the caller closes the modal via PemboVerification.close().
        });
    }

    /**
     * Triggers resending the verification code.
     * @param {VerificationOptions} opts - Options containing onResend callback.
     * @param {HTMLButtonElement} resendBtn - Resend button element.
     * @param {HTMLElement} errorEl - Error element.
     * @param {HTMLElement} statusEl - Status element.
     */
    function resendCode(opts, resendBtn, errorEl, statusEl) {
        if (active.submitting) return;
        resendBtn.disabled = true;
        errorEl.textContent = '';
        setStatusEl(statusEl, 'Sending a new code\u2026', 'loading');
        // Use the centralized button utility for a consistent inline spinner if available.
        if (window.PemboButton && window.PemboButton.pending) {
            window.PemboButton.pending(resendBtn, true, 'Sending\u2026');
        }
        opts.onResend((errMsg) => {
            resendBtn.disabled = false;
            if (window.PemboButton && window.PemboButton.pending) {
                window.PemboButton.pending(resendBtn, false);
            }
            if (errMsg) {
                setStatusEl(statusEl, '', null);
                errorEl.textContent = errMsg;
            } else {
                setStatusEl(statusEl, 'A new code has been sent.', 'success');
                errorEl.textContent = '';
            }
        });
    }

    /**
     * Opens the verification modal with specified options.
     * @param {VerificationOptions} opts - Verification configuration options.
     */
    function open(opts) {
        close();
        active = { opts, submitting: false, backdrop: null, inputs: [], error: null, status: null, resend: null };
        Object.assign(active, buildModal(opts));
    }

    /**
     * Closes and removes the verification modal from the DOM.
     */
    function close() {
        if (active && active.backdrop) {
            if (active.backdrop.parentNode) active.backdrop.parentNode.removeChild(active.backdrop);
        }
        active = null;
    }

    /**
     * Sets the verification modal status message.
     * @param {string} text - Message to display.
     * @param {'success'|'loading'|null} [kind] - Status type indicator.
     */
    function setStatus(text, kind) {
        if (active && active.status) {
            setStatusEl(active.status, text, kind);
        }
    }

    /**
     * @type {{ open: function(VerificationOptions): void, close: function(): void, setStatus: function(string, ('success'|'loading'|null)=): void }}
     */
    window.PemboVerification = { open, close, setStatus };
})();
