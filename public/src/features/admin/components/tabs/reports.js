// features/admin/components/tabs/reports.js
// Admin Statistical Reports slice (SRP: owns ONLY governance analytics +
// CSV export). Renders into host passed to `mount(host)`. Native ESM.

import { get } from '../../../../assets/core.js';

/**
 * @param {HTMLElement} host
 */
export function mount(host) {
    host.innerHTML = `
        <section class="admin-card-panel" aria-label="Statistical Reports">
            <div class="admin-panel-head">
                <div>
                    <h2 class="admin-panel-title">Governance Analytics & Reports</h2>
                    <div class="admin-panel-sub">Generate statistical summaries on requests, appointments, complaints, and resident registries.</div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button type="button" class="btn btn-secondary" id="btn-export-csv">Export CSV Report</button>
                </div>
            </div>

            <div class="admin-filter-bar">
                <label style="font-weight: 700; font-size: 0.88rem;">Timeframe Period:</label>
                <select id="report-period-select" class="form-control" style="width: auto; min-width: 140px;">
                    <option value="daily">Daily Summary</option>
                    <option value="weekly">Weekly Summary</option>
                    <option value="monthly">Monthly Summary</option>
                </select>
            </div>

            <div id="report-content-container">
                <div style="padding: 24px; text-align: center; color: var(--admin-muted);">Generating statistical report...</div>
            </div>
        </section>
    `;

    const periodSelect = host.querySelector('#report-period-select');
    periodSelect.addEventListener('change', () => loadStatisticalReport(periodSelect.value));
    host.querySelector('#btn-export-csv').addEventListener('click', () => {
        window.location.href = `api.php?action=export_report_csv&period=${encodeURIComponent(periodSelect.value)}`;
    });

    loadStatisticalReport('daily');
}

async function loadStatisticalReport(period) {
    const container = document.getElementById('report-content-container');
    if (!container) return;

    try {
        const res = await get('generate_report', { period });
        if (!res.success || !res.data) {
            container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Failed to load report.</div>';
            return;
        }
        const r = res.data;
        container.innerHTML = `
            <div class="admin-report-grid">
                <div class="admin-report-card">
                    <h3 class="admin-report-card-title">Document Requests</h3>
                    <div class="admin-report-stat-row"><span>Total Submitted:</span> <span class="admin-report-stat-val">${r.documents.total}</span></div>
                    <div class="admin-report-stat-row"><span>Pending Review:</span> <span class="admin-report-stat-val" style="color: var(--admin-gold);">${r.documents.pending}</span></div>
                    <div class="admin-report-stat-row"><span>Approved:</span> <span class="admin-report-stat-val" style="color: var(--admin-green);">${r.documents.approved}</span></div>
                    <div class="admin-report-stat-row"><span>Rejected:</span> <span class="admin-report-stat-val" style="color: var(--admin-red);">${r.documents.rejected}</span></div>
                </div>
                <div class="admin-report-card">
                    <h3 class="admin-report-card-title">Service Appointments</h3>
                    <div class="admin-report-stat-row"><span>Total Bookings:</span> <span class="admin-report-stat-val">${r.appointments.total}</span></div>
                    <div class="admin-report-stat-row"><span>Booked:</span> <span class="admin-report-stat-val">${r.appointments.booked}</span></div>
                    <div class="admin-report-stat-row"><span>Confirmed:</span> <span class="admin-report-stat-val" style="color: var(--admin-green);">${r.appointments.confirmed}</span></div>
                    <div class="admin-report-stat-row"><span>Cancelled:</span> <span class="admin-report-stat-val" style="color: var(--admin-red);">${r.appointments.cancelled}</span></div>
                </div>
                <div class="admin-report-card">
                    <h3 class="admin-report-card-title">Incident Complaints</h3>
                    <div class="admin-report-stat-row"><span>Total Incidents:</span> <span class="admin-report-stat-val">${r.complaints.total}</span></div>
                    <div class="admin-report-stat-row"><span>Filed:</span> <span class="admin-report-stat-val">${r.complaints.filed}</span></div>
                    <div class="admin-report-stat-row"><span>Under Investigation:</span> <span class="admin-report-stat-val" style="color: var(--admin-gold);">${r.complaints.under_investigation}</span></div>
                    <div class="admin-report-stat-row"><span>Resolved:</span> <span class="admin-report-stat-val" style="color: var(--admin-green);">${r.complaints.resolved}</span></div>
                </div>
            </div>
            <div class="admin-card-panel" style="margin-top: 16px;">
                <h3 class="admin-panel-title" style="font-size: 1rem;">Constituent Registry Growth</h3>
                <div style="display: flex; gap: 24px; margin-top: 8px;">
                    <div>Total Registered Residents: <strong style="font-size: 1.2rem;">${r.residents.total_registered}</strong></div>
                    <div>New Registrations (${period}): <strong style="font-size: 1.2rem; color: var(--admin-primary);">${r.residents.new_in_period}</strong></div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Report error:', e);
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Error generating report.</div>';
    }
}
