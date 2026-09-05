// src/assets/core.js
// Cross-cutting shared core for the dashboard frontend (ES module).
//
// This is the single source of truth for helpers that were previously
// copy-pasted across workbench.js, admin.js, and the resident slice files.
// It is intentionally dependency-free and browser-native.
//
// Conventions (see REFACTOR_PLAN.md §0):
//   - Full relative paths + .js extension on every import.
//   - No window.* globals are written by this module; it only *reads* the
//     existing session globals (window.pemboCsrfToken, window.currentUserRole)
//     that src/assets/session.js still owns, so ESM can be adopted
//     incrementally without breaking the current bootstrap flow.
//
// Usage:
//   import * as Core from '../assets/core.js';
//   Core.api.get('dashboard_summary').then(...);

/* ------------------------------------------------------------------ *
 * HTML / attribute escaping
 * ------------------------------------------------------------------ */

/**
 * Escape a value for safe insertion into HTML text/body context.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Escape a value for safe insertion into an HTML attribute (single quotes too).
 * @param {*} value
 * @returns {string}
 */
export function escapeAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ *
 * CSRF + API wrapper
 * ------------------------------------------------------------------ */

/**
 * Read the CSRF token from the shared session bootstrap.
 * @returns {string}
 */
export function csrf() {
    return (typeof window !== 'undefined' ? window.pemboCsrfToken : '') || '';
}

/**
 * Thin fetch wrapper with consistent behavior and error shape.
 *
 * @param {string} action - api.php action name.
 * @param {Object} [params] - Query-string params (GET) or JSON body (POST).
 * @param {Object} [opts] - { method, body }.
 * @returns {Promise<any>} Parsed JSON response (the `{ success, data, message, errors }` envelope).
 */
export async function api(action, params, opts) {
    opts = opts || {};
    params = params || {};
    const method = (opts.method || 'GET').toUpperCase();
    const token = csrf();
    const headers = { 'X-CSRF-Token': token };

    // Query-string params on read-like methods, JSON body on write methods.
    // The backend exposes only GET/POST actions (no DELETE/PUT/PATCH), so the
    // wrapper supports GET + POST + (future) PUT/PATCH without dead branches.
    let url = 'api.php?action=' + encodeURIComponent(action);
    const qs = new URLSearchParams(params).toString();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && qs) {
        url += '&' + qs;
    }

    const init = { method, headers };
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(params);
    }

    const res = await fetch(url, init);
    return res.json();
}

/**
 * GET convenience wrapper.
 * @param {string} action
 * @param {Object} [params]
 * @returns {Promise<any>}
 */
export function get(action, params) {
    return api(action, params, { method: 'GET' });
}

/**
 * POST convenience wrapper.
 * @param {string} action
 * @param {Object} [body]
 * @returns {Promise<any>}
 */
export function post(action, body) {
    return api(action, body, { method: 'POST' });
}

/* ------------------------------------------------------------------ *
 * Debounce / throttle
 * ------------------------------------------------------------------ */

/**
 * Debounce a function — run only after a quiet period.
 * @param {Function} fn
 * @param {number} wait - milliseconds.
 * @returns {Function}
 */
export function debounce(fn, wait) {
    let timer = 0;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * Throttle a function — run at most once per interval.
 * @param {Function} fn
 * @param {number} interval - milliseconds.
 * @returns {Function}
 */
export function throttle(fn, interval) {
    let last = 0;
    let timer = 0;
    return function (...args) {
        const now = Date.now();
        const remaining = interval - (now - last);
        if (remaining <= 0) {
            if (timer) { clearTimeout(timer); timer = 0; }
            last = now;
            fn.apply(this, args);
        } else if (!timer) {
            timer = setTimeout(() => {
                last = Date.now();
                timer = 0;
                fn.apply(this, args);
            }, remaining);
        }
    };
}

/* ------------------------------------------------------------------ *
 * Date formatting
 * ------------------------------------------------------------------ */

/**
 * Format a DB datetime (or ISO string) for display.
 * @param {*} value
 * @returns {string}
 */
export function fmtDateTime(value) {
    if (!value) return '—';
    const d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return escapeHtml(String(value));
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a DB date for display.
 * @param {*} value
 * @returns {string}
 */
export function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return escapeHtml(String(value));
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------------ *
 * UI helpers (badges, options, pager)
 * ------------------------------------------------------------------ */

/**
 * Status badge pill.
 * @param {string} bg - background color.
 * @param {string} fg - foreground color.
 * @param {*} label - status label.
 * @returns {string}
 */
export function pill(bg, fg, label) {
    return '<span class="badge" style="background:' + bg + ';color:' + fg + ';">' + escapeHtml(String(label ?? '').replace(/_/g, ' ')) + '</span>';
}

/**
 * Build a set of `<option>` tags.
 * @param {Array<{value:*, label:string}>} list
 * @param {*} [selected]
 * @returns {string}
 */
export function optionTags(list, selected) {
    return list.map((opt) => '<option value="' + escapeHtml(opt.value) + '"'
        + (String(opt.value) === String(selected ?? '') ? ' selected' : '') + '>'
        + escapeHtml(opt.label) + '</option>').join('');
}

/**
 * Compact page-button sequence for the numeric pager (null = ellipsis gap).
 * @param {number} current
 * @param {number} total
 * @returns {Array<number|null>}
 */
export function pageSequence(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const seq = [1];
    if (current - 2 > 2) seq.push(null);
    for (let i = Math.max(2, current - 2); i <= Math.min(total - 1, current + 2); i++) seq.push(i);
    if (current + 2 < total - 1) seq.push(null);
    if (total > 1) seq.push(total);
    return seq;
}

/**
 * Paint a numeric pager into an element and wire clicks to go(page).
 * @param {HTMLElement|null} el
 * @param {number} current
 * @param {number} totalPages
 * @param {(p:number)=>void} go
 */
export function renderPager(el, current, totalPages, go) {
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    const btn = (p, label, cls, disabled) => {
        const dis = disabled ? ' disabled' : '';
        const aria = disabled ? ' aria-disabled="true"' : '';
        return '<button type="button" class="queue-pg-btn ' + cls + '" data-page="' + p + '"' + dis + aria + '>' + escapeHtml(String(label)) + '</button>';
    };
    const pages = pageSequence(current, totalPages).map((n) => {
        if (n === null) return '<span class="queue-pg-dots">…</span>';
        return btn(n, n, (n === current ? 'is-current' : ''));
    }).join('');
    el.innerHTML = btn(current - 1, '‹', 'nav', current <= 1) + pages + btn(current + 1, '›', 'nav', current >= totalPages);
    el.querySelectorAll('[data-page]').forEach((b) => {
        if (b.disabled) return;
        b.addEventListener('click', () => go(Number(b.getAttribute('data-page'))));
    });
}

/**
 * Count gutter label, e.g. "15 shown · 214 total".
 * @param {number} rowCount
 * @param {number|null} total
 * @returns {string}
 */
export function shownLabel(rowCount, total) {
    if (total == null) return '';
    return escapeHtml(String(rowCount)) + ' shown · ' + escapeHtml(String(total)) + ' total';
}

/* ------------------------------------------------------------------ *
 * Status color maps (single source of truth)
 * ------------------------------------------------------------------ */

export const DOC_CLS = {
    PENDING: ['#fef3c7', '#92400e'], VERIFYING: ['#e0e7ff', '#3730a3'], APPROVED: ['#dbeafe', '#1e40af'],
    READY_FOR_PICKUP: ['#dcfce7', '#166534'], COMPLETED: ['#166534', '#fff'], REJECTED: ['#fee2e2', '#991b1b'], CANCELLED: ['#f1f5f9', '#64748b'],
};

export const CMP_CLS = {
    FILED: ['#fff7ed', '#c2410c'], UNDER_INVESTIGATION: ['#eff6ff', '#1d4ed8'], HEARING_SCHEDULED: ['#faf5ff', '#7e22ce'],
    RESOLVED: ['#ecfdf5', '#047857'], DISMISSED: ['#f1f5f9', '#475569'],
};

export const SOS_CLS = {
    TRIGGERED: ['#fee2e2', '#b91c1c'], ACKNOWLEDGED: ['#fff7ed', '#c2410c'], RESPONDERS_DISPATCHED: ['#eff6ff', '#1d4ed8'],
    RESOLVED: ['#ecfdf5', '#047857'], FALSE_ALARM: ['#f1f5f9', '#475569'],
};

export const APT_CLS = {
    BOOKED: ['#fef3c7', '#92400e'], CONFIRMED: ['#dbeafe', '#1e40af'], ATTENDED: ['#dcfce7', '#166534'],
    CANCELLED: ['#fee2e2', '#991b1b'], NO_SHOW: ['#f1f5f9', '#475569'],
};

/* ------------------------------------------------------------------ *
 * Role / session state (interop with session.js only)
 * ------------------------------------------------------------------ */

/** @type {Record<string,string>} Role → landing dashboard page. */
export const HOME = { STAFF: 'staffdashboard.html', ADMIN: 'admindashboard.html', RESIDENT: 'dashboard.html' };

/**
 * Current role name, upper-cased, or '' when unknown.
 * @returns {string} 'ADMIN' | 'STAFF' | 'RESIDENT' | ''
 */
export function roleName() {
    const r = (typeof window !== 'undefined' ? window.currentUserRole : '') || '';
    return String(r).toUpperCase();
}
