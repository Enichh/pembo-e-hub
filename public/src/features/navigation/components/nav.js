// features/navigation/components/nav.js
// App navigation: single source of truth for the three role dashboards
// (resident / staff / admin). Desktop renders a fixed left sidebar; mobile
// renders a bottom tab bar (primary destinations) plus a hamburger that opens a
// slide-in drawer (full navigation + sign out). Every entry is a #hash route
// handled by the SPA shell for the current role; there are no separate .html
// pages per screen anymore.
//
// Role resolution is derived from the hosting page's filename, which mirrors
// the shell each dashboard loads (src/dashboard.js, src/staffdashboard.js,
// src/admindashboard.js). This stays in sync with the role even though session
// globals (window.currentUserRole) resolve asynchronously after DOMContentLoaded.

/**
 * @typedef {Object} NavItem
 * @property {string} key - Unique route key (matches the shell's registered route name).
 * @property {string} label - Display label text.
 * @property {string} href - Hash href (#route) resolved from the current page.
 * @property {string} icon - SVG markup string.
 * @property {boolean} primary - Whether item appears in the primary mobile bottom bar.
 */

(function () {

    /** @type {string} */
    const LOGO_SRC = 'src/assets/pembologo.png';

    /** @type {Record<string, string>} */
    const NAV_ICONS = {
        dashboard:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
        documents:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        appointments:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        profile:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        emergency:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10c0-3.9-2.7-7-6-7s-6 3.1-6 7c0 2.1 1 4 2 5.5V20h8v-4.5c1-1.5 2-3.4 2-5.5z"/><circle cx="12" cy="18" r="0.5"/></svg>',
        complaints:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></svg>',
        signout:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
        menu:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
        close:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        staff:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        directory:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
        audit:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
        assets:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>',
        reports:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        settings:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    };

    /**
     * Per-role route map. Keys are the SPA route names registered by each role's
     * shell; the `overview` entry is always the shell's default route, so it is
     * listed first and flagged `primary` so it surfaces in the mobile bottom bar.
     * @type {Record<'RESIDENT'|'STAFF'|'ADMIN', NavItem[]>}
     */
    const DASHBOARD_MODULES = {
        RESIDENT: [
            { key: 'overview', label: 'Dashboard', href: '#overview', icon: NAV_ICONS.dashboard, primary: true },
            { key: 'documents', label: 'Documents', href: '#documents', icon: NAV_ICONS.documents, primary: true },
            { key: 'appointments', label: 'Appointments', href: '#appointments', icon: NAV_ICONS.appointments, primary: true },
            { key: 'complaints', label: 'Complaints', href: '#complaints', icon: NAV_ICONS.complaints, primary: false },
            { key: 'emergency', label: 'Emergency', href: '#emergency', icon: NAV_ICONS.emergency, primary: true },
            { key: 'profile', label: 'Profile', href: '#profile', icon: NAV_ICONS.profile, primary: false },
        ],
        STAFF: [
            { key: 'overview', label: 'Dashboard', href: '#overview', icon: NAV_ICONS.dashboard, primary: true },
            { key: 'documents', label: 'Document Requests', href: '#documents', icon: NAV_ICONS.documents, primary: true },
            { key: 'appointments', label: 'Appointment Schedule', href: '#appointments', icon: NAV_ICONS.appointments, primary: true },
            { key: 'complaints', label: 'Complaints Resolution', href: '#complaints', icon: NAV_ICONS.complaints, primary: true },
            { key: 'sos', label: 'Emergency Dispatch', href: '#sos', icon: NAV_ICONS.emergency, primary: true },
            { key: 'verifications', label: 'Resident Verification', href: '#verifications', icon: NAV_ICONS.staff, primary: true },
        ],
        ADMIN: [
            { key: 'overview', label: 'Dashboard', href: '#overview', icon: NAV_ICONS.dashboard, primary: true },
            { key: 'staff', label: 'Staff Accounts', href: '#staff', icon: NAV_ICONS.staff, primary: true },
            { key: 'verifications', label: 'Verifications', href: '#verifications', icon: NAV_ICONS.staff, primary: true },
            { key: 'directory', label: 'Resident Directory', href: '#directory', icon: NAV_ICONS.directory, primary: true },
            { key: 'audit', label: 'Audit Log Trail', href: '#audit', icon: NAV_ICONS.audit, primary: false },
            { key: 'assets', label: 'Asset Overseer', href: '#assets', icon: NAV_ICONS.assets, primary: false },
            { key: 'reports', label: 'Statistical Reports', href: '#reports', icon: NAV_ICONS.reports, primary: false },
            { key: 'settings', label: 'System Settings', href: '#settings', icon: NAV_ICONS.settings, primary: false },
        ],
    };

    /**
     * Map of dashboard filename → role key. Derived from the hosting page so the
     * nav is correct regardless of when session globals resolve.
     * @type {Record<string, 'RESIDENT'|'STAFF'|'ADMIN'>}
     */
    const DASHBOARD_FILES = {
        'dashboard.html': 'RESIDENT',
        'staffdashboard.html': 'STAFF',
        'admindashboard.html': 'ADMIN',
    };

    /**
     * Returns the current signed-in role name, upper-cased, or '' when unknown.
     * Fails closed: unknown/absent roles see no role dashboard.
     * @returns {string} Role name ('ADMIN' | 'STAFF' | 'RESIDENT') or empty string.
     */
    function roleName() {
        const r = window.currentUserRole || '';
        return String(r).toUpperCase();
    }

    /**
     * Detects which dashboard page is currently hosted, from the filename.
     * @returns {'RESIDENT'|'STAFF'|'ADMIN'|null} Role key, or null outside a dashboard.
     */
    function dashboardKind() {
        const path = window.location.pathname;
        const file = path.substring(path.lastIndexOf('/') + 1).toLowerCase();
        return DASHBOARD_FILES[file] || null;
    }

    /**
     * Returns the landing dashboard page for the current role.
     * @returns {string} Role-appropriate home dashboard file.
     */
    function roleHome() {
        const role = roleName();
        if (role === 'STAFF') return 'staffdashboard.html';
        if (role === 'ADMIN') return 'admindashboard.html';
        return 'dashboard.html';
    }

    /**
     * Resolves the current role's navigation module set. Falls back to the role
     * implied by the hosting page if the session global is not yet resolved.
     * @returns {NavItem[]} Navigation items for the active role dashboard.
     */
    function railItems() {
        const role = roleName();
        if (DASHBOARD_MODULES[role]) return DASHBOARD_MODULES[role];
        const kind = dashboardKind();
        return (kind && DASHBOARD_MODULES[kind]) || [];
    }

    /**
     * The route key currently active, derived from the URL hash. Empty/absent
     * hash (initial load) resolves to the shell default `overview`.
     * @returns {string} Active route key.
     */
    function railActiveKey() {
        const raw = window.location.hash.replace(/^#\/?/, '') || 'overview';
        const items = railItems();
        return items.some((m) => m.key === raw) ? raw : 'overview';
    }

    /**
     * Computes navigation link CSS classes.
     * @param {NavItem} item - Navigation item.
     * @param {string|null} active - Currently active key.
     * @returns {string} CSS class string.
     */
    function linkCls(item, active) {
        return item.key === active ? 'nav-link is-active' : 'nav-link';
    }

    /**
     * Renders links for a list of nav items.
     * @param {NavItem[]} items - Navigation items to render.
     * @param {string|null} active - Currently active key.
     * @returns {string} Anchors HTML markup string.
     */
    function linkList(items, active) {
        return items.map(function (item) {
            return '<a class="' + linkCls(item, active) + '" href="' + item.href + '" data-navkey="' + item.key + '">' + item.icon + '<span>' + item.label + '</span></a>';
        }).join('');
    }

    /**
     * Renders desktop sidebar markup.
     * @returns {string} HTML markup string.
     */
    function renderSidebar() {
        const active = railActiveKey();
        const links = linkList(railItems(), active);

        return `
            <aside class="nav-sidebar" id="nav-sidebar" aria-label="Primary">
                <a class="nav-brand" href="${roleHome()}" aria-label="Pembo e-Hub home">
                <img src="${LOGO_SRC}" alt="Barangay Pembo seal">
                <span class="nav-brand-name">Pembo e-Hub</span>
            </a>
            <nav class="nav-links">${links}</nav>
            <div class="nav-footer">
                <button class="nav-link theme-toggle" type="button" aria-label="Switch theme" data-theme-toggle>
                    <span data-theme-icon aria-hidden="true"></span><span data-theme-label>Dark mode</span>
                </button>
                <a class="nav-link nav-signout" href="index.html" id="nav-signout">
                    ${NAV_ICONS.signout}<span>Sign out</span>
                </a>
            </div>
        </aside>`;
    }

    /**
     * Renders mobile topbar markup.
     * @returns {string} HTML markup string.
     */
    function renderTopbar() {
        return `
            <header class="nav-topbar" id="nav-topbar">
                <a class="nav-brand" href="${roleHome()}" aria-label="Pembo e-Hub home">
                <img src="${LOGO_SRC}" alt="Barangay Pembo seal">
                <span class="nav-brand-name">Pembo e-Hub</span>
            </a>
            <div class="nav-topbar-end">
                <button class="theme-toggle" type="button" aria-label="Switch theme" data-theme-toggle></button>
                <button class="nav-hamburger" id="nav-hamburger" type="button"
                        aria-label="Open menu" aria-expanded="false" aria-controls="nav-drawer">
                    <span class="nav-hamburger-icon">${NAV_ICONS.menu}</span>
                </button>
            </div>
        </header>`;
    }

    /**
     * Renders mobile slide-in drawer markup.
     * @returns {string} HTML markup string.
     */
    function renderDrawer() {
        const active = railActiveKey();
        const links = linkList(railItems(), active);

        return `
            <div class="nav-backdrop" id="nav-backdrop" aria-hidden="true"></div>
            <aside class="nav-drawer" id="nav-drawer" aria-label="Menu">
                <div class="nav-drawer-head">
                    <a class="nav-brand" href="${roleHome()}" aria-label="Pembo e-Hub home">
                    <img src="${LOGO_SRC}" alt="Barangay Pembo seal">
                    <span class="nav-brand-name">Pembo e-Hub</span>
                </a>
                <button class="nav-drawer-close" id="nav-drawer-close" type="button" aria-label="Close menu">${NAV_ICONS.close}</button>
            </div>
            <nav class="nav-links">${links}</nav>
            <a class="nav-link nav-signout" href="index.html" id="nav-drawer-signout">
                ${NAV_ICONS.signout}<span>Sign out</span>
            </a>
        </aside>`;
    }

    /**
     * Renders mobile bottom tab bar markup.
     * @returns {string} HTML markup string.
     */
    function renderBottomBar() {
        const active = railActiveKey();
        const items = railItems()
            .filter((item) => item.primary)
            .map((item) => {
                const cls = item.key === active ? 'nav-bottom-item is-active' : 'nav-bottom-item';
                return '<a class="' + cls + '" href="' + item.href + '" aria-label="' + item.label + '">' + item.icon + '<span>' + item.label + '</span></a>';
            }).join('');

        return '<nav class="nav-bottom" aria-label="Mobile">' + items + '</nav>';
    }

    /**
     * Re-syncs the rail's highlighted module without a full re-render. All three
     * dashboards toggle modules through #hash anchors; re-rendering the whole nav
     * per click would disturb an open drawer, so we move the .is-active class in
     * place (desktop sidebar + mobile drawer both live in .nav-links).
     */
    function syncRailActive() {
        const active = railActiveKey();
        document.querySelectorAll('.nav-links a[data-navkey]').forEach(function (link) {
            link.classList.toggle('is-active', link.getAttribute('data-navkey') === active);
        });
    }

    /**
     * Mounts the navigation elements into #app-nav container.
     */
    function render() {
        const mount = document.getElementById('app-nav');
        if (!mount) return;

        mount.innerHTML = renderSidebar() + renderTopbar() + renderDrawer() + renderBottomBar();
        document.body.classList.add('has-sidebar');
        document.body.classList.add('has-bottom-nav');
        document.body.classList.add('has-topbar');

        wireSignOut(document.getElementById('nav-signout'));
        wireSignOut(document.getElementById('nav-drawer-signout'));
        wireHamburger();

        // Bind the theme toggles the nav just rendered (icons + click handlers).
        if (window.PemboTheme && window.PemboTheme.refresh) {
            window.PemboTheme.refresh();
        }
    }

    /**
     * Wires click handler for sign-out buttons.
     * @param {HTMLElement|null} target - Sign-out button element.
     */
    function wireSignOut(target) {
        if (!target) return;
        target.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await fetch('api.php?action=logout', {
                    method: 'POST',
                    headers: { 'X-CSRF-Token': window.pemboCsrfToken || '' },
                });
            } catch (err) {
                // Even if the request fails, send the user to the auth screen.
            }
            window.location.href = 'index.html';
        });
    }

    /**
     * Wires hamburger menu toggle for mobile drawer.
     */
    function wireHamburger() {
        const btn = document.getElementById('nav-hamburger');
        const drawer = document.getElementById('nav-drawer');
        const backdrop = document.getElementById('nav-backdrop');
        const close = document.getElementById('nav-drawer-close');
        if (!btn || !drawer) return;

        /**
         * @param {boolean} open - Target open state.
         */
        function setOpen(open) {
            document.body.classList.toggle('nav-open', open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
            btn.querySelector('.nav-hamburger-icon').innerHTML = open ? NAV_ICONS.close : NAV_ICONS.menu;
        }

        btn.addEventListener('click', () => {
            const isOpen = document.body.classList.contains('nav-open');
            setOpen(!isOpen);
        });

        if (close) close.addEventListener('click', () => setOpen(false));
        if (backdrop) backdrop.addEventListener('click', () => setOpen(false));

        // Close on Escape.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
                setOpen(false);
            }
        });

        // Close the drawer after any in-drawer link is activated.
        drawer.querySelectorAll('.nav-link').forEach((link) => {
            link.addEventListener('click', () => setOpen(false));
        });
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', render);
        // session.js resolves the current user asynchronously after DOMContentLoaded.
        // Re-render once the role is known so the nav reflects the authenticated
        // role (and fails closed to an empty rail until then).
        window.addEventListener('pembo:session-ready', function (e) {
            if (e && e.detail) {
                window.currentUserRole = e.detail.role_name;
            }
            render();
        });
        // Hash-router dashes toggle modules via #hash anchors; keep the rail
        // highlight in sync as the active route changes.
        window.addEventListener('hashchange', syncRailActive);
    }

})();
