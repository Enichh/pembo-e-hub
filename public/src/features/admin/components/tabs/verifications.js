// features/admin/components/tabs/verifications.js
// Admin Resident Verification slice (SRP: owns ONLY pending resident account
// verification). Renders into host passed to `mount(host)`. Native ESM.

import { get, post, escapeHtml } from '../../../../assets/core.js';
import { toast, pageMeta, pagerHtml, wirePager, PAGE_SIZE } from '../admin-helpers.js';

let pendingVerifications = [];

/**
 * Build the ID-proof preview that fits its box instead of rendering at native size.
 * Images use an <img> with object-fit:contain; PDFs keep an <iframe> so the native
 * viewer can paginate/zoom while still fitting the frame width.
 *
 * @param {string} idDocumentPath Relative storage path (e.g. 'storage/resident_ids/id_....jpg').
 * @param {string} userId Target resident UUID.
 * @returns {string} Inline preview markup.
 */
function idDocPreview(idDocumentPath, userId) {
    const src = 'api.php?action=serve_resident_id&user_id=' + encodeURIComponent(userId);
    const ext = (idDocumentPath.split('.').pop() || '').toLowerCase();
    const isPdf = ext === 'pdf';
    const media = isPdf
        ? '<iframe src="' + src + '" class="id-doc-frame-inner"></iframe>'
        : '<img src="' + src + '" class="id-doc-frame-inner" alt="Uploaded valid ID document">';
    return '<div class="id-doc-frame">' + media
        + '<div style="margin-top: 8px;">'
        + '<a href="' + src + '" target="_blank" class="btn btn-sm btn-secondary">Open ID Image / PDF in New Tab</a>'
        + '</div></div>';
}
let verificationsPage = 1;

/**
 * @param {HTMLElement} host
 */
export function mount(host) {
    host.innerHTML = `
        <section class="admin-card-panel" aria-label="Resident Verification Queue">
            <div class="admin-panel-head">
                <div>
                    <h2 class="admin-panel-title">Resident Account Verification Queue</h2>
                    <div class="admin-panel-sub">Review uploaded valid ID proof and approve or reject resident portal registration applications.</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-refresh-verifications">Refresh Queue</button>
            </div>

            <div id="verifications-table-container" class="admin-table-wrap">
                <div style="padding: 24px; text-align: center; color: var(--admin-muted);">Loading pending resident applications...</div>
            </div>
        </section>
    `;

    host.querySelector('#btn-refresh-verifications').addEventListener('click', loadPendingVerifications);
    loadPendingVerifications();
}

async function loadPendingVerifications() {
    const container = document.getElementById('verifications-table-container');
    if (!container) return;
    verificationsPage = 1;

    try {
        const res = await get('list_pending_verifications');
        if (!res.success || !res.data || !Array.isArray(res.data.pending)) {
            container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Failed to load pending verifications.</div>';
            return;
        }
        pendingVerifications = res.data.pending;
        renderVerificationsPage();
    } catch (e) {
        console.error('Pending verifications load error:', e);
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Error loading verifications.</div>';
    }
}

function renderVerificationsPage() {
    const container = document.getElementById('verifications-table-container');
    if (!container) return;

    if (pendingVerifications.length === 0) {
        container.innerHTML = '<table class="admin-table"><thead><tr><th>Resident Name</th><th>Email</th><th>Address</th><th>Civil Status</th><th>Submitted Date</th><th>Action</th></tr></thead><tbody></tbody></table><div style="padding: 24px; text-align: center; color: var(--admin-muted);">No pending resident account applications at this time.</div>';
        return;
    }

    const meta = pageMeta(pendingVerifications.length, verificationsPage);
    verificationsPage = meta.cur;
    const rows = pendingVerifications.slice((meta.cur - 1) * PAGE_SIZE, meta.cur * PAGE_SIZE);

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Resident Name</th><th>Email</th><th>Address</th><th>Civil Status</th><th>Submitted Date</th><th>Action</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((r) => `
                        <tr>
                            <td><strong>${escapeHtml(r.first_name)} ${escapeHtml(r.middle_name || '')} ${escapeHtml(r.last_name)} ${escapeHtml(r.suffix || '')}</strong></td>
                            <td>${escapeHtml(r.email)}</td>
                            <td><small>${escapeHtml(r.street_address)}</small></td>
                            <td>${escapeHtml(r.civil_status || 'N/A')}</td>
                            <td><small>${escapeHtml(r.created_at || 'N/A')}</small></td>
                            <td>
                                <button type="button" class="btn btn-sm btn-primary" data-inspect-resident="${escapeHtml(r.id)}">
                                    Review ID & Verify
                                </button>
                            </td>
                        </tr>
                    `).join('')}
            </tbody>
        </table>
        ${pagerHtml(pendingVerifications.length, meta.cur)}
    `;

    container.querySelectorAll('[data-inspect-resident]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-inspect-resident');
            const item = pendingVerifications.find((p) => p.id === id);
            if (item) openInspectResidentModal(item);
        });
    });

    wirePager(container, (next) => {
        verificationsPage = next;
        renderVerificationsPage();
    });
}

function openInspectResidentModal(resident) {
    const modalId = 'admin-inspect-resident-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-modal-overlay';
    modal.innerHTML = `
        <div class="admin-modal-content modal-lg" role="dialog" aria-modal="true">
            <div class="admin-modal-head">
                <h3>Review Resident Application: ${escapeHtml(resident.first_name)} ${escapeHtml(resident.last_name)}</h3>
                <button type="button" class="admin-modal-close">&times;</button>
            </div>
            <div class="admin-modal-body">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; font-size: 0.9rem;">
                    <div><strong>Full Name:</strong> ${escapeHtml(resident.first_name)} ${escapeHtml(resident.middle_name || '')} ${escapeHtml(resident.last_name)} ${escapeHtml(resident.suffix || '')}</div>
                    <div><strong>Email:</strong> ${escapeHtml(resident.email)}</div>
                    <div><strong>Gender:</strong> ${escapeHtml(resident.gender || 'N/A')}</div>
                    <div><strong>Birthdate:</strong> ${escapeHtml(resident.birthdate || 'N/A')}</div>
                    <div><strong>Civil Status:</strong> ${escapeHtml(resident.civil_status || 'N/A')}</div>
                    <div><strong>Address:</strong> ${escapeHtml(resident.street_address || 'N/A')}</div>
                </div>

                <div style="margin-top: 14px;">
                    <label style="font-weight: 700; display: block; margin-bottom: 8px;">Uploaded Valid ID Document Proof (Pembo Address):</label>
                    ${resident.id_document_path ? idDocPreview(resident.id_document_path, resident.user_id) : `<div class="no-id-note">No Valid ID document uploaded.</div>`}
                </div>

                <div id="reject-reason-wrap" style="display: none; margin-top: 16px;">
                    <label style="font-weight: 700; color: var(--admin-red);">Reason for Rejection *</label>
                    <textarea id="inspect-reject-reason" class="form-control" rows="2" placeholder="e.g. Invalid address proof or unreadable ID image"></textarea>
                </div>
            </div>
            <div class="admin-modal-foot">
                <button type="button" class="btn btn-secondary btn-close-modal">Cancel</button>
                <button type="button" class="btn btn-danger" id="btn-toggle-reject-form">Reject Application</button>
                <button type="button" class="btn btn-success" id="btn-approve-resident" style="background-color: var(--admin-green, #2e7d32); color: white; border: none;">Approve Account</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.admin-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.btn-close-modal').addEventListener('click', closeModal);

    const btnReject = modal.querySelector('#btn-toggle-reject-form');
    const btnApprove = modal.querySelector('#btn-approve-resident');
    const rejectWrap = modal.querySelector('#reject-reason-wrap');
    const rejectInput = modal.querySelector('#inspect-reject-reason');

    let isConfirmingReject = false;

    btnReject.addEventListener('click', async () => {
        if (!isConfirmingReject) {
            rejectWrap.style.display = 'block';
            btnReject.textContent = 'Confirm Rejection';
            isConfirmingReject = true;
            return;
        }
        const reason = rejectInput.value.trim();
        if (!reason) {
            toast('error', 'Please provide a reason for rejecting the application.');
            return;
        }
        try {
            const res = await window.PemboButton.loading(btnReject, () => post('verify_resident_account', {
                user_id: resident.user_id,
                status: 'REJECTED',
                rejection_reason: reason,
            }), { loadingLabel: 'Rejecting…' });
            if (res.success) {
                toast('success', 'Resident application rejected.');
                closeModal();
                loadPendingVerifications();
            } else {
                toast('error', res.message || 'Failed to reject account.');
            }
        } catch (err) {
            toast('error', 'Network error rejecting account.');
        }
    });

    btnApprove.addEventListener('click', async () => {
        try {
            const res = await window.PemboButton.loading(btnApprove, () => post('verify_resident_account', {
                user_id: resident.user_id,
                status: 'VERIFIED',
            }), { loadingLabel: 'Approving…' });
            if (res.success) {
                toast('success', 'Resident account verified and approved!');
                closeModal();
                loadPendingVerifications();
            } else {
                toast('error', res.message || 'Failed to approve account.');
            }
        } catch (err) {
            toast('error', 'Network error approving account.');
        }
    });
}
