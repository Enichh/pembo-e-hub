// features/admin/components/tabs/overview.js
// Admin Overview slice (SRP: owns ONLY the admin metrics banner + summary
// cards). Renders into the host passed to `mount(host)`. Native ES module.

import { get } from '../../../../assets/core.js';
import { ICONS, setValue } from '../admin-helpers.js';

/**
 * @param {HTMLElement} host
 */
export function mount(host) {
    host.innerHTML = `
        <div class="admin-console">
            <section class="admin-banner" aria-label="Admin Banner">
                <div class="admin-banner-inner">
                    <span class="admin-eyebrow">Barangay Pembo Governance</span>
                    <h1>System Administration Console</h1>
                    <p>Manage barangay staff accounts, inspect system audit trails, oversee assets/inventory, view statistical reports, and configure platform settings.</p>
                </div>
            </section>

            <section class="admin-metrics-grid" aria-label="Overview Metrics">
                <div class="admin-metric-card">
                    <span class="admin-metric-icon">${ICONS.staff}</span>
                    <div>
                        <div class="admin-metric-value" id="admin-val-total-staff">0</div>
                        <div class="admin-metric-label">Total Staff</div>
                    </div>
                </div>
                <div class="admin-metric-card">
                    <span class="admin-metric-icon" style="color: var(--admin-green); background: var(--admin-green-bg);">${ICONS.activeStaff}</span>
                    <div>
                        <div class="admin-metric-value" id="admin-val-active-staff">0</div>
                        <div class="admin-metric-label">Active Staff</div>
                    </div>
                </div>
                <div class="admin-metric-card">
                    <span class="admin-metric-icon" style="color: var(--admin-blue); background: var(--admin-blue-bg);">${ICONS.residents}</span>
                    <div>
                        <div class="admin-metric-value" id="admin-val-residents">0</div>
                        <div class="admin-metric-label">Total Residents</div>
                    </div>
                </div>
                <div class="admin-metric-card">
                    <span class="admin-metric-icon" style="color: var(--admin-gold); background: var(--admin-gold-bg);">${ICONS.audit}</span>
                    <div>
                        <div class="admin-metric-value" id="admin-val-audit-logs">0</div>
                        <div class="admin-metric-label">Audit Log Trail</div>
                    </div>
                </div>
            </section>
        </div>
    `;

    loadMetrics();
}

async function loadMetrics() {
    try {
        const res = await get('admin_metrics');
        if (!res.success || !res.data) return;
        const m = res.data;
        setValue('admin-val-total-staff', m.total_staff || 0);
        setValue('admin-val-active-staff', m.active_staff || 0);
        setValue('admin-val-residents', m.total_residents || 0);
        setValue('admin-val-audit-logs', m.total_audit_logs || 0);
    } catch (e) {
        console.error('Admin metrics load error:', e);
    }
}
