// features/admin/components/tabs/audit.js
// Admin Audit Trail slice (SRP: owns ONLY the audit log explorer + JSON diff
// modal). Renders into host passed to `mount(host)`. Native ESM.

import { get, escapeHtml } from '../../../../assets/core.js';
import { ICONS, friendlyAction, pageMeta, pagerHtml, wirePager, PAGE_SIZE } from '../admin-helpers.js';

let auditTrailLogs = [];
let auditRows = [];
let auditLogsPage = 1;

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

    host.querySelector('#btn-refresh-audit').addEventListener('click', loadAuditTrail);
    const actionFilter = host.querySelector('#audit-action-filter');
    actionFilter.addEventListener('change', loadAuditTrail);

    loadAuditTrail();
}

async function loadAuditTrail() {
    const container = document.getElementById('audit-table-container');
    if (!container) return;
    auditLogsPage = 1;

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

function renderAuditTrailPage() {
    const container = document.getElementById('audit-table-container');
    if (!container) return;

    if (auditRows.length === 0) {
        container.innerHTML = '<table class="admin-table"><thead><tr><th>Timestamp</th><th>Action</th><th>Table</th><th>User Email</th><th>IP Address</th><th>Inspect</th></tr></thead><tbody></tbody></table><div style="padding: 24px; text-align: center; color: var(--admin-muted);">No audit log entries match the selected filter.</div>';
        return;
    }

    const meta = pageMeta(auditRows.length, auditLogsPage);
    auditLogsPage = meta.cur;
    const start = (meta.cur - 1) * PAGE_SIZE;
    const slice = auditRows.slice(start, start + PAGE_SIZE);

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr><th>Timestamp</th><th>Action</th><th>Table</th><th>User Email</th><th>IP Address</th><th>Inspect</th></tr>
            </thead>
            <tbody>
                ${slice.map((l, pos) => {
        const globalIdx = start + pos;
        return `
                        <tr>
                            <td><small>${escapeHtml(l.timestamp)}</small></td>
                            <td>${friendlyAction(l.action)}</td>
                            <td><code>${escapeHtml(l.table_name)}</code></td>
                            <td>${escapeHtml(l.user_email || 'System / Guest')}</td>
                            <td><small>${escapeHtml(l.ip_address)}</small></td>
                            <td>
                                <button type="button" class="btn btn-sm btn-secondary" data-inspect-log="${globalIdx}">${ICONS.eye} Diff</button>
                            </td>
                        </tr>`;
    }).join('')}
            </tbody>
        </table>
        ${pagerHtml(auditRows.length, meta.cur)}
    `;

    container.querySelectorAll('[data-inspect-log]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const log = auditRows[Number(btn.getAttribute('data-inspect-log'))];
            if (log) openAuditDiffModal(log);
        });
    });

    wirePager(container, (next) => {
        auditLogsPage = next;
        renderAuditTrailPage();
    });
}

function openAuditDiffModal(log) {
    const modalId = 'admin-diff-modal-root';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-modal-overlay';

    const formatJson = (val) => {
        if (!val) return 'None';
        try {
            return JSON.stringify(typeof val === 'string' ? JSON.parse(val) : val, null, 2);
        } catch (e) {
            return String(val);
        }
    };

    modal.innerHTML = `
        <div class="admin-modal-content modal-lg" role="dialog" aria-modal="true" aria-labelledby="diff-modal-title">
            <div class="admin-modal-head">
                <h3 id="diff-modal-title">Audit Log #${escapeHtml(log.id)} &mdash; ${friendlyAction(log.action)}</h3>
                <button type="button" class="admin-modal-close" aria-label="Close modal">&times;</button>
            </div>
            <div class="admin-modal-body">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 0.88rem;">
                    <div><strong>Timestamp:</strong> ${escapeHtml(log.timestamp)}</div>
                    <div><strong>Action:</strong> ${friendlyAction(log.action)}</div>
                    <div><strong>Table Name:</strong> <code>${escapeHtml(log.table_name)}</code></div>
                    <div><strong>Record ID:</strong> <code>${escapeHtml(log.record_id || 'N/A')}</code></div>
                    <div><strong>User Email:</strong> ${escapeHtml(log.user_email || 'N/A')}</div>
                    <div><strong>IP Address:</strong> ${escapeHtml(log.ip_address)}</div>
                </div>
                <div style="margin-top: 14px;">
                    <label style="font-weight: 700; display: block; margin-bottom: 6px;">Old Values (Pre-State):</label>
                    <div class="admin-json-box">${escapeHtml(formatJson(log.old_values))}</div>
                </div>
                <div style="margin-top: 14px;">
                    <label style="font-weight: 700; display: block; margin-bottom: 6px;">New Values (Post-State):</label>
                    <div class="admin-json-box">${escapeHtml(formatJson(log.new_values))}</div>
                </div>
            </div>
            <div class="admin-modal-foot">
                <button type="button" class="btn btn-secondary btn-close-modal">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.admin-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.btn-close-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}
