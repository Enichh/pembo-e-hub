// features/admin/components/tabs/staff.js
// Admin Staff Management slice (SRP: owns ONLY staff roster CRUD). Renders
// into the host passed to `mount(host)` and wires its own events. Native ESM.

import { get, post, escapeHtml } from '../../../../assets/core.js';
import { ICONS, toast, pageMeta, pagerHtml, wirePager, PAGE_SIZE } from '../admin-helpers.js';

let staffRoster = [];
let staffPage = 1;
let staffSearchQuery = '';

/**
 * @param {HTMLElement} host
 */
export function mount(host) {
    host.innerHTML = `
        <section class="admin-card-panel" aria-label="Staff Management">
            <div class="admin-panel-head">
                <div>
                    <h2 class="admin-panel-title">Staff Account Roster</h2>
                    <div class="admin-panel-sub">Provision and manage back-office barangay staff credentials.</div>
                </div>
                <button type="button" class="btn btn-primary" id="btn-provision-staff">
                    ${ICONS.userPlus} Provision Staff Account
                </button>
            </div>

            <div class="admin-filter-bar">
                <input type="text" id="staff-search-input" class="form-control admin-search-input" placeholder="Search by name, email, or department...">
            </div>

            <div id="staff-table-container" class="admin-table-wrap">
                <div style="padding: 24px; text-align: center; color: var(--admin-muted);">Loading staff accounts...</div>
            </div>
        </section>
    `;

    host.querySelector('#btn-provision-staff').addEventListener('click', openCreateStaffModal);
    const searchInput = host.querySelector('#staff-search-input');
    searchInput.addEventListener('input', () => {
        staffPage = 1;
        filterAndRenderStaff(searchInput.value.trim().toLowerCase());
    });

    loadStaffRoster();
}

async function loadStaffRoster() {
    const container = document.getElementById('staff-table-container');
    if (!container) return;

    try {
        const res = await get('list_staff_users');
        if (!res.success || !Array.isArray(res.data.staff)) {
            container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Failed to load staff roster.</div>';
            return;
        }
        staffRoster = res.data.staff;
        filterAndRenderStaff(staffSearchQuery);
    } catch (e) {
        console.error('Staff roster load error:', e);
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Error fetching staff roster.</div>';
    }
}

function filterAndRenderStaff(query, page) {
    staffSearchQuery = query;
    const container = document.getElementById('staff-table-container');
    if (!container) return;

    const filtered = staffRoster.filter((s) => {
        if (!query) return true;
        const full = (s.first_name + ' ' + s.last_name + ' ' + s.email + ' ' + s.department + ' ' + s.position).toLowerCase();
        return full.includes(query);
    });

    if (filtered.length === 0) {
        container.innerHTML = '<table class="admin-table"><thead><tr><th>Staff Member</th><th>Department</th><th>Position</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody></tbody></table><div style="padding: 24px; text-align: center; color: var(--admin-muted);">No matching staff accounts found.</div>';
        return;
    }

    const meta = pageMeta(filtered.length, page || staffPage);
    staffPage = meta.cur;
    const rows = filtered.slice((meta.cur - 1) * PAGE_SIZE, meta.cur * PAGE_SIZE);

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Staff Member</th><th>Department</th><th>Position</th><th>Email</th><th>Status</th><th>Action</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((s) => {
        const isActive = Number(s.is_active) === 1;
        const badge = isActive
            ? '<span class="admin-badge-active">Active</span>'
            : '<span class="admin-badge-inactive">Inactive</span>';
        const toggleBtnCls = isActive ? 'btn-secondary' : 'btn-primary';
        const toggleLabel = isActive ? 'Deactivate' : 'Activate';
        return `
                        <tr>
                            <td><strong>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong></td>
                            <td>${escapeHtml(s.department)}</td>
                            <td>${escapeHtml(s.position)}</td>
                            <td>${escapeHtml(s.email)}</td>
                            <td>${badge}</td>
                            <td>
                                <button type="button" class="btn btn-sm ${toggleBtnCls}" data-toggle-staff="${escapeHtml(s.user_id)}" data-active="${isActive ? '0' : '1'}">
                                    ${toggleLabel}
                                </button>
                            </td>
                        </tr>`;
    }).join('')}
            </tbody>
        </table>
        ${pagerHtml(filtered.length, meta.cur)}
    `;

    container.querySelectorAll('[data-toggle-staff]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const staffId = btn.getAttribute('data-toggle-staff');
            const targetActive = btn.getAttribute('data-active') === '1';
            await toggleStaffStatus(staffId, targetActive, btn);
        });
    });

    wirePager(container, (next) => filterAndRenderStaff(staffSearchQuery, next));
}

async function toggleStaffStatus(staffUserId, targetActive, btn) {
    try {
        const res = await window.PemboButton.loading(btn, () => post('toggle_staff_status', { user_id: staffUserId, is_active: targetActive }), {
            loadingLabel: targetActive ? 'Activating…' : 'Deactivating…',
        });
        if (res.success) {
            toast('success', res.message || 'Staff status updated.');
            loadStaffRoster();
        } else {
            toast('error', res.message || 'Failed to update staff status.');
        }
    } catch (e) {
        toast('error', 'Network error updating staff status.');
    }
}

function openCreateStaffModal() {
    const modalId = 'admin-create-staff-modal-root';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-modal-overlay';
    modal.innerHTML = `
        <div class="admin-modal-content" role="dialog" aria-modal="true" aria-labelledby="create-staff-title">
            <div class="admin-modal-head">
                <h3 id="create-staff-title">Provision New Staff Account</h3>
                <button type="button" class="admin-modal-close" aria-label="Close modal">&times;</button>
            </div>
            <form id="form-provision-staff">
                <div class="admin-modal-body">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div class="form-group">
                            <label for="prov-first-name">First Name *</label>
                            <input type="text" id="prov-first-name" class="form-control" required placeholder="e.g. Maria" maxlength="100">
                        </div>
                        <div class="form-group">
                            <label for="prov-last-name">Last Name *</label>
                            <input type="text" id="prov-last-name" class="form-control" required placeholder="e.g. Santos" maxlength="100">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="prov-email">Staff Work Email *</label>
                        <input type="email" id="prov-email" class="form-control" required placeholder="e.g. m.santos@pembo.gov.ph" maxlength="254">
                    </div>
                    <div class="form-group">
                        <label for="prov-password">Initial Password * (min 8 characters)</label>
                        <input type="password" id="prov-password" class="form-control" required minlength="8">
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div class="form-group">
                            <label for="prov-dept">Department *</label>
                            <input type="text" id="prov-dept" class="form-control" required placeholder="e.g. Administrative Services" maxlength="100">
                        </div>
                        <div class="form-group">
                            <label for="prov-position">Position / Title *</label>
                            <input type="text" id="prov-position" class="form-control" required placeholder="e.g. Document Verification Officer" maxlength="100">
                        </div>
                    </div>
                </div>
                <div class="admin-modal-foot">
                    <button type="button" class="btn btn-secondary btn-close-modal">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="btn-submit-provision">Create Account</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.admin-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.btn-close-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    const form = document.getElementById('form-provision-staff');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-provision');

        const firstName = document.getElementById('prov-first-name').value.trim();
        const lastName = document.getElementById('prov-last-name').value.trim();
        const email = document.getElementById('prov-email').value.trim();
        const password = document.getElementById('prov-password').value;
        const department = document.getElementById('prov-dept').value.trim();
        const position = document.getElementById('prov-position').value.trim();

        if (firstName.length > 100 || lastName.length > 100) {
            toast('error', 'First and last name must be 100 characters or fewer.');
            return;
        }
        if (email.length > 254) {
            toast('error', 'Email must be 254 characters or fewer.');
            return;
        }
        if (department.length > 100 || position.length > 100) {
            toast('error', 'Department and position must be 100 characters or fewer.');
            return;
        }

        const payload = {
            first_name: firstName,
            last_name: lastName,
            email: email,
            password: password,
            department: department,
            position: position,
        };

        try {
            const res = await window.PemboButton.loading(btn, () => post('create_staff_user', payload), { loadingLabel: 'Creating…' });
            if (res.success) {
                toast('success', 'Staff account created successfully for ' + payload.email);
                closeModal();
                loadStaffRoster();
            } else {
                toast('error', res.message || 'Failed to create staff account.');
            }
        } catch (err) {
            console.error('Staff creation error:', err);
            toast('error', 'An error occurred while creating staff account.');
        }
    });
}
