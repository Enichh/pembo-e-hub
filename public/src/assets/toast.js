// src/assets/toast.js
// Universal toast/notification primitive (single source of truth). IIFE-scoped;
// exposes window.PemboToast so any slice/path can show a consistent,
// dismissible success/error/info notice without rolling its own or calling alert().
//
// Usage:
//   window.PemboToast.success('Document request submitted.', { title: 'Success', code: 'PEM-123' });
//   window.PemboToast.error('Failed to submit. Please try again.');

/**
 * @typedef {Object} ToastOptions
 * @property {string} [title] - Optional toast header title.
 * @property {string} [code] - Optional reference or tracking code with a copy button.
 */

(function () {
    'use strict';

    /** @type {Record<string, string>} */
    var ICONS = {
        success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
        error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 16.5h.01"/></svg>',
        info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
    };

    /**
     * Escapes HTML entities to prevent XSS.
     * @param {*} value - Value to escape.
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
     * Ensures the toast container element exists in the DOM.
     * @returns {HTMLElement} Toast container element.
     */
    function ensureContainer() {
        var c = document.getElementById('pembo-toast-root');
        if (c) return c;
        c = document.createElement('div');
        c.id = 'pembo-toast-root';
        c.setAttribute('aria-live', 'polite');
        c.setAttribute('aria-atomic', 'false');
        document.body.appendChild(c);
        return c;
    }

    /**
     * Displays a toast notification.
     * @param {'success'|'error'|'info'} type - Toast type.
     * @param {string} message - Toast message text.
     * @param {ToastOptions} [opts] - Toast options.
     */
    function show(type, message, opts) {
        opts = opts || {};
        var container = ensureContainer();

        var toast = document.createElement('div');
        toast.className = 'pembo-toast pembo-toast-' + type;
        toast.setAttribute('role', 'status');

        var icon = '<span class="pembo-toast-icon">' + (ICONS[type] || ICONS.info) + '</span>';
        var body = '<div class="pembo-toast-body">';
        if (opts.title) body += '<div class="pembo-toast-title">' + escapeHtml(opts.title) + '</div>';
        body += '<div class="pembo-toast-msg">' + escapeHtml(message) + '</div>';
        if (opts.code) {
            body += '<div class="pembo-toast-code">'
                + '<span>' + escapeHtml(opts.code) + '</span>'
                + '<button type="button" class="pembo-toast-copy" data-copy="' + escapeHtml(opts.code) + '">Copy</button>'
                + '</div>';
        }
        body += '</div>';

        var closeBtn = '<button type="button" class="pembo-toast-close" aria-label="Dismiss" title="Dismiss">&times;</button>';

        toast.innerHTML = icon + body + closeBtn;
        container.appendChild(toast);

        // Auto-dismiss (errors stay a bit longer).
        var autoMs = type === 'error' ? 6000 : 4500;

        function dismiss() {
            toast.classList.add('pembo-toast-leave');
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 200);
        }

        var timer = setTimeout(dismiss, autoMs);

        toast.querySelector('.pembo-toast-close').addEventListener('click', function () {
            clearTimeout(timer);
            dismiss();
        });

        var copyBtn = toast.querySelector('.pembo-toast-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                var value = copyBtn.getAttribute('data-copy') || '';
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(value).then(function () {
                        copyBtn.textContent = 'Copied!';
                    }).catch(function () {});
                } else {
                    // Fallback for older browsers.
                    var ta = document.createElement('textarea');
                    ta.value = value;
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); copyBtn.textContent = 'Copied!'; } catch (e) {}
                    document.body.removeChild(ta);
                }
            });
        }
    }

    /**
     * @type {{
     *   success: function(string, ToastOptions=): void,
     *   error: function(string, ToastOptions=): void,
     *   info: function(string, ToastOptions=): void
     * }}
     */
    window.PemboToast = {
        success: function (message, opts) { show('success', message, opts); },
        error: function (message, opts) { show('error', message, opts); },
        info: function (message, opts) { show('info', message, opts); },
    };
})();

