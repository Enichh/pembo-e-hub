// src/assets/router.js
// Minimal hash-based SPA router (ES module) for the three role dashboards.
//
// Each dashboard entry module registers hash routes → mount functions and
// calls start(defaultRoute). The router reads the URL hash, routes to the
// matching mount, and re-routes on `hashchange` without a page reload.
//
// Role guarding here is for UX only; real authorization is enforced
// server-side by the controllers (unchanged). See REFACTOR_PLAN.md §4.
//
// Usage (inside a dashboard entry module):
//   import { register, start } from '../assets/router.js';
//   register({ overview: overviewMount, documents: documentsMount });
//   start('overview');

import { escapeHtml } from './core.js';

/** @type {Record<string, Function>} route name → mount(host) function. */
const routes = {};

/** @type {string} */
let defaultRoute = '';

/** @type {HTMLElement|null} */
let mountEl = null;

/**
 * Normalize a raw hash into a route name.
 * @param {string} raw - window.location.hash (e.g. '#documents').
 * @returns {string} Route name without leading '#/' or '#'.
 */
function nameFromHash(raw) {
    return String(raw || '').replace(/^#\/?/, '');
}

/**
 * Register route mount functions.
 * @param {Record<string, Function>} map - { routeName: mount(host) }.
 */
export function register(map) {
    Object.assign(routes, map);
}

/**
 * Resolve the active route name, falling back to defaultRoute.
 * @returns {string}
 */
function activeRoute() {
    const name = nameFromHash(window.location.hash);
    return routes[name] ? name : defaultRoute;
}

/**
 * Run the current route's mount against the mount element.
 */
function render() {
    if (!mountEl) return;
    const name = activeRoute();
    const mount = routes[name];
    if (!mount) {
        mountEl.innerHTML = '<div class="state-box">Unknown section.</div>';
        return;
    }

    // Prevent template-injection via a crafted hash: only known route names
    // reach innerHTML, and route names are developer-authored identifiers.
    try {
        mount(mountEl);
    } catch (err) {
        console.error(`[router] mount failed for "${name}":`, err);
        mountEl.innerHTML = '<div class="state-box">Something went wrong rendering this section.</div>';
    }
}

/**
 * Start the router: attach to the mount element and route on hash changes.
 * @param {string} defaultName - Route to show when the hash is empty/unknown.
 * @param {string} [mountId] - Element id to render into (default 'app-root').
 */
export function start(defaultName, mountId) {
    defaultRoute = defaultName;
    mountEl = document.getElementById(mountId || 'app-root');

    if (!mountEl) {
        console.error('[router] mount element not found; cannot start.');
        return;
    }

    window.removeEventListener('hashchange', render);
    window.addEventListener('hashchange', render);
    render();
}

/**
 * Programmatically navigate to a route (updates the hash, triggers render).
 * @param {string} name - Route name.
 */
export function navigate(name) {
    if (window.location.hash === '#' + name) {
        render();
        return;
    }
    window.location.hash = '#' + name;
}

/**
 * Render an access-denied view (used by shells when a role is unauthorized).
 * @param {HTMLElement} host
 * @param {string} [message]
 */
export function renderAccessDenied(host, message) {
    message = message || 'You do not have permission to access this area.';
    host.innerHTML = ''
        + '<div class="state-box" style="padding: 40px 20px;">'
        + '<div class="state-box-title" style="font-size: 1.2rem;">Access Restricted</div>'
        + '<div class="state-box-sub">' + escapeHtml(message) + '</div>'
        + '</div>';
}
