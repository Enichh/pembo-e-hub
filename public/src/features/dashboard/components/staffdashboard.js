// features/dashboard/components/staffdashboard.js
// Staff Dashboard Overview slice: singleton overview for STAFF users. Renders a
// Staff Operations Portal summary + queue shortcut cards into a host passed to
// `mount(host, user)`. STAFF only; any other role is redirected by the shell.
//
// Native ES module.

'use strict';

const ICONS = {
        pending: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
        appointments: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        complaints: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></svg>',
        emergency: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10c0-3.9-2.7-7-6-7s-6 3.1-6 7c0 2.1 1 4 2 5.5V20h8v-4.5c1-1.5 2-3.4 2-5.5z"/><circle cx="12" cy="18" r="0.5"/></svg>',
        document: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        appointmentDoc: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        verify: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 16h4"/><circle cx="8" cy="10" r="2"/><polyline points="14 11 16 13 20 9"/></svg>',
    };

    /** @type {Record<string,string>} Role to landing dashboard page. */
    const HOME = { STAFF: 'staffdashboard.html', ADMIN: 'admindashboard.html', RESIDENT: 'dashboard.html' };

    function csrf() { return window.pemboCsrfToken || ''; }

    async function getJson(url) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf() } });
        return res.json();
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    }

    function timeGreeting() {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 18) return 'Good afternoon';
        return 'Good evening';
    }

    function loggedInName(user) {
        return user && (user.first_name || user.name || '') ? String(user.first_name || user.name) : '';
    }

    function render(host, user) {
        const greeting = timeGreeting();
        const name = loggedInName(user);

        host.innerHTML = `
            <div class="dashboard">
                <section class="dash-welcome" aria-label="Welcome">
                    <div class="dash-welcome-inner">
                        <span class="dash-eyebrow">
                            Staff Operations Portal <span class="dash-role-badge role-staff">STAFF</span>
                        </span>
                        <h1>${escapeHtml(greeting)}${name ? ', <span class="dash-welcome-name">' + escapeHtml(name) + '</span>' : ''}.</h1>
                        <p>Real-time barangay operational summary. Review document requests, manage appointments, and respond to complaints and emergency alerts.</p>
                    </div>
                </section>

                <section class="summary-strip" aria-label="Staff Metrics Summary">
                    <a href="#documents" class="summary-card" style="text-decoration: none;">
                        <span class="summary-card-icon" aria-hidden="true">${ICONS.pending}</span>
                        <span class="summary-card-body">
                            <span class="summary-card-value" id="staff-sum-docs">0</span>
                            <span class="summary-card-label">Pending Docs Queue</span>
                        </span>
                    </a>
                    <a href="#verifications" class="summary-card" style="text-decoration: none;">
                        <span class="summary-card-icon" aria-hidden="true">${ICONS.verify}</span>
                        <span class="summary-card-body">
                            <span class="summary-card-value" id="staff-sum-ver">0</span>
                            <span class="summary-card-label">Pending Identity Reviews</span>
                        </span>
                    </a>
                    <a href="#complaints" class="summary-card summary-card-complaints" style="text-decoration: none;">
                        <span class="summary-card-icon" aria-hidden="true">${ICONS.complaints}</span>
                        <span class="summary-card-body">
                            <span class="summary-card-value" id="staff-sum-complaints">0</span>
                            <span class="summary-card-label">Active Complaints</span>
                        </span>
                    </a>
                    <a href="#sos" class="summary-card summary-card-sos" style="text-decoration: none;">
                        <span class="summary-card-icon" aria-hidden="true">${ICONS.emergency}</span>
                        <span class="summary-card-body">
                            <span class="summary-card-value" id="staff-sum-sos">0</span>
                            <span class="summary-card-label">Active Emergency SOS</span>
                        </span>
                    </a>
                </section>

                <section aria-label="Management modules">
                    <div class="dash-section-head">
                        <div>
                            <div class="dash-section-eyebrow">Operational Queues</div>
                            <h3>Management Modules</h3>
                        </div>
                    </div>
                    <div class="quick-actions">
                        <a href="#documents" class="action-card">
                            <span class="action-icon" aria-hidden="true">${ICONS.document}</span>
                            <span class="action-card-body">
                                <span class="action-card-title">Document Requests</span>
                                <span class="action-card-sub">Review, approve, and issue clearances</span>
                            </span>
                            <svg class="action-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </a>
                        <a href="#complaints" class="action-card">
                            <span class="action-icon" aria-hidden="true">${ICONS.complaints}</span>
                            <span class="action-card-body">
                                <span class="action-card-title">Incident Complaints</span>
                                <span class="action-card-sub">Investigate and follow up on reports</span>
                            </span>
                            <svg class="action-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </a>
                        <a href="#verifications" class="action-card">
                            <span class="action-icon" aria-hidden="true">${ICONS.verify}</span>
                            <span class="action-card-body">
                                <span class="action-card-title">Resident Verifications</span>
                                <span class="action-card-sub">Confirm applicant identities and approve accounts</span>
                            </span>
                            <svg class="action-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </a>
                    </div>
                </section>
            </div>
        `;

        loadSummary();
    }

    /**
     * Loads operational summary metrics from dashboard_summary endpoint.
     */
    async function loadSummary() {
        try {
            const res = await getJson('api.php?action=dashboard_summary');
            if (!res.success || !res.data || !res.data.summary) return;
            const s = res.data.summary;
            setValue('staff-sum-docs', s.pending_documents_queue || 0);
            setValue('staff-sum-complaints', s.active_complaints_queue || 0);
            setValue('staff-sum-sos', s.active_emergency_sos || 0);
            setValue('staff-sum-ver', s.pending_verifications || 0);
        } catch (e) {
            console.error('Staff dashboard summary failed to load:', e);
        }
    }

    export function mount(host, user) {
        render(host, user);
    }
