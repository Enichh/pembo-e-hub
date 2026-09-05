// features/profile/components/verifyqueue.js
// Resident Verification queue slice (SRP: owns ONLY the staff resident-identity
// review console). Renders into a host passed to `mount(host)` and wires its own
// events. Shared by Staff and (later) Admin shells.
//
// Native ES module. Extract of the verifications view from the former
// `workbench.js` monolith; now imports shared helpers from src/assets/core.js.

import {
    escapeHtml, get, post, debounce, renderPager, shownLabel, fmtDate, fmtDateTime,
} from '../../../assets/core.js';

let verPage = 1;
let verMeta = null;
const VER_PER_PAGE = 8;

/**
 * Build the fit-to-box valid-ID preview. Images use an <img> with object-fit:contain;
 * PDFs keep an <iframe> so the native viewer can paginate while still fitting width.
 *
 * @param {string} idDocumentPath Relative storage path (e.g. 'storage/resident_ids/id_....pdf').
 * @param {string} userId Target resident UUID.
 * @returns {string} Inline preview markup.
 */
function idDocPreview(idDocumentPath, userId) {
    const src = 'api.php?action=serve_resident_id&user_id=' + encodeURIComponent(userId);
    const ext = (idDocumentPath.split('.').pop() || '').toLowerCase();
    const media = ext === 'pdf'
        ? '<iframe src="' + src + '" class="queue-id-preview" title="Uploaded valid government ID"></iframe>'
        : '<img src="' + src + '" class="queue-id-preview queue-id-preview-img" alt="Uploaded valid government ID">';
    return '<div class="queue-attach"><div><strong>Uploaded valid ID</strong></div>' + media
        + '<a class="btn btn-sm btn-secondary" href="' + src + '" target="_blank" rel="noopener">Open ID Full Size</a></div>';
}

function toast(type, message, opts) {
    if (window.PemboToast) window.PemboToast[type](message, opts);
    else alert(message);
}

function modalFrame(inner) {
    return '<div class="queue-modal-backdrop" data-close-scope="true"><div class="queue-modal" role="dialog" aria-modal="true">' + inner + '</div></div>';
}

function closeModal() {
    const m = document.getElementById('queue-ver-modal');
    if (m) { m.style.display = 'none'; m.innerHTML = ''; }
}

function openModal(backdrop) {
    const outer = document.getElementById('queue-ver-modal');
    if (outer) outer.style.display = ''; // undo any prior inline 'none' so the backdrop can show again
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.style.display = 'flex';
}

async function loadVerRows(page, qs) {
    verPage = page;
    const tb = document.getElementById('queue-ver-tbody'); if (!tb) return;
    const params = { page: verPage, per_page: VER_PER_PAGE, q: (qs || {}).q || '' };
    tb.innerHTML = '<tr><td colspan="5" class="queue-state">Loading pending applicants…</td></tr>';
    document.getElementById('queue-ver-pager').innerHTML = '';
    document.getElementById('queue-ver-count').textContent = '';
    try {
        const d = await get('list_verification_queue', params);
        if (!d.success) { tb.innerHTML = '<tr><td colspan="5" class="queue-state">' + escapeHtml(d.message || 'Failed to load.') + '</td></tr>'; return; }
        const payload = d.data || {};
        const rows = Array.isArray(payload) ? payload : (payload.data || []);
        verMeta = Array.isArray(payload) ? null : (payload.meta || null);
        renderVerTable(rows);
        const after = { q: params.q };
        renderPager(document.getElementById('queue-ver-pager'), verPage, verMeta ? verMeta.total_pages : 1, (p) => loadVerRows(p, after));
        const count = document.getElementById('queue-ver-count');
        if (count && verMeta) count.textContent = shownLabel(rows.length, verMeta.total) + ' pending';
    } catch (e) { tb.innerHTML = '<tr><td colspan="5" class="queue-state">Could not load the verification queue.</td></tr>'; }
}

function renderVerTable(rows) {
    const tb = document.getElementById('queue-ver-tbody'); if (!tb) return;
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" class="queue-state">No resident applications are awaiting your review.</td></tr>'; return; }
    tb.innerHTML = rows.map((r) => {
        const name = [r.first_name, r.middle_name, r.last_name, r.suffix].filter(Boolean).join(' ');
        return '<tr>'
            + '<td><strong>' + escapeHtml(name) + '</strong>' + (r.id_document_path ? '' : ' <span class="queue-id-warn">(no ID uploaded)</span>') + '</td>'
            + '<td>' + escapeHtml(r.email) + '</td>'
            + '<td>' + escapeHtml(r.street_address || '—') + '</td>'
            + '<td>' + fmtDate(r.created_at) + '</td>'
            + '<td><button type="button" class="btn btn-sm btn-secondary" data-action="open-ver" data-id="' + escapeHtml(r.user_id) + '">Review / Verify</button></td>'
            + '</tr>';
    }).join('');
}

async function openVerifyResident(userId) {
    const queue = await get('list_verification_queue', { page: 1, per_page: 200, q: '' });
    const rows = queue.success && queue.data ? ((Array.isArray(queue.data) ? queue.data : queue.data.data) || []) : [];
    const r = rows.find((x) => x.user_id === userId);
    if (!r) { toast('error', 'This application is no longer awaiting review.'); return; }
    const modal = document.getElementById('queue-ver-modal'); if (!modal) return;
    const name = [r.first_name, r.middle_name, r.last_name, r.suffix].filter(Boolean).join(' ');
    const idDoc = r.id_document_path
        ? idDocPreview(r.id_document_path, r.user_id)
        : '<div class="queue-state">No valid ID document uploaded — this applicant will need to re-upload before approval.</div>';
    modal.innerHTML = modalFrame(
        '<div class="queue-modal-head"><div><div class="queue-eyebrow">Resident Verification</div>'
        + '<div class="queue-modal-title">' + escapeHtml(name) + '</div></div>'
        + '<button type="button" class="btn btn-sm btn-secondary" data-close="true">×</button></div>'
        + '<div class="queue-kv" style="margin:12px 0;">'
        + '<span>Email</span><span>' + escapeHtml(r.email) + '</span>'
        + '<span>Gender</span><span>' + escapeHtml(r.gender || '—') + '</span>'
        + '<span>Birthdate</span><span>' + fmtDate(r.birthdate) + '</span>'
        + '<span>Civil status</span><span>' + escapeHtml(r.civil_status || '—') + '</span>'
        + '<span>Address</span><span>' + escapeHtml(r.street_address || '—') + '</span>'
        + '<span>Submitted</span><span>' + fmtDateTime(r.created_at) + '</span>'
        + '</div>'
        + '<h4 class="queue-modal-h">Valid ID proof</h4>' + idDoc
        + '<div class="form-group" style="margin-top:12px;"><label>Reason for rejection</label>'
        + '<input type="text" class="form-control" id="queue-ver-reason" placeholder="Required only if you reject the application"></div>'
        + '<div class="queue-actions" style="margin-top:12px;">'
        + '<button type="button" class="btn btn-sm btn-secondary" data-close="true">Cancel</button>'
        + '<button type="button" class="btn btn-sm btn-danger" data-action="ver-reject" data-id="' + escapeHtml(r.user_id) + '">Reject</button>'
        + '<button type="button" class="btn btn-sm btn-primary" data-action="ver-approve" data-id="' + escapeHtml(r.user_id) + '">Approve Account</button>'
        + '</div>'
    );
    const backdrop = modal.firstElementChild || modal;
    openModal(backdrop);
}

async function commitVerification(userId, status, btn) {
    const reason = status === 'REJECTED' ? ((document.getElementById('queue-ver-reason').value || '').trim()) : null;
    if (status === 'REJECTED' && !reason) { toast('error', 'A rejection reason is required.'); return; }
    try {
        const d = await window.PemboButton.loading(btn, () => post('verify_resident_account', { user_id: userId, status, rejection_reason: reason }), {
            loadingLabel: status === 'VERIFIED' ? 'Approving…' : 'Rejecting…',
        });
        if (d.success) { toast('success', status === 'VERIFIED' ? 'Resident account approved.' : 'Resident application rejected.'); closeModal(); reloadVerQueue(); }
        else toast('error', d.message || 'Could not commit that decision.');
    } catch (e) { toast('error', 'Network error.'); }
}

function reloadVerQueue() {
    const qEl = document.getElementById('queue-ver-q');
    loadVerRows(verPage, { q: qEl ? qEl.value : '' });
}

function wireActions() {
    document.addEventListener('click', function onVerClick(e) {
        // Explicit close buttons, or a click directly on the backdrop itself
        // (not on a child inside the modal), close the modal.
        const explicitClose = e.target.closest('[data-close="true"]');
        if (explicitClose) { closeModal(); return; }
        const backdrop = e.target.closest('[data-close-scope="true"]');
        if (backdrop && backdrop === e.target) { closeModal(); return; }

        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        if (action === 'open-ver') openVerifyResident(id);
        else if (action === 'ver-approve') commitVerification(id, 'VERIFIED', btn);
        else if (action === 'ver-reject') commitVerification(id, 'REJECTED', btn);
        else if (action === 'refresh-ver') go(verPage);
    });
    document.addEventListener('keydown', function onVerEsc(e) {
        if (e.key === 'Escape') closeModal();
    });
}

function go(page) {
    const qEl = document.getElementById('queue-ver-q');
    loadVerRows(page, { q: qEl ? qEl.value : '' });
}

export function mount(host) {
    host.innerHTML = `
        <div class="queue-page-inner">
            <div class="queue-head">
                <div>
                    <span class="queue-eyebrow">Account Verification</span>
                    <h1>Resident Verification</h1>
                    <p class="queue-sub">Review each applicant's uploaded valid ID proof and approve or reject their portal account. Approving activates the resident; rejecting demands a written reason kept on the audit trail.</p>
                </div>
                <span class="queue-role-badge">STAFF</span>
            </div>
            <div class="queue-toolbar">
                <div class="queue-toolbar-left">
                    <div class="queue-search">
                        <span class="queue-search-ico" aria-hidden="true">⌕</span>
                        <input type="text" id="queue-ver-q" class="form-control" placeholder="Search by name, email, or street address">
                    </div>
                    <select id="queue-ver-status" class="form-control queue-filter-select" aria-label="Filter by status">
                        <option value="">Pending only</option>
                    </select>
                </div>
                <div class="queue-toolbar-right">
                    <span class="queue-results" id="queue-ver-count"></span>
                    <button type="button" class="btn btn-secondary" data-action="refresh-ver">↻ Refresh</button>
                </div>
            </div>
            <div class="queue-table-wrap"><table>
                <thead><tr><th>Applicant</th><th>Email</th><th>Address</th><th>Submitted</th><th>Action</th></tr></thead>
                <tbody id="queue-ver-tbody"></tbody>
            </table></div>
            <div class="queue-pager" id="queue-ver-pager"></div>
            <div id="queue-ver-modal"></div>
        </div>
    `;

    const qEl = host.querySelector('#queue-ver-q');
    qEl.addEventListener('input', debounce(() => go(1), 350));
    host.querySelector('[data-action="refresh-ver"]').addEventListener('click', () => go(verPage));
    wireActions();
    go(1);
}
