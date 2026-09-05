// src/features/auth/components/reset.js
// Password-reset wiring for index.html only. SRP: this file owns ONLY the
// forgot-password interaction, end to end, as a single FLOATING pop-up modal
// (not an inline panel in the auth card, and not the shared registration
// verification modal). Three phases inside the one modal:
//   1. Enter email         -> request_password_reset (code emailed)
//   2. Enter 6-digit code  -> verify_reset_code     (issues reset token)
//   3. Set a new password  -> reset_password        (applies the password)
// Exposes a single narrow contract: window.PemboReset.open(). Session lifecycle
// lives in session.js.

(function () {

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// ---------- shared helpers ----------

function showAlert(message, isError = false) {
    const alertBox = document.getElementById('alert-box');
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = 'auth-alert ' + (isError ? 'auth-alert-error' : 'auth-alert-success');
}

function clearAlert() {
    const alertBox = document.getElementById('alert-box');
    if (alertBox) alertBox.className = 'auth-alert';
}

function setFieldError(input, hintEl, message) {
    input.classList.add('field-invalid');
    if (hintEl) {
        hintEl.textContent = message;
        hintEl.classList.add('field-hint-error');
    }
}

function clearFieldError(input, hintEl) {
    input.classList.remove('field-invalid');
    if (hintEl) {
        hintEl.textContent = '';
        hintEl.classList.remove('field-hint-error');
    }
}

// Centralized button loading state (delegates to the shared PemboButton utility,
// which also injects a spinner + aria-busy). Falls back to a local method only
// if the utility script is not yet loaded.
function setButtonLoading(btn, loading, label) {
    if (window.PemboButton && window.PemboButton.pending) {
        if (loading) {
            window.PemboButton.pending(btn, true, label);
        } else {
            window.PemboButton.pending(btn, false);
            // Restore the phase-appropriate label (not necessarily the original).
            if (label && btn) btn.textContent = label;
        }
    } else {
        btn.disabled = loading;
        btn.textContent = loading ? '\u2026 ' + label : label;
    }
}

function csrf() {
    return window.PemboSession.getCsrfToken();
}

// ---------- modal state ----------

// phase 'email' -> email input to request a code
// phase 'code'  -> 6 PIN inputs to verify the emailed code
// phase 'set'   -> new + confirm password fields, after successful verify
let modalState = null;

function buildModalRoot() {
    const backdrop = document.createElement('div');
    backdrop.className = 'reset-backdrop';
    backdrop.id = 'reset-modal';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Reset password');

    const card = document.createElement('div');
    card.className = 'reset-modal';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'reset-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00d7';

    const title = document.createElement('h2');
    title.className = 'reset-title';

    const sub = document.createElement('p');
    sub.className = 'reset-sub';

    const body = document.createElement('div');
    body.className = 'reset-body';

    const error = document.createElement('p');
    error.className = 'reset-error';
    error.setAttribute('aria-live', 'polite');

    card.appendChild(closeBtn);
    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(body);
    card.appendChild(error);
    backdrop.appendChild(card);

    closeBtn.addEventListener('click', () => closeResetModal());

    // Clicking the dimmed backdrop closes it (only during the email phase,
    // where dropping the modal is lossless; later phases already resent/issued
    // state and rely on explicit close).
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeResetModal();
    });

    return { backdrop, card, title, sub, body, error, closeBtn };
}

// ---------- phase builders ----------

function buildEmailPhase(body) {
    body.textContent = '';

    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.setAttribute('for', 'reset-email');
    label.textContent = 'Email address';

    const input = document.createElement('input');
    input.type = 'email';
    input.id = 'reset-email';
    input.className = 'field';
    input.autocomplete = 'email';
    input.placeholder = 'name@pembo.gov.ph';
    input.inputMode = 'email';

    const hint = document.createElement('p');
    hint.id = 'reset-email-hint';
    hint.className = 'field-hint';
    hint.textContent = 'Enter the email of your account.';

    group.appendChild(label);
    group.appendChild(input);
    group.appendChild(hint);
    body.appendChild(group);

    const actions = document.createElement('div');
    actions.className = 'reset-actions';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'btn btn-primary reset-submit';
    submit.textContent = 'Send Reset Code';
    actions.appendChild(submit);
    body.appendChild(actions);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit.click(); }
    });
    submit.addEventListener('click', () => submitEmail());

    return { input, hint, submit };
}

function buildCodePhase(body) {
    body.textContent = '';

    const row = document.createElement('div');
    row.className = 'reset-pin-row';
    const inputs = [];
    for (let i = 0; i < 6; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.maxLength = 1;
        input.className = 'reset-pin-input';
        input.setAttribute('aria-label', 'Digit ' + (i + 1));
        inputs.push(input);
        row.appendChild(input);
    }
    body.appendChild(row);

    const actions = document.createElement('div');
    actions.className = 'reset-actions';

    const resend = document.createElement('button');
    resend.type = 'button';
    resend.className = 'btn reset-resend';
    resend.textContent = 'Resend code';
    actions.appendChild(resend);
    body.appendChild(actions);

    wirePinInputs(inputs, () => submitCode(inputs));

    resend.addEventListener('click', () => resendCode(resend));

    return { inputs, resend };
}

function wirePinInputs(inputs, onSubmit) {
    inputs.forEach((input, idx) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(0, 1);
            if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
            else if (!input.value && idx > 0) inputs[idx - 1].focus();
            if (readCode(inputs).length === 6) onSubmit();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && idx > 0) inputs[idx - 1].focus();
        });
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
            text.split('').forEach((ch, i) => { if (inputs[i]) inputs[i].value = ch; });
            (inputs[Math.min(text.length, 5)] || inputs[5]).focus();
            if (text.length === 6) onSubmit();
        });
    });
}

function readCode(inputs) {
    return inputs.map((i) => i.value).join('');
}

function buildSetPhase(body) {
    body.textContent = '';

    const newWrap = makePasswordField('reset-new-password', 'New password', 'Create a new password');
    const confirmWrap = makePasswordField('reset-confirm-password', 'Confirm new password', 'Re-type new password');
    const hint = document.createElement('p');
    hint.className = 'reset-hint';
    hint.textContent = 'At least 8 characters.';

    body.appendChild(newWrap.group);
    body.appendChild(confirmWrap.group);
    body.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'reset-actions';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'btn btn-primary reset-submit';
    submit.textContent = 'Set Password';
    actions.appendChild(submit);
    body.appendChild(actions);

    submit.addEventListener('click', () => submitSet());

    return { newInput: newWrap.input, confirmInput: confirmWrap.input, hint, submit };
}

function makePasswordField(id, labelText, placeholder) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = labelText;

    const wrap = document.createElement('div');
    wrap.className = 'password-wrap';

    const input = document.createElement('input');
    input.type = 'password';
    input.id = id;
    input.className = 'field';
    input.autocomplete = 'new-password';
    input.placeholder = placeholder;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.setAttribute('aria-label', 'Show password');
    toggle.textContent = 'Show';

    toggle.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Hide' : 'Show';
        toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });

    wrap.appendChild(input);
    wrap.appendChild(toggle);
    group.appendChild(label);
    group.appendChild(wrap);

    return { group, input };
}

// ---------- modal lifecycle ----------

/**
 * Opens password reset modal popup.
 */
function open() {
    // Remove any stale modal, then build a fresh one in the email phase.
    document.querySelectorAll('.reset-backdrop').forEach((b) => { if (b.parentNode) b.parentNode.removeChild(b); });
    const root = buildModalRoot();
    document.body.appendChild(root.backdrop);
    modalState = { root: root.backdrop, phase: 'email', email: '', resetToken: '', controls: null };
    renderPhase();
    // Focus the email input once visible.
    requestAnimationFrame(() => {
        const input = document.getElementById('reset-email');
        if (input) input.focus();
    });
}

/**
 * Renders modal content corresponding to active reset phase.
 */
function renderPhase() {
    const { root } = modalState;
    root.classList.add('is-open');

    const title = root.querySelector('.reset-title');
    const sub = root.querySelector('.reset-sub');
    const body = root.querySelector('.reset-body');
    const error = root.querySelector('.reset-error');

    error.textContent = '';

    if (modalState.phase === 'email') {
        title.textContent = 'Reset your password';
        sub.textContent = 'Enter your account email and we will send a code.';
        modalState.controls = buildEmailPhase(body);
    } else if (modalState.phase === 'code') {
        title.textContent = 'Verify your email';
        sub.textContent = 'Enter the 6-digit code sent to ' + modalState.email;
        modalState.controls = buildCodePhase(body);
    } else {
        title.textContent = 'Set a new password';
        sub.textContent = 'For ' + modalState.email;
        modalState.controls = buildSetPhase(body);
    }
}

/**
 * Closes and cleans up password reset modal.
 * @param {boolean} [showIncompleteAlert=false] - Show warning alert.
 */
function closeResetModal(showIncompleteAlert = false) {
    if (modalState && modalState.root && modalState.root.parentNode) {
        modalState.root.parentNode.removeChild(modalState.root);
    }
    modalState = null;
    if (showIncompleteAlert) {
        showAlert('Password reset incomplete. Request a new code to continue.', true);
    }
}

/**
 * Displays error message inside reset modal.
 * @param {string} message - Error message text.
 */
function setModalError(message) {
    if (modalState && modalState.root) {
        modalState.root.querySelector('.reset-error').textContent = message;
    }
}

/**
 * Sets modal submit button loading/busy status.
 * @param {boolean} busy - Busy state flag.
 */
function setModalBusy(busy) {
    if (!modalState || !modalState.controls) return;
    const c = modalState.controls;
    if (c.submit) setButtonLoading(c.submit, busy, busy ? 'Working\u2026' : (modalState.phase === 'set' ? 'Set Password' : 'Send Reset Code'));
    if (c.resend) c.resend.disabled = busy;
}

// ---------- phase actions ----------

/**
 * Submits phase 1 email request.
 * @async
 * @returns {Promise<void>}
 */
async function submitEmail() {
    const input = document.getElementById('reset-email');
    const hint = document.getElementById('reset-email-hint');

    const email = input.value.trim();
    if (!email) {
        setFieldError(input, hint, 'Email is required.');
        return;
    }
    if (!EMAIL_RE.test(email)) {
        setFieldError(input, hint, 'Enter a valid email address.');
        return;
    }
    clearFieldError(input, hint);

    setModalBusy(true);
    setModalError('');
    try {
        const res = await fetch('api.php?action=request_password_reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (data.success) {
            modalState.email = email;
            modalState.phase = 'code';
            renderPhase();
        } else {
            setModalError(data.message || 'Could not send reset code.');
        }
    } catch (err) {
        setModalError('Network error during reset. Please try again.');
    } finally {
        setModalBusy(false);
    }
}

/**
 * Submits phase 2 6-digit OTP code verification.
 * @async
 * @param {HTMLInputElement[]} inputs - Array of 6 PIN inputs.
 * @returns {Promise<void>}
 */
async function submitCode(inputs) {
    const code = readCode(inputs);
    if (code.length !== 6) return;
    const email = modalState.email;

    setModalBusy(true);
    setModalError('');
    try {
        const res = await fetch('api.php?action=verify_reset_code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
            body: JSON.stringify({ email, code }),
        });
        const data = await res.json();
        if (data.success && data.data && data.data.reset_token) {
            modalState.resetToken = data.data.reset_token;
            modalState.phase = 'set';
            renderPhase();
        } else {
            setModalError(data.message || 'Invalid code.');
        }
    } catch (err) {
        setModalError('Network error verifying code. Please try again.');
    } finally {
        setModalBusy(false);
    }
}

/**
 * Resends password reset OTP code.
 * @async
 * @param {HTMLButtonElement} [resendBtn] - Resend button element.
 * @returns {Promise<void>}
 */
async function resendCode(resendBtn) {
    const email = modalState.email;
    if (resendBtn) resendBtn.disabled = true;
    setModalError('');
    try {
        const res = await fetch('api.php?action=resend_reset_code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (data.success) {
            setModalError('');
        } else if (/start over/i.test(data.message || '')) {
            closeResetModal();
            showAlert(data.message, true);
        } else {
            setModalError(data.message || 'Could not resend code.');
        }
    } catch (err) {
        setModalError('Network error resending code. Please try again.');
    } finally {
        if (resendBtn) resendBtn.disabled = false;
    }
}

/**
 * Submits phase 3 new password update.
 * @async
 * @returns {Promise<void>}
 */
async function submitSet() {
    const newInput = document.getElementById('reset-new-password');
    const confirmInput = document.getElementById('reset-confirm-password');
    const hint = modalState.root.querySelector('.reset-hint');

    let valid = true;

    if (!newInput.value || newInput.value.length < MIN_PASSWORD) {
        setFieldError(newInput, hint, 'Password must be at least 8 characters.');
        valid = false;
    } else {
        clearFieldError(newInput, hint);
        hint.textContent = 'At least 8 characters.';
    }

    if (confirmInput.value !== newInput.value || confirmInput.value === '') {
        confirmInput.classList.add('field-invalid');
        valid = false;
    } else {
        confirmInput.classList.remove('field-invalid');
    }

    if (!valid) return;

    setModalBusy(true);
    setModalError('');
    try {
        const res = await fetch('api.php?action=reset_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
            body: JSON.stringify({
                email: modalState.email,
                reset_token: modalState.resetToken,
                new_password: newInput.value,
            }),
        });
        const data = await res.json();
        if (data.success) {
            closeResetModal();
            showAlert('Password updated! You can now log in.', false);
        } else {
            setModalError(data.message || 'Could not reset password.');
        }
    } catch (err) {
        setModalError('Network error. Please try again.');
    } finally {
        setModalBusy(false);
    }
}

// ---------- narrow public contract ----------

/** @type {{ open: function(): void }} */
window.PemboReset = { open };

// Handle Escape to close.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalState) closeResetModal();
});

})();
