// features/dashboard/components/dashboard.js
// Resident Dashboard Overview Feature Slice Component (SRP: owns the resident
// overview UI). Renders the Resident Portal overview into a host passed to
// `mountOverview(host, user)`. Staff/Admin are redirected to their own
// dedicated dashboards. Behavior only; presentation in dashboard.css.
//
// Native ES module — the resident dashboard shell imports `mountOverview`.

/**
 * @typedef {Object} UserSession
 * @property {string} id - User UUID.
 * @property {string} email - User email address.
 * @property {string} role_name - Active user role ('RESIDENT', 'STAFF', 'ADMIN').
 */

'use strict';

const STATE_GROUPS = {
        pending: ['PENDING', 'VERIFYING', 'APPROVED'],
        ready: ['READY_FOR_PICKUP'],
        completed: ['COMPLETED'],
    };

    const ICONS = {
        pending: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
        ready: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        appointments: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        completed: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        document: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        appointment: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        emergency: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10c0-3.9-2.7-7-6-7s-6 3.1-6 7c0 2.1 1 4 2 5.5V20h8v-4.5c1-1.5 2-3.4 2-5.5z"/><circle cx="12" cy="18" r="0.5"/></svg>',
        complaints: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></svg>',
    };

    /**
     * Retrieve CSRF token from global session memory.
     * @returns {string} CSRF token.
     */
    function csrf() {
        return window.pemboCsrfToken || '';
    }

    /**
     * Perform HTTP GET request with JSON parsing.
     * @param {string} url - API Endpoint URL.
     * @returns {Promise<any>} Response JSON data.
     */
    async function getJson(url) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf() } });
        return res.json();
    }

    /** @type {Record<string,string>} Role to landing dashboard page. */
    const HOME = { STAFF: 'staffdashboard.html', ADMIN: 'admindashboard.html', RESIDENT: 'dashboard.html' };

    /**
     * Resident Dashboard overview entrypoint. Staff and Admin are redirected
     * to their own dedicated dashboards.
     * @param {HTMLElement} host - Root container element.
     * @param {UserSession} user - Logged in session details.
     */
    function mountOverview(host, user) {
        const role = (user.role_name || '').toUpperCase();
        if (role !== 'RESIDENT') {
            window.currentUserRole = role;
            window.location.href = HOME[role] || 'index.html';
            return;
        }
        window.currentUserRole = role;
        mountResidentDashboard(host, user);
    }

    /**
     * Renders Resident Portal Dashboard.
     * @param {HTMLElement} host - Root container element.
     * @param {UserSession} user - User session.
     */
    function mountResidentDashboard(host, user) {
        const greeting = timeGreeting();
        const name = displayName(user);

        host.innerHTML = `
            <div class="dashboard">
                <section class="dash-welcome" aria-label="Welcome">
                    <div class="dash-welcome-inner">
                        <span class="dash-eyebrow">Resident Portal</span>
                        <h1>${escapeHtml(greeting)}${name ? ', <span class="dash-welcome-name">' + escapeHtml(name) + '</span>' : ''}.</h1>
                        <p>What would you like to do today? Request a document, book a visit, or stay on top of your pending transactions, all in one place.</p>
                    </div>
                </section>

                <section class="summary-strip" id="dash-summary" aria-label="Request summary">
                    <div class="summary-card">
                        <span class="summary-card-icon" aria-hidden="true">${ICONS.pending}</span>
                        <span class="summary-card-body">
                            <span class="summary-card-value" id="sum-pending">0</span>
                            <span class="summary-card-label">Pending</span>
                        </span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-card-icon" aria-hidden="true">${ICONS.ready}</span>
                        <span class="summary-card-body">
                            <span class="summary-card-value" id="sum-ready">0</span>
                            <span class="summary-card-label">Ready for pickup</span>
                        </span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-card-icon" aria-hidden="true">${ICONS.appointments}</span>
                        <span class="summary-card-body">
                            <span class="summary-card-value" id="sum-appointments">0</span>
                            <span class="summary-card-label">Appointments</span>
                        </span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-card-icon" aria-hidden="true">${ICONS.completed}</span>
                        <span class="summary-card-body">
                            <span class="summary-card-value" id="sum-completed">0</span>
                            <span class="summary-card-label">Completed</span>
                        </span>
                    </div>
                </section>

                <section aria-label="Quick actions">
                    <div class="dash-section-head">
                        <div>
                            <div class="dash-section-eyebrow">Quick actions</div>
                            <h3>Get things done</h3>
                        </div>
                    </div>
                    <div class="quick-actions">
                        <a href="#documents" class="action-card">
                            <span class="action-icon" aria-hidden="true">${ICONS.document}</span>
                            <span class="action-card-body">
                                <span class="action-card-title">Request a Document</span>
                                <span class="action-card-sub">Clearance, certificates, and more</span>
                            </span>
                            <svg class="action-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </a>
                        <a href="#appointments" class="action-card">
                            <span class="action-icon" aria-hidden="true">${ICONS.appointments}</span>
                            <span class="action-card-body">
                                <span class="action-card-title">Book an Appointment</span>
                                <span class="action-card-sub">Pick a date and time that works</span>
                            </span>
                            <svg class="action-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </a>
                        <a href="#emergency" class="action-card">
                            <span class="action-icon action-icon-emergency" aria-hidden="true">${ICONS.emergency}</span>
                            <span class="action-card-body">
                                <span class="action-card-title">Emergency SOS</span>
                                <span class="action-card-sub">Get help when you need it</span>
                            </span>
                            <svg class="action-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </a>
                    </div>
                </section>

                <section aria-label="My document requests">
                    <div class="dash-section-head">
                        <div>
                            <div class="dash-section-eyebrow">Documents</div>
                            <h3>My Document Requests</h3>
                        </div>
                        <a href="#documents" class="btn btn-sm btn-secondary">View all</a>
                    </div>
                    <div id="dash-recent-documents" class="record-list" aria-live="polite"></div>
                </section>

                <section aria-label="My appointments">
                    <div class="dash-section-head">
                        <div>
                            <div class="dash-section-eyebrow">Appointments</div>
                            <h3>Upcoming Appointments</h3>
                        </div>
                        <a href="#appointments" class="btn btn-sm btn-secondary">View all</a>
                    </div>
                    <div id="dash-upcoming-appointments" class="record-list" aria-live="polite"></div>
                </section>
            </div>
        `;

        loadResidentSummary();
    }

    /**
     * Time-of-day greeting generator.
     * @returns {string} Greeting text.
     */
    function timeGreeting() {
        const h = new Date().getHours();
        if (h < 5) return 'Good evening';
        if (h < 12) return 'Good morning';
        if (h < 18) return 'Good afternoon';
        return 'Good evening';
    }

    /**
     * Formats display name from email address.
     * @param {UserSession} user - User object.
     * @returns {string} Name string.
     */
    function displayName(user) {
        if (!user || !user.email) return '';
        const local = String(user.email).split('@')[0] || '';
        const parts = local.split(/[._\-]+/).filter(Boolean);
        if (parts.length === 0) return '';
        return parts
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(' ');
    }

    /**
     * Loads summary metrics for resident dashboard.
     */
    async function loadResidentSummary() {
        try {
            const [docRes, apptRes] = await Promise.all([
                getJson('api.php?action=list_requests'),
                getJson('api.php?action=list_appointments'),
            ]);

            const requests = docRes.success ? docRes.data : null;
            const appointments = apptRes.success ? apptRes.data : null;
            if (requests === null || appointments === null) return;

            const count = (list, pred) => list.filter(pred).length;
            const upcoming = appointments.filter((a) => {
                const s = (a.status || '').toUpperCase();
                return s === 'BOOKED' || s === 'CONFIRMED';
            });

            setValue('sum-pending', count(requests, (r) => STATE_GROUPS.pending.includes(r.status)));
            setValue('sum-ready', count(requests, (r) => STATE_GROUPS.ready.includes(r.status)));
            setValue('sum-appointments', upcoming.length);
            setValue('sum-completed', count(requests, (r) => STATE_GROUPS.completed.includes(r.status)));

            renderRecentDocuments(requests.slice(0, 5));
            renderUpcomingAppointments(upcoming.slice(0, 3));
        } catch (e) {
            console.error('Resident summary failed to load:', e);
        }
    }

    /**
     * Render recent documents list for resident view.
     * @param {array} requests - List of document requests.
     */
    function renderRecentDocuments(requests) {
        const host = document.getElementById('dash-recent-documents');
        if (!host) return;
        if (requests.length === 0) {
            host.innerHTML = '<div class="state-box">'
                + '<div class="state-box-icon" aria-hidden="true">' + ICONS.document + '</div>'
                + '<div class="state-box-title">No document requests yet</div>'
                + '<div class="state-box-sub">Request a clearance or certificate to get started.</div></div>';
            return;
        }
        host.innerHTML = requests.map((r) => {
            return '<article class="record-item">'
                + '<span class="record-icon" aria-hidden="true">' + ICONS.document + '</span>'
                + '<div class="record-item-main">'
                + '<div class="record-item-top">'
                + '<span class="record-item-title">' + escapeHtml(r.document_name) + '</span>'
                + '<span class="status-pill status-pill-' + (r.status || '').toLowerCase() + '">' + escapeHtml(r.status) + '</span>'
                + '</div>'
                + '<div class="record-item-meta"><span>' + escapeHtml(r.tracking_number) + '</span><span>' + escapeHtml(r.created_at) + '</span></div>'
                + '</div></article>';
        }).join('');
    }

    /**
     * Render upcoming appointments list for resident view.
     * @param {array} appointments - List of upcoming appointments.
     */
    function renderUpcomingAppointments(appointments) {
        const host = document.getElementById('dash-upcoming-appointments');
        if (!host) return;
        if (appointments.length === 0) {
            host.innerHTML = '<div class="state-box">'
                + '<div class="state-box-icon" aria-hidden="true">' + ICONS.appointment + '</div>'
                + '<div class="state-box-title">No upcoming appointments</div>'
                + '<div class="state-box-sub">Book a visit to see it here.</div></div>';
            return;
        }
        host.innerHTML = appointments.map((a) => {
            return '<article class="record-item">'
                + '<span class="record-icon" aria-hidden="true">' + ICONS.appointment + '</span>'
                + '<div class="record-item-main">'
                + '<div class="record-item-top">'
                + '<span class="record-item-title">' + escapeHtml(a.service_type) + '</span>'
                + '<span class="status-pill status-pill-' + (a.status || '').toLowerCase() + '">' + escapeHtml(a.status) + '</span>'
                + '</div>'
                + '<div class="record-item-meta"><span>' + escapeHtml(a.appointment_date) + '</span><span>' + escapeHtml(a.time_slot) + '</span></div>'
                + '</div></article>';
        }).join('');
    }

    /**
     * Escape HTML helper to prevent XSS.
     * @param {any} value - Value to escape.
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
     * Set text content of an element by ID.
     * @param {string} id - Target element ID.
     * @param {any} value - Text value.
     */
    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    }

    export { mountOverview };

