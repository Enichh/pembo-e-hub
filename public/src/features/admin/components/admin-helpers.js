// features/admin/components/admin-helpers.js
// Shared admin-slice helpers (SRP: one source of truth for admin-table paging,
// audit action labels, toast + icons). Native ES module.
//
// Reused by every tab module under features/admin/components/. This is *not* part
// of src/assets/core.js because it is admin-specific (PAGE_SIZE=10, admin-*
// button classes, audit action labels); core.js stays role-agnostic.
// The numeric page-sequence (with ellipsis truncation) is shared: it lives in
// core.js (pageSequence) so staff queues and admin tables truncate identically.

import { escapeHtml, pageSequence } from '../../../assets/core.js';

/** @type {number} Rows per page across every admin table. */
export const PAGE_SIZE = 10;

export const ICONS = {
    staff: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    activeStaff: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',
    residents: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><circle cx="12" cy="8" r="2"/><path d="M9 13a3 3 0 0 1 6 0"/></svg>',
    audit: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="12 8 12 12 14 14"/></svg>',
    userPlus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
};

/**
 * Show a toast (or alert as fallback).
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {string} message
 */
export function toast(type, message) {
    if (window.PemboToast) {
        window.PemboToast[type](message);
    } else {
        // eslint-disable-next-line no-alert
        alert(message);
    }
}

/**
 * Normalize pagination state for a page total.
 * @param {number} total - Number of rows to page through.
 * @param {number} page - Requested (1-based) page.
 * @returns {{cur: number, pages: number, total: number}}
 */
export function pageMeta(total, page) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const cur = Math.min(Math.max(1, page || 1), pages);
    return { cur, pages, total };
}

/**
 * Build a friendly prev/page-numbers/next pagination bar (empty when a single
 * page makes paging unnecessary).
 * @param {number} total - Row total.
 * @param {number} page - Current page.
 * @returns {string} Pager markup or an empty string.
 */
export function pagerHtml(total, page) {
    const { cur, pages } = pageMeta(total, page);
    if (pages <= 1) return '';

    const from = (cur - 1) * PAGE_SIZE + 1;
    const to = Math.min(total, cur * PAGE_SIZE);
    const pageBtn = (n, label, cls, disabled) => {
        const dis = disabled ? ' disabled' : '';
        return '<button type="button" class="admin-page-btn' + (cls ? ' ' + cls : '') + dis + '" data-page="' + n + '" ' + (disabled ? 'aria-disabled="true"' : '') + '>' + (label == null ? n : label) + '</button>';
    };

    // Truncate the numeric sequence the same way staff queues do (pageSequence),
    // collapsing long ranges into an ellipsis gap (null entries).
    const numbers = pageSequence(cur, pages).map((p) => {
        if (p === null) return '<span class="admin-page-dots" aria-hidden="true">&hellip;</span>';
        return pageBtn(p, null, p === cur ? 'is-current' : '', false);
    }).join('');

    return `
        <div class="admin-pager">
            <span class="admin-pager-info">Showing ${from}&ndash;${to} of ${total}</span>
            <div class="admin-pager-btns">
                ${pageBtn(cur - 1, '&lsaquo; Prev', '', cur <= 1)}
                ${numbers}
                ${pageBtn(cur + 1, 'Next &rsaquo;', '', cur >= pages)}
            </div>
        </div>`;
}

/**
 * Bind a rendered pager's buttons to a page navigator.
 * @param {HTMLElement} container - Element that received the pager markup.
 * @param {(nextPage: number) => void} onGo - Callback run with the target page.
 */
export function wirePager(container, onGo) {
    if (!container) return;
    container.querySelectorAll('.admin-page-btn').forEach((btn) => {
        if (btn.disabled || btn.classList.contains('is-current')) return;
        btn.addEventListener('click', () => {
            onGo(Number(btn.getAttribute('data-page')));
        });
    });
}

const ACTION_LABELS = {
    LOGIN: 'Login',
    LOGOUT: 'Logout',
    REGISTER: 'Resident Registered',
    CREATE_STAFF_ACCOUNT: 'Create Staff Account',
    ACTIVATE_STAFF_ACCOUNT: 'Activate Staff Account',
    DEACTIVATE_STAFF_ACCOUNT: 'Deactivate Staff Account',
    CREATE_ASSET: 'Register Asset',
    ISSUE_ASSET: 'Issue Asset',
    RETURN_ASSET: 'Return Asset',
    UPDATE_SYSTEM_SETTINGS: 'Update System Settings',
    UPDATE_REQUEST_STATUS: 'Update Request Status',
    RECORD_PAYMENT: 'Record Payment',
};

/**
 * Friendly label for an audit action code.
 * @param {string|null|undefined} action - Raw action code.
 * @returns {string} Human-friendly action label.
 */
export function friendlyAction(action) {
    const code = String(action || '').toUpperCase();
    if (ACTION_LABELS[code]) return ACTION_LABELS[code];
    return code
        .toLowerCase()
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * Set text content of an element by id.
 * @param {string} id
 * @param {any} value
 */
export function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
}

export { escapeHtml, pageSequence };
