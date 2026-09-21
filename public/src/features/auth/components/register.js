// src/features/auth/components/register.js
// Register form wiring for index.html only. SRP: this file owns ONLY the
// register form interaction (inline validation, submit). Session lifecycle
// lives in session.js; the login form (and its shared switchTab helper) lives
// in login.js.

/**
 * @typedef {Object} RegistrationPayload
 * @property {string} first_name - Resident first name.
 * @property {string} middle_name - Resident middle name (optional).
 * @property {string} last_name - Resident last name.
 * @property {string} suffix - Name suffix (optional).
 * @property {string} email - Account email address.
 * @property {string} password - Account password.
 * @property {string} gender - Gender ('Male' | 'Female' | 'Other').
 * @property {string} birthdate - Birthdate in YYYY-MM-DD format.
 * @property {string} civil_status - Civil status.
 * @property {string} street_address - Complete Pembo street address.
 */

(function () {

/** @type {RegExp} */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** @type {number} */
const MIN_PASSWORD = 8;
/** @type {number} */
const MAX_ID_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Displays global auth alert message.
 * @param {string} message - Message text.
 * @param {boolean} [isError=false] - Error flag.
 */
function showAlert(message, isError = false) {
    const alertBox = document.getElementById('alert-box');
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = 'auth-alert ' + (isError ? 'auth-alert-error' : 'auth-alert-success');
}

/**
 * Clears global auth alert box.
 */
function clearAlert() {
    const alertBox = document.getElementById('alert-box');
    if (alertBox) alertBox.className = 'auth-alert';
}

/**
 * Sets inline field error.
 * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} input - Target input element.
 * @param {HTMLElement|null} hintEl - Field hint element.
 * @param {string} message - Error message text.
 */
function setFieldError(input, hintEl, message) {
    input.classList.add('field-invalid');
    if (hintEl) {
        hintEl.textContent = message;
        hintEl.classList.add('field-hint-error');
    }
}

/**
 * Clears inline field error.
 * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} input - Target input element.
 * @param {HTMLElement|null} hintEl - Field hint element.
 * @param {string} [okText=''] - Optional success text.
 */
function clearFieldError(input, hintEl, okText) {
    input.classList.remove('field-invalid');
    if (hintEl) {
        hintEl.textContent = okText || '';
        hintEl.classList.remove('field-hint-error');
    }
}

/**
 * Switches current authentication tab.
 * @param {'login'|'register'} tab - Target tab name.
 */
function switchTab(tab) {
    if (window.switchTab) window.switchTab(tab);
}

/**
 * Updates password rule visual validation indicators.
 * @param {string} password - Password string.
 */
function updatePasswordRules(password) {
    const lengthEl = document.querySelector('#reg-password-hint [data-rule="length"]');
    if (!lengthEl) return;
    lengthEl.classList.toggle('rule-ok', password.length >= MIN_PASSWORD);
}

/**
 * Renders birthdate calendar picker via PemboBirthdateCalendar.
 */
function renderBirthdateCalendar() {
    if (window.PemboBirthdateCalendar) {
        window.PemboBirthdateCalendar.mount({
            mountId: 'reg-birthdate-calendar',
            hiddenInputId: 'reg-birthdate',
            hintId: 'reg-birthdate-hint',
        });
    }
}

/**
 * Validates field character length limits.
 * @param {HTMLInputElement|HTMLTextAreaElement} input - Target input element.
 * @param {HTMLElement|null} hintEl - Field hint element.
 * @param {number} max - Maximum character length.
 * @param {string} label - Field display label.
 * @returns {boolean} True if length is within limits.
 */
function checkLength(input, hintEl, max, label) {
    if (input && input.value && input.value.length > max) {
        setFieldError(input, hintEl, `${label} must be ${max} characters or fewer.`);
        return false;
    }
    return true;
}

/**
 * Validates full registration form input values.
 * @returns {boolean} True if all inputs pass validation rules.
 */
function validateRegisterForm() {
    const f = (id) => document.getElementById(id);
    const first = f('reg-first-name');
    const middle = f('reg-middle-name');
    const last = f('reg-last-name');
    const suffix = f('reg-suffix');
    const email = f('reg-email');
    const pass = f('reg-password');
    const confirm = f('reg-confirm-password');
    const birthdate = f('reg-birthdate');
    const civil = f('reg-civil-status');
    const address = f('reg-street-address');

    const firstHint = f('reg-first-name-hint');
    const lastHint = f('reg-last-name-hint');
    const emailHint = f('reg-email-hint');
    const confirmHint = f('reg-confirm-password-hint');
    const genderHint = f('reg-gender-hint');
    const birthdateHint = f('reg-birthdate-hint');
    const civilHint = f('reg-civil-status-hint');
    const addressHint = f('reg-street-address-hint');

    let valid = true;

    if (!first.value.trim()) {
        setFieldError(first, firstHint, 'First name is required.');
        valid = false;
    } else if (!checkLength(first, firstHint, 100, 'First name')) {
        valid = false;
    } else {
        clearFieldError(first, firstHint);
    }

    if (middle && middle.value.trim() && !checkLength(middle, null, 100, 'Middle name')) {
        valid = false;
    }

    if (!last.value.trim()) {
        setFieldError(last, lastHint, 'Last name is required.');
        valid = false;
    } else if (!checkLength(last, lastHint, 100, 'Last name')) {
        valid = false;
    } else {
        clearFieldError(last, lastHint);
    }

    if (suffix && suffix.value.trim() && !checkLength(suffix, null, 20, 'Suffix')) {
        valid = false;
    }

    if (!email.value.trim() || !EMAIL_RE.test(email.value.trim())) {
        setFieldError(email, emailHint, 'Valid email address is required.');
        valid = false;
    } else if (!checkLength(email, emailHint, 254, 'Email address')) {
        valid = false;
    } else {
        clearFieldError(email, emailHint);
    }

    if (pass.value.length < MIN_PASSWORD) {
        setFieldError(pass, null, 'Password must be at least 8 characters.');
        valid = false;
    }

    if (confirm.value !== pass.value) {
        setFieldError(confirm, confirmHint, 'Passwords must match.');
        valid = false;
    }

    const genderChecked = document.querySelector('input[name="reg-gender"]:checked');
    if (!genderChecked) {
        if (genderHint) {
            genderHint.textContent = 'Please select a gender.';
            genderHint.classList.add('field-hint-error');
        }
        valid = false;
    }

    if (window.PemboBirthdateCalendar) {
        const err = window.PemboBirthdateCalendar.validateError('reg-birthdate-calendar');
        if (err) {
            if (birthdateHint) {
                birthdateHint.textContent = err;
                birthdateHint.classList.add('field-hint-error');
            }
            valid = false;
        }
    }

    if (!civil.value) {
        setFieldError(civil, civilHint, 'Please select your civil status.');
        valid = false;
    } else {
        clearFieldError(civil, civilHint);
    }

    if (!address.value.trim()) {
        setFieldError(address, addressHint, 'Complete address is required.');
        valid = false;
    } else if (!checkLength(address, addressHint, 500, 'Complete address')) {
        valid = false;
    } else {
        clearFieldError(address, addressHint);
    }

    // Valid ID proof is required; mirror the backend 5 MB cap for quicker UX.
    const agreeInput = document.getElementById('reg-agree');
    const agreeHint = document.getElementById('reg-agree-hint');
    if (!agreeInput || !agreeInput.checked) {
        if (agreeInput) agreeInput.classList.add('field-invalid');
        if (agreeHint) {
            agreeHint.textContent = 'You must agree to the Data Privacy Act (R.A. 10173) consent to continue.';
            agreeHint.classList.add('field-hint-error');
        }
        valid = false;
    } else {
        if (agreeInput) agreeInput.classList.remove('field-invalid');
        if (agreeHint) {
            agreeHint.textContent = '';
            agreeHint.classList.remove('field-hint-error');
        }
    }

    const validIdInput = document.getElementById('reg-valid-id');
    const validIdHint = document.getElementById('reg-valid-id-hint');
    const validIdDrop = document.getElementById('reg-dropzone');
    const file = validIdInput && validIdInput.files.length ? validIdInput.files[0] : null;
    if (!file) {
        if (validIdInput) validIdInput.classList.add('field-invalid');
        if (validIdDrop) validIdDrop.classList.add('is-error');
        if (validIdHint) {
            validIdHint.textContent = 'Please upload a valid ID showing your Pembo address.';
            validIdHint.classList.add('field-hint-error');
        }
        valid = false;
    } else if (file.size > MAX_ID_SIZE) {
        if (validIdInput) validIdInput.classList.add('field-invalid');
        if (validIdDrop) validIdDrop.classList.add('is-error');
        if (validIdHint) {
            validIdHint.textContent = 'Valid ID file must not exceed 5MB.';
            validIdHint.classList.add('field-hint-error');
        }
        valid = false;
    } else {
        if (validIdInput) validIdInput.classList.remove('field-invalid');
        if (validIdDrop) validIdDrop.classList.remove('is-error');
        if (validIdHint) validIdHint.classList.remove('field-hint-error');
    }

    return valid;
}

/**
 * Builds the multipart body and submits the registration request.
 * @param {string} email - Registered email address.
 * @returns {FormData} Populated FormData body.
 */
function buildPayload(email) {
    const f = (id) => document.getElementById(id);
    const gender = document.querySelector('input[name="reg-gender"]:checked');
    const agree = document.getElementById('reg-agree');

    const fd = new FormData();
    fd.append('agree', agree && agree.checked ? '1' : '0');
    fd.append('first_name', f('reg-first-name').value.trim());
    fd.append('middle_name', (f('reg-middle-name').value || '').trim());
    fd.append('last_name', f('reg-last-name').value.trim());
    fd.append('suffix', (f('reg-suffix').value || '').trim());
    fd.append('email', email);
    fd.append('password', f('reg-password').value);
    fd.append('gender', gender ? gender.value : '');
    fd.append('birthdate', f('reg-birthdate').value);
    fd.append('civil_status', f('reg-civil-status').value);
    fd.append('street_address', f('reg-street-address').value.trim());

    const validId = f('reg-valid-id');
    if (validId && validId.files.length) {
        fd.append('valid_id', validId.files[0], validId.files[0].name);
    }
    return fd;
}

/**
 * Main submit handler for the register form.
 * @async
 * @param {Event} e - Submit event object.
 * @returns {Promise<void>}
 */
async function handleRegister(e) {
    e.preventDefault();
    clearAlert();

    if (!validateRegisterForm()) return;

    const emailEl = document.getElementById('reg-email');
    const email = emailEl.value.trim();

    // Confirmation step so the resident is not blind about what happens next.
    const confirmed = await window.PemboButton.confirm({
        title: 'Confirm registration',
        message: 'We will send a 6-digit verification code to ' + email + '. Continue?',
        confirmText: 'Create Account',
        cancelText: 'Go Back',
    });
    if (!confirmed) return;

    const submitBtn = document.querySelector('#register-form .auth-submit');

    try {
        await window.PemboButton.loading(submitBtn, async () => {
            const body = buildPayload(email);
            const res = await fetch('api.php?action=register', {
                method: 'POST',
                headers: { 'X-CSRF-Token': window.PemboSession.getCsrfToken() },
                body: body,
            });
            const data = await res.json();
            if (data.success) {
                openVerificationModal(email);
            } else {
                showAlert(data.message || 'Registration failed. Please try again.', true);
            }
        }, { loadingLabel: 'Creating account\u2026' });
    } catch (err) {
        showAlert('Network error during registration. Please try again.', true);
    }
}

/** @type {string|null} */
let validIdPreviewUrl = null;

const ICONS = {
    file: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

/**
 * Formats a byte count into a human-readable string.
 * @param {number} bytes - Byte count.
 * @returns {string} Formatted size (e.g. "1.2 MB").
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Escapes HTML-sensitive characters.
 * @param {string} value - Untrusted string.
 * @returns {string} Escaped string.
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Sets or clears the valid-ID error state on the dropzone + hint.
 * @param {string} [message=''] - Error message, or empty to clear.
 */
function setIdError(message) {
    const hint = document.getElementById('reg-valid-id-hint');
    const drop = document.getElementById('reg-dropzone');
    if (hint) {
        hint.textContent = message || 'Upload a clear photo or PDF of a government ID showing your Pembo address (Max 5MB).';
        hint.classList.toggle('field-hint-error', !!message);
    }
    if (drop) drop.classList.toggle('is-error', !!message);
}

/**
 * Renders (or clears) the selected file preview card.
 * @param {File|null} file - Selected file, or null to clear.
 */
function renderIdPreview(file) {
    const wrap = document.getElementById('reg-valid-id-preview');
    if (!wrap) return;
    if (!file) { wrap.innerHTML = ''; return; }

    if (validIdPreviewUrl) {
        URL.revokeObjectURL(validIdPreviewUrl);
        validIdPreviewUrl = null;
    }

    const isImage = file.type === 'image/jpeg' || file.type === 'image/png';
    const thumb = isImage
        ? '<img class="reg-preview-thumb" alt="Uploaded preview">'
        : '<div class="reg-preview-thumb is-pdf">' + ICONS.file + '</div>';

    wrap.innerHTML = `
        <div class="reg-preview">
            ${thumb}
            <div class="reg-preview-meta">
                <div class="reg-preview-name">${escapeHtml(file.name)}</div>
                <div class="reg-preview-size">${escapeHtml(formatFileSize(file.size))}</div>
                <span class="reg-preview-ok">${ICONS.check} Ready to upload</span>
            </div>
            <button type="button" class="reg-remove" aria-label="Remove file">${ICONS.close}</button>
        </div>
    `;

    if (isImage) {
        validIdPreviewUrl = URL.createObjectURL(file);
        const img = wrap.querySelector('.reg-preview-thumb');
        if (img) img.src = validIdPreviewUrl;
    }

    wrap.querySelector('.reg-remove').addEventListener('click', () => {
        if (validIdPreviewUrl) { URL.revokeObjectURL(validIdPreviewUrl); validIdPreviewUrl = null; }
        const input = document.getElementById('reg-valid-id');
        if (input) input.value = '';
        renderIdPreview(null);
        setIdError('');
    });
}

/**
 * Validates and previews a selected/dropped file, mirroring the backend rules.
 * @param {File} file - Candidate file.
 */
function handleIdFileSelect(file) {
    const okType = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'application/pdf';
    if (!okType) {
        renderIdPreview(null);
        setIdError('Unsupported file type. Please upload a JPG, PNG, or PDF.');
        return;
    }
    if (file.size > MAX_ID_SIZE) {
        renderIdPreview(null);
        setIdError('File is too large. Maximum size is 5 MB.');
        return;
    }
    renderIdPreview(file);
    setIdError('');
}

/**
 * Wires the valid-ID dropzone (click, drag & drop, keyboard) and preview.
 */
function wireValidIdDropzone() {
    const dropzone = document.getElementById('reg-dropzone');
    const fileInput = document.getElementById('reg-valid-id');

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) handleIdFileSelect(fileInput.files[0]);
        });
    }

    if (dropzone) {
        ['dragenter', 'dragover'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropzone.classList.add('is-dragover');
        }));
        ['dragleave', 'drop'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropzone.classList.remove('is-dragover');
        }));
        dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files[0] && fileInput) {
                const dt = new DataTransfer();
                dt.items.add(files[0]);
                fileInput.files = dt.files;
                handleIdFileSelect(files[0]);
            }
        });
        dropzone.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && fileInput) { e.preventDefault(); fileInput.click(); }
        });
    }
}

/**
 * Opens 6-digit OTP verification modal workflow.
 * @param {string} email - Registration email address.
 */
function openVerificationModal(email) {
    if (!window.PemboVerification) {
        showAlert('Verification is unavailable. Please refresh and try again.', true);
        return;
    }

    window.PemboVerification.open({
        email,
        onSubmit: async (code, done) => {
            try {
                const res = await fetch('api.php?action=verify_code', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': window.PemboSession.getCsrfToken(),
                    },
                    body: JSON.stringify({ email, code }),
                });
                const data = await res.json();
                if (data.success) {
                    if (window.PemboVerification.setStatus) {
                        window.PemboVerification.setStatus('Account created!', 'success');
                    }
                    done(null);
                    setTimeout(() => {
                        window.PemboVerification.close();
                        showAlert('Account created! You can now log in.', false);
                        const form = document.getElementById('register-form');
                        if (form) form.reset();
                        updatePasswordRules('');
                        switchTab('login');
                    }, 900);
                } else {
                    done(data.message || 'Invalid code.');
                }
            } catch (err) {
                done('Network error verifying code. Please try again.');
            }
        },
        onResend: async (done) => {
            try {
                const res = await fetch('api.php?action=resend_code', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': window.PemboSession.getCsrfToken(),
                    },
                    body: JSON.stringify({ email }),
                });
                const data = await res.json();
                if (data.success) {
                    done(null);
                } else if (/register again/i.test(data.message || '')) {
                    window.PemboVerification.close();
                    showAlert(data.message, true);
                } else {
                    done(data.message || 'Could not resend code.');
                }
            } catch (err) {
                done('Network error resending code. Please try again.');
            }
        },
        onCancel: () => {
            showAlert('Registration incomplete. Request a new code to continue.', true);
        },
    });
}

/**
 * Wires real-time field validation event listeners.
 */
function wireLiveValidation() {
    const f = (id) => document.getElementById(id);

    // Re-validate matching password + clear errors on input.
    const pass = f('reg-password');
    const confirm = f('reg-confirm-password');
    const confirmHint = f('reg-confirm-password-hint');

    if (pass) {
        pass.addEventListener('input', () => {
            updatePasswordRules(pass.value);
            if (pass.classList.contains('field-invalid') && pass.value.length >= MIN_PASSWORD) {
                pass.classList.remove('field-invalid');
            }
            if (confirm && confirm.value !== '' && confirm.value !== pass.value) {
                setFieldError(confirm, confirmHint, 'Passwords must match.');
            } else if (confirm && confirm.value !== '') {
                clearFieldError(confirm, confirmHint, 'Passwords match.');
            }
        });
    }

    if (confirm) {
        confirm.addEventListener('input', () => {
            if (confirm.value !== pass.value) {
                setFieldError(confirm, confirmHint, 'Passwords must match.');
            } else if (confirm.value !== '') {
                clearFieldError(confirm, confirmHint, 'Passwords match.');
            } else {
                clearFieldError(confirm, confirmHint);
            }
        });
    }

    // Live-clear text field errors as the user types.
    [['reg-first-name', 'reg-first-name-hint'],
     ['reg-last-name', 'reg-last-name-hint'],
     ['reg-email', 'reg-email-hint'],
     ['reg-street-address', 'reg-street-address-hint']].forEach(([inputId, hintId]) => {
        const el = f(inputId);
        const hint = f(hintId);
        if (el) el.addEventListener('input', () => {
            if (el.classList.contains('field-invalid')) clearFieldError(el, hint);
        });
    });

    // Clear consent error when the checkbox is checked.
    const agree = f('reg-agree');
    if (agree) {
        agree.addEventListener('change', () => {
            const hint = f('reg-agree-hint');
            if (agree.checked) {
                agree.classList.remove('field-invalid');
                if (hint) {
                    hint.textContent = '';
                    hint.classList.remove('field-hint-error');
                }
            }
        });
    }

    // Clear gender error on selection.
    document.querySelectorAll('input[name="reg-gender"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            const hint = f('reg-gender-hint');
            if (hint) {
                hint.textContent = '';
                hint.classList.remove('field-hint-error');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('register-form');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    wireLiveValidation();
    wireValidIdDropzone();
    renderBirthdateCalendar();

    if (window.PemboInputValidator) {
        ['reg-first-name', 'reg-middle-name', 'reg-last-name'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) window.PemboInputValidator.attachNameFilter(el);
        });
    }
});

})();
