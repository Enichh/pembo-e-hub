// src/features/auth/components/login.js
// Login form wiring for index.html only. SRP: this file owns ONLY the login
// form interaction (tab switching, inline validation, submit). Session
// lifecycle lives in session.js; registration lives in register.js.

(function () {

/**
 * Displays alert message box on authentication forms.
 * @param {string} message - Message string.
 * @param {boolean} [isError=false] - Error status flag.
 */
function showAlert(message, isError = false) {
    const alertBox = document.getElementById('alert-box');
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = 'auth-alert ' + (isError ? 'auth-alert-error' : 'auth-alert-success');
}

/**
 * Clears authentication alert box.
 */
function clearAlert() {
    const alertBox = document.getElementById('alert-box');
    if (alertBox) alertBox.className = 'auth-alert';
}

/**
 * Sets input field error styling and hint message.
 * @param {HTMLInputElement} input - Input element.
 * @param {HTMLElement|null} hint - Hint container element.
 * @param {string} message - Error message text.
 */
function setFieldError(input, hint, message) {
    input.classList.add('field-invalid');
    if (hint) {
        hint.textContent = message;
        hint.classList.add('field-hint-error');
    }
}

/**
 * Clears field error styling and sets optional text.
 * @param {HTMLInputElement} input - Input element.
 * @param {HTMLElement|null} hint - Hint container element.
 * @param {string} [okText=''] - Success message text.
 */
function clearFieldError(input, hint, okText) {
    input.classList.remove('field-invalid');
    if (hint) {
        hint.textContent = okText || '';
        hint.classList.remove('field-hint-error');
    }
}

/**
 * Validates login email non-emptiness.
 * @param {string} email - Email input text.
 * @returns {boolean} True if non-empty.
 */
function validateLoginEmail(email) {
    // Mirrors AuthService, which only checks non-empty on login; but a value
    // that is clearly not an email gets shown as invalid for clearer UX.
    return email.trim().length > 0;
}

/**
 * Switches current authentication form tab view.
 * @param {'login'|'register'} tab - Target tab name.
 */
function switchTab(tab) {
    clearAlert();
    document.querySelectorAll('.auth-tab').forEach((btn) => {
        const active = btn.id === 'tab-' + tab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const loginWrapper = document.getElementById('login-form-wrapper');
    const registerWrapper = document.getElementById('register-form-wrapper');
    const footnote = document.getElementById('auth-footnote');
    if (loginWrapper) loginWrapper.style.display = tab === 'login' ? 'block' : 'none';
    if (registerWrapper) registerWrapper.style.display = tab === 'register' ? 'block' : 'none';
    if (footnote) {
        footnote.textContent = tab === 'login'
            ? 'New here? Switch to Register to create a resident account.'
            : 'Registration is instant and free for residents.';
    }
}

/**
 * Opens password reset modal popup.
 */
function openResetModal() {
    clearAlert();
    if (window.PemboReset && typeof window.PemboReset.open === 'function') {
        window.PemboReset.open();
    }
}

/**
 * Fills login form with quick credentials.
 * @param {string} email - Quick login email.
 * @param {string} pass - Quick login password.
 */
function fillQuickLogin(email, pass) {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    if (emailEl) emailEl.value = email;
    if (passEl) passEl.value = pass;
    switchTab('login');
}

/**
 * Validates login form inputs.
 * @returns {boolean} True if login form inputs pass validation rules.
 */
function validateLoginForm() {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    const emailHint = document.getElementById('login-email-hint');
    const passHint = document.getElementById('login-password-hint');

    let valid = true;

    if (!emailEl.value.trim()) {
        setFieldError(emailEl, emailHint, 'Email is required.');
        valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
        setFieldError(emailEl, emailHint, 'Enter a valid email address.');
        valid = false;
    } else {
        clearFieldError(emailEl, emailHint, '');
    }

    if (!passEl.value) {
        setFieldError(passEl, passHint, 'Password is required.');
        valid = false;
    } else {
        clearFieldError(passEl, passHint, '');
    }

    return valid;
}

/**
 * Main submit event handler for user login.
 * @async
 * @param {Event} e - Submit event object.
 * @returns {Promise<void>}
 */
async function handleLogin(e) {
    e.preventDefault();
    clearAlert();

    if (!validateLoginForm()) return;

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const submitBtn = document.querySelector('#login-form .auth-submit');

    try {
        await window.PemboButton.loading(submitBtn, async () => {
            const res = await fetch('api.php?action=login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': window.PemboSession.getCsrfToken(),
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (data.success) {
                // Route staff/system admins straight to the operations/admin console;
                // everyone else (residents) goes to the resident dashboard.
                const user = data.data || {};
                const role = String(user.role_name || '').toUpperCase();
                if (role === 'ADMIN') window.location.href = 'admindashboard.html';
                else if (role === 'STAFF') window.location.href = 'staffdashboard.html';
                else window.location.href = 'dashboard.html';
            } else {
                showAlert(data.message || 'Login failed.', true);
            }
        }, { loadingLabel: 'Signing in…' });
    } catch (err) {
        showAlert('Network error during login.', true);
    }
}

/**
 * Wires show/hide password toggle buttons across forms.
 */
function wirePasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.getAttribute('data-toggle'));
            if (!input) return;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';

            const eye = btn.querySelector('.icon-eye');
            const eyeOff = btn.querySelector('.icon-eye-off');
            if (eye) eye.style.display = show ? 'none' : '';
            if (eyeOff) eyeOff.style.display = show ? '' : 'none';
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        });
    });
}

/**
 * Wires real-time live input field validation for login form.
 */
function wireLiveValidation() {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    const emailHint = document.getElementById('login-email-hint');
    const passHint = document.getElementById('login-password-hint');

    if (emailEl) {
        emailEl.addEventListener('blur', () => {
            if (!emailEl.value.trim()) return;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
                setFieldError(emailEl, emailHint, 'Enter a valid email address.');
            } else {
                clearFieldError(emailEl, emailHint, '');
            }
        });
        emailEl.addEventListener('input', () => {
            if (emailEl.classList.contains('field-invalid')) {
                clearFieldError(emailEl, emailHint, '');
            }
        });
    }

    if (passEl) {
        passEl.addEventListener('input', () => {
            if (passEl.classList.contains('field-invalid')) {
                clearFieldError(passEl, passHint, '');
            }
        });
    }
}

/**
 * Initializes and wires login form event handlers and tab switches.
 */
function wireLoginForm() {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const loginForm = document.getElementById('login-form');

    if (tabLogin) tabLogin.addEventListener('click', () => switchTab('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => switchTab('register'));
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    wirePasswordToggles();
    wireLiveValidation();

    // Expose only the switchTab helper as a narrow cross-slice contract for
    // register.js (which flips back to the login tab after registering).
    window.switchTab = switchTab;

    // "Forgot password?" link opens the floating reset modal.
    const forgot = document.getElementById('login-forgot');
    if (forgot) forgot.addEventListener('click', openResetModal);
}

document.addEventListener('DOMContentLoaded', () => {
    wireLoginForm();
});

// session.js auto-bootstraps and fires 'pembo:session-ready' if already signed
// in. On the login page, that means redirect to the role-appropriate home.
window.addEventListener('pembo:session-ready', (e) => {
    const role = String(((e && e.detail && e.detail.role_name) || window.currentUserRole || '')).toUpperCase();
    if (role === 'ADMIN') window.location.href = 'admindashboard.html';
    else if (role === 'STAFF') window.location.href = 'staffdashboard.html';
    else window.location.href = 'dashboard.html';
});

})();

