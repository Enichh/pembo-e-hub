// src/dashboard.js
// Resident dashboard shell (SRP: wires feature section modules into a hash-routed
// single-page app for the RESIDENT role only). This is the ONLY entry module for
// dashboard.html. It imports each vertical-slice section's `mount` and delegates
// rendering to src/assets/router.js.
//
// Role guard here is UX-only; real RBAC is enforced server-side (unchanged).

import { register, start } from './assets/router.js';
import { mountOverview } from './features/dashboard/components/dashboard.js';
import { mount as mountDocuments } from './features/documents/components/documents.js';
import { mount as mountAppointments } from './features/appointments/components/appointments.js';
import { mount as mountComplaints } from './features/complaints/components/complaints.js';
import { mount as mountEmergency } from './features/emergency/components/emergency.js';
import { mount as mountProfile } from './features/profile/components/profile.js';

/** @type {Record<string,string>} Role → landing dashboard page. */
const HOME = { STAFF: 'staffdashboard.html', ADMIN: 'admindashboard.html', RESIDENT: 'dashboard.html' };

/**
 * Resolve the session user (from session.js bootstrap) and route accordingly.
 * @param {import('../assets/session.js').UserSession} user
 */
function boot(user) {
    const role = (user && user.role_name ? user.role_name : '').toUpperCase();
    if (role !== 'RESIDENT') {
        // Staff/admin land on their own dashboard; unauthenticated → auth page.
        window.location.href = HOME[role] || 'index.html';
        return;
    }

    // Publish session state that the section modules read from window.*.
    window.currentUserRole = role;
    window.currentUser = user;

    register({
        overview: (host) => mountOverview(host, user),
        documents: (host) => mountDocuments(host),
        appointments: (host) => mountAppointments(host),
        complaints: (host) => mountComplaints(host),
        emergency: (host) => mountEmergency(host),
        profile: (host) => mountProfile(host),
    });

    start('overview', 'app-root');
}

// session.js auto-bootstraps and dispatches 'pembo:session-ready' when a session
// exists, or 'pembo:session-missing' when none. boot() also guards the wrong role.
window.addEventListener('pembo:session-ready', (e) => {
    if (e.detail) boot(e.detail);
});

window.addEventListener('pembo:session-missing', () => {
    window.location.href = 'index.html';
});
