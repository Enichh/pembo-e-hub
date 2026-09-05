// src/assets/session.js
// Shared session lifecycle for the whole app (SRP: this file owns ONLY the
// session — CSRF bootstrap, "who am I", and logout). It is imported by the
// login page and by every authenticated page. It does NOT touch form DOM or
// any specific page's markup.
//
// Publishes two events so pages can react without importing session internals:
//   'pembo:session-ready'  — the authenticated user (detail = user object),
//                           fired ONLY when a session exists.
//   'pembo:session-missing' — fired when no session exists, so dashboard shells
//                           can redirect unauthenticated visitors to the login page.

/**
 * @typedef {Object} UserSession
 * @property {string} id - Unique user ID (UUID).
 * @property {string} email - User email address.
 * @property {string} role_name - User role ('ADMIN' | 'STAFF' | 'RESIDENT').
 * @property {number} role_id - User role ID (1, 2, or 3).
 */

/** @type {string} */
let csrfToken = '';

/**
 * Fetches the CSRF token from the backend and attaches it to window.pemboCsrfToken.
 * @async
 * @returns {Promise<void>}
 */
async function fetchCsrfToken() {
    try {
        const res = await fetch('api.php?action=csrf');
        const data = await res.json();
        if (data.success && data.data && data.data.csrf_token) {
            csrfToken = data.data.csrf_token;
            window.pemboCsrfToken = csrfToken;
        }
    } catch (e) {
        console.error('Failed to load CSRF token:', e);
    }
}

/**
 * Gets the current CSRF token.
 * @returns {string} CSRF token string.
 */
function getCsrfToken() {
    return window.pemboCsrfToken || '';
}

/**
 * Retrieves the currently authenticated user's session data.
 * @async
 * @returns {Promise<UserSession|null>} User session object or null if unauthenticated.
 */
async function getCurrentUser() {
    try {
        const res = await fetch('api.php?action=me', { headers: { 'X-CSRF-Token': getCsrfToken() } });
        const data = await res.json();
        return (data.success && data.data) ? data.data : null;
    } catch (e) {
        return null;
    }
}

/**
 * Resolves the authenticated user and announces the session via 'pembo:session-ready'.
 * @async
 * @returns {Promise<UserSession|null>} The authenticated user object or null.
 */
async function bootstrapSession() {
    await fetchCsrfToken();
    const user = await getCurrentUser();
    if (user) {
        window.currentUserRole = user.role_name;
        window.dispatchEvent(new CustomEvent('pembo:session-ready', { detail: user }));
    } else {
        window.dispatchEvent(new CustomEvent('pembo:session-missing'));
    }
    return user;
}

/**
 * Logs out the current user session and clears session state.
 * @async
 * @returns {Promise<void>}
 */
async function logout() {
    try {
        await fetch('api.php?action=logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': getCsrfToken() },
        });
    } catch (e) {
        console.error('Logout failed:', e);
    }
}

// Expose for feature slices / pages that need the session helpers.
window.PemboSession = {
    fetchCsrfToken,
    getCsrfToken,
    getCurrentUser,
    bootstrapSession,
    logout,
};

// Auto-bootstrap on every page that includes this shared file, so slices can
// react to 'pembo:session-ready' without each page wiring its own bootstrap.
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', bootstrapSession);
}

