// features/admin/components/tabs/audit.js
// Admin Audit Trail slice (SRP: owns ONLY the audit log explorer + JSON diff
// modal). Renders into host passed to `mount(host)`. Native ESM.

import { get, escapeHtml } from '../../../../assets/core.js';
import { useVersionPoll } from '../../../../assets/useVersionPoll.js';
import { ICONS, friendlyAction, pageMeta, pagerHtml, wirePager, PAGE_SIZE } from '../admin-helpers.js';

let auditTrailLogs = [];
let auditRows = [];
let auditLogsPage = 1;
let pollInstance = null;

/**
 * @param {HTMLElement} host
 */
export function mount(host) {
    host.innerHTML = `
        <section class="admin-card-panel" aria-label="Audit Log Explorer">
            <div class="admin-panel-head">
                <div>
                    <h2 class="admin-panel-title">System Audit Log Trail</h2>
                    <div class="admin-panel-sub">Immutable compliance log of all system state changes and security events.</div>
                </div>
            </div>

            <div class="admin-filter-bar">
                <select id="audit-action-filter" class="form-control" style="width: auto; min-width: 220px;">
                    <option value="">All Logged Actions</option>
                    <option value="LOGIN">Login</option>
                    <option value="REGISTER">Resident Registered</option>
                    <option value="CREATE_STAFF_ACCOUNT">Create Staff Account</option>
                    <option value="ACTIVATE_STAFF_ACCOUNT">Activate Staff Account</option>
                    <option value="DEACTIVATE_STAFF_ACCOUNT">Deactivate Staff Account</option>
                    <option value="CREATE_ASSET">Register Asset</option>
                    <option value="ISSUE_ASSET">Issue Asset</option>
                    <option value="RETURN_ASSET">Return Asset</option>
                    <option value="UPDATE_SYSTEM_SETTINGS">Update System Settings</option>
                    <option value="UPDATE_REQUEST_STATUS">Update Request Status</option>
                    <option value="RECORD_PAYMENT">Record Payment</option>
                </select>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-refresh-audit">Refresh Logs</button>
            </div>

            <div id="audit-table-container" class="admin-table-wrap">
                <div style="padding: 24px; text-align: center; color: var(--admin-muted);">Loading audit logs...</div>
            </div>
        </section>
    `;

    host.querySelector('#btn-refresh-audit').addEventListener('click', () => loadAuditLogs(false));
    const actionFilter = host.querySelector('#audit-action-filter');
    actionFilter.addEventListener('change', () => loadAuditLogs(false));

    loadAuditLogs(false);

    if (pollInstance) {
        pollInstance.stop();
    }
    pollInstance = useVersionPoll({
        url: 'api.php?action=versions',
        onChange: () => loadAuditLogs(true)
    });
}

export async function loadAuditLogs(preservePage = false) {
    const container = document.getElementById('audit-table-container');
    if (!container) return;
    if (!preservePage) {
        auditLogsPage = 1;
    }

    const actionFilter = document.getElementById('audit-action-filter');
    const filterVal = actionFilter ? actionFilter.value : '';

    try {
        const res = await get('list_audit_logs', { limit: 100 });
        if (!res.success || !Array.isArray(res.data.logs)) {
            container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Failed to load audit logs.</div>';
            return;
        }
        auditTrailLogs = res.data.logs;
        auditRows = filterVal ? auditTrailLogs.filter((l) => l.action === filterVal) : auditTrailLogs.slice();
        renderAuditTrailPage();
    } catch (e) {
        console.error('Audit trail load error:', e);
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Error fetching audit trail.</div>';
    }
}

// Keep backward compatibility alias
export const loadAuditTrail = loadAuditLogs;

export function renderAuditTrailPage() {
    const container = document.getElementById('audit-table-container');
    if (!container) return;

    if (auditRows.length === 0) {
        container.innerHTML = '<table class="admin-table"><thead><tr><th>Timestamp</th><th>Action</th><th>Table</th><th>User Email</th><th>IP Address</th></tr></thead><tbody></tbody></table><div style="padding: 24px; text-align: center; color: var(--admin-muted);">No audit log entries match the selected filter.</div>';
        return;
    }

    const meta = pageMeta(auditRows.length, auditLogsPage);
    auditLogsPage = meta.cur;
    const start = (meta.cur - 1) * PAGE_SIZE;
    const slice = auditRows.slice(start, start + PAGE_SIZE);

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr><th>Timestamp</th><th>Action</th><th>Table</th><th>User Email</th><th>IP Address</th></tr>
            </thead>
            <tbody>
                ${slice.map((l) => {
        return `
                        <tr>
                            <td><small>${escapeHtml(l.timestamp)}</small></td>
                            <td>${friendlyAction(l.action)}</td>
                            <td><code>${escapeHtml(l.table_name)}</code></td>
                            <td>${escapeHtml(l.user_email || 'System / Guest')}</td>
                            <td><small>${escapeHtml(l.ip_address)}</small></td>
                        </tr>`;
    }).join('')}
            </tbody>
        </table>
        ${pagerHtml(auditRows.length, meta.cur)}
    `;

    wirePager(container, (next) => {
        auditLogsPage = next;
        renderAuditTrailPage();
    });
}
