// features/admin/components/tabs/directory.js
// Admin Resident Directory slice (SRP: owns ONLY the centralized resident
// directory search/view). Renders into host passed to `mount(host)`. Native ESM.

import { get, escapeHtml } from '../../../../assets/core.js';
import { pageMeta, pagerHtml, wirePager, PAGE_SIZE } from '../admin-helpers.js';

let residentDirectoryData = [];
let directoryPage = 1;
let directorySearchQuery = '';

/**
 * @param {HTMLElement} host
 */
export function mount(host) {
    host.innerHTML = `
        <section class="admin-card-panel" aria-label="Resident Directory">
            <div class="admin-panel-head">
                <div>
                    <h2 class="admin-panel-title">Centralized Resident Directory</h2>
                    <div class="admin-panel-sub">Search, view, and inspect constituent profiles and verification statuses.</div>
                </div>
            </div>

            <div class="admin-filter-bar">
                <input type="text" id="directory-search-input" class="form-control admin-search-input" placeholder="Search by resident name, email, or street address...">
            </div>

            <div id="directory-table-container" class="admin-table-wrap">
                <div style="padding: 24px; text-align: center; color: var(--admin-muted);">Loading resident directory...</div>
            </div>
        </section>
    `;

    loadResidentDirectory(host);
}

async function loadResidentDirectory(host) {
    const container = document.getElementById('directory-table-container');
    if (!container) return;

    try {
        const res = await get('list_resident_directory');
        if (!res.success || !Array.isArray(res.data.residents)) {
            container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Failed to load resident directory.</div>';
            return;
        }
        residentDirectoryData = res.data.residents;
        filterAndRenderDirectory('');

        const searchInput = host.querySelector('#directory-search-input');
        searchInput.addEventListener('input', () => {
            directoryPage = 1;
            filterAndRenderDirectory(searchInput.value.trim().toLowerCase());
        });
    } catch (e) {
        console.error('Resident directory load error:', e);
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Error fetching resident directory.</div>';
    }
}

function filterAndRenderDirectory(query, page) {
    directorySearchQuery = query;
    const container = document.getElementById('directory-table-container');
    if (!container) return;

    const filtered = residentDirectoryData.filter((r) => {
        if (!query) return true;
        const text = (r.first_name + ' ' + r.last_name + ' ' + r.email + ' ' + (r.street_address || '')).toLowerCase();
        return text.includes(query);
    });

    if (filtered.length === 0) {
        container.innerHTML = '<table class="admin-table"><thead><tr><th>Resident Name</th><th>Email</th><th>Address</th><th>Birthdate</th><th>Verification Status</th><th>ID Proof</th></tr></thead><tbody></tbody></table><div style="padding: 24px; text-align: center; color: var(--admin-muted);">No matching resident records found.</div>';
        return;
    }

    const meta = pageMeta(filtered.length, page || directoryPage);
    directoryPage = meta.cur;
    const rows = filtered.slice((meta.cur - 1) * PAGE_SIZE, meta.cur * PAGE_SIZE);

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Resident Name</th><th>Email</th><th>Address</th><th>Birthdate</th><th>Verification Status</th><th>ID Proof</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((r) => {
        const status = (r.verification_status || 'PENDING').toUpperCase();
        let badge = '<span class="admin-badge-warn">PENDING</span>';
        if (status === 'VERIFIED') badge = '<span class="admin-badge-active">VERIFIED</span>';
        else if (status === 'REJECTED') badge = '<span class="admin-badge-inactive">REJECTED</span>';
        return `
                        <tr>
                            <td><strong>${escapeHtml(r.first_name)} ${escapeHtml(r.middle_name || '')} ${escapeHtml(r.last_name)} ${escapeHtml(r.suffix || '')}</strong></td>
                            <td>${escapeHtml(r.email)}</td>
                            <td><small>${escapeHtml(r.street_address || 'N/A')}</small></td>
                            <td><small>${escapeHtml(r.birthdate || 'N/A')}</small></td>
                            <td>${badge}</td>
                            <td>
                                ${r.id_document_path
                ? `<a href="api.php?action=serve_resident_id&user_id=${encodeURIComponent(r.user_id)}" target="_blank" class="btn btn-sm btn-secondary">View ID Proof</a>`
                : '<span style="color: var(--admin-muted); font-size: 0.82rem;">None</span>'}
                            </td>
                        </tr>`;
    }).join('')}
            </tbody>
        </table>
        ${pagerHtml(filtered.length, meta.cur)}
    `;

    wirePager(container, (next) => filterAndRenderDirectory(directorySearchQuery, next));
}
