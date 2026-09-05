// src/admindashboard.js
// Admin dashboard shell (SRP: wires admin tab modules into a hash-routed SPA
// for the ADMIN role). This is the ONLY entry module for admindashboard.html.
// It imports each vertical-slice tab's `mount` and delegates rendering to
// src/assets/router.js.
//
// Role guard here is UX-only; real RBAC is enforced server-side (unchanged).

import { register, start } from './assets/router.js';
import { mount as mountOverview } from './features/admin/components/tabs/overview.js';
import { mount as mountStaff } from './features/admin/components/tabs/staff.js';
import { mount as mountVerifications } from './features/admin/components/tabs/verifications.js';
import { mount as mountDirectory } from './features/admin/components/tabs/directory.js';
import { mount as mountAudit } from './features/admin/components/tabs/audit.js';
import { mount as mountAssets } from './features/admin/components/tabs/assets.js';
import { mount as mountReports } from './features/admin/components/tabs/reports.js';
import { mount as mountSettings } from './features/admin/components/tabs/settings.js';

/** @type {Record<string,string>} Role → landing dashboard page. */
const HOME = { STAFF: 'staffdashboard.html', ADMIN: 'admindashboard.html', RESIDENT: 'dashboard.html' };

/**
 * Resolve the session user and route accordingly.
 * @param {import('../assets/session.js').UserSession} user
 */
function boot(user) {
    const role = (user && user.role_name ? user.role_name : '').toUpperCase();
    if (role !== 'ADMIN') {
        window.location.href = HOME[role] || 'index.html';
        return;
    }

    window.currentUserRole = role;
    window.currentUser = user;

    register({
        overview: (host) => mountOverview(host),
        staff: (host) => mountStaff(host),
        verifications: (host) => mountVerifications(host),
        directory: (host) => mountDirectory(host),
        audit: (host) => mountAudit(host),
        assets: (host) => mountAssets(host),
        reports: (host) => mountReports(host),
        settings: (host) => mountSettings(host),
    });

    start('overview', 'app-root');
}

window.addEventListener('pembo:session-ready', (e) => {
    if (e.detail) boot(e.detail);
});

window.addEventListener('pembo:session-missing', () => {
    window.location.href = 'index.html';
});
