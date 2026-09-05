// src/staffdashboard.js
// Staff dashboard shell (SRP: wires staff queue section modules into a hash-routed
// SPA for the STAFF role). This is the ONLY entry module for staffdashboard.html.
// It imports each vertical-slice section's `mount` and delegates rendering to
// src/assets/router.js.
//
// Role guard here is UX-only; real RBAC is enforced server-side (unchanged).

import { register, start } from './assets/router.js';
import { mount as mountOverview } from './features/dashboard/components/staffdashboard.js';
import { mount as mountDocQueue } from './features/documents/components/queue.js';
import { mount as mountCmpQueue } from './features/complaints/components/queue.js';
import { mount as mountSosQueue } from './features/emergency/components/queue.js';
import { mount as mountAptQueue } from './features/appointments/components/queue.js';
import { mount as mountVerifyQueue } from './features/profile/components/verifyqueue.js';

/** @type {Record<string,string>} Role → landing dashboard page. */
const HOME = { STAFF: 'staffdashboard.html', ADMIN: 'admindashboard.html', RESIDENT: 'dashboard.html' };

/**
 * Resolve the session user and route accordingly.
 * @param {import('../assets/session.js').UserSession} user
 */
function boot(user) {
    const role = (user && user.role_name ? user.role_name : '').toUpperCase();
    if (role !== 'STAFF') {
        window.location.href = HOME[role] || 'index.html';
        return;
    }

    window.currentUserRole = role;
    window.currentUser = user;

    register({
        overview: (host) => mountOverview(host, user),
        documents: (host) => mountDocQueue(host),
        complaints: (host) => mountCmpQueue(host),
        sos: (host) => mountSosQueue(host),
        appointments: (host) => mountAptQueue(host),
        verifications: (host) => mountVerifyQueue(host),
    });

    start('overview', 'app-root');
}

window.addEventListener('pembo:session-ready', (e) => {
    if (e.detail) boot(e.detail);
});

window.addEventListener('pembo:session-missing', () => {
    window.location.href = 'index.html';
});
