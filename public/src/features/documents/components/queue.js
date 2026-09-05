// features/documents/components/queue.js
// Documents staff queue slice (SRP: owns ONLY the staff document-processing
// console). Renders into a host passed to `mount(host)` and wires its own
// events. It does not depend on any host page's markup.
//
// Native ES module. Extract of the documents view from the former `workbench.js`
// monolith; now imports shared helpers from src/assets/core.js.

import {
    escapeHtml, get, post, pill, optionTags, debounce, pageSequence, renderPager,
    shownLabel, fmtDateTime, DOC_CLS,
} from '../../../assets/core.js';

let docPage = 1;
const DOC_PER_PAGE = 15;
let docMeta = null;
let docRows = [];

const DOC_STATUS_OPTS = ['PENDING', 'VERIFYING', 'APPROVED', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED', 'CANCELLED'];

function toast(type, message, opts) {
    if (window.PemboToast) window.PemboToast[type](message, opts);
    else alert(message);
}

function modalFrame(inner) {
    return '<div class="queue-modal-backdrop" data-close-scope="true"><div class="queue-modal" role="dialog" aria-modal="true">' + inner + '</div></div>';
}

function closeModal() {
    const m = document.getElementById('queue-doc-modal');
    if (m) { m.style.display = 'none'; m.innerHTML = ''; }
}

function openModal(backdrop) {
    const outer = document.getElementById('queue-doc-modal');
    if (outer) outer.style.display = ''; // undo any prior inline 'none' so the backdrop can show again
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.style.display = 'flex';
}

async function loadDocRows(page, qs) {
    docPage = page;
    const tb = document.getElementById('queue-doc-tbody'); if (!tb) return;
    const params = {
        page: docPage, per_page: DOC_PER_PAGE,
        q: (qs || {}).q || '', status: (qs || {}).status || '', payment: (qs || {}).payment || '',
    };
    tb.innerHTML = '<tr><td colspan="6" class="queue-state">Loading document requests…</td></tr>';
    document.getElementById('queue-doc-pager').innerHTML = '';
    document.getElementById('queue-doc-count').textContent = '';
    try {
        const d = await get('list_requests', params);
        if (!d.success) { tb.innerHTML = '<tr><td colspan="6" class="queue-state">' + escapeHtml(d.message || 'Failed to load.') + '</td></tr>'; return; }
        const payload = d.data || {};
        docRows = Array.isArray(payload) ? payload : (payload.data || []);
        docMeta = Array.isArray(payload) ? null : (payload.meta || null);
        renderDocTable();
        const after = { q: params.q, status: params.status, payment: params.payment };
        renderPager(document.getElementById('queue-doc-pager'), docPage, docMeta ? docMeta.total_pages : 1, (p) => loadDocRows(p, after));
        const count = document.getElementById('queue-doc-count');
        if (count && docMeta) count.textContent = shownLabel(docRows.length, docMeta.total);
    } catch (e) {
        tb.innerHTML = '<tr><td colspan="6" class="queue-state">Could not load requests.</td></tr>';
    }
}

function renderDocTable() {
    const tb = document.getElementById('queue-doc-tbody'); if (!tb) return;
    if (!docRows.length) { tb.innerHTML = '<tr><td colspan="6" class="queue-state">No document requests match your filters.</td></tr>'; return; }
    tb.innerHTML = docRows.map((r) => {
        const [sb, sf] = DOC_CLS[r.status] || ['#f1f5f9', '#475569'];
        const pay = r.payment_status === 'PAID'
            ? pill('#dcfce7', '#166534', 'PAID · ' + (r.official_receipt_number || ''))
            : pill('#fee2e2', '#991b1b', 'UNPAID');
        return '<tr>'
            + '<td><strong>' + escapeHtml(r.tracking_number) + '</strong></td>'
            + '<td>' + escapeHtml(r.document_name) + '</td>'
            + '<td>' + escapeHtml(r.resident_email) + '</td>'
            + '<td>' + pill(sb, sf, r.status) + '</td>'
            + '<td>' + pay + '</td>'
            + '<td><button type="button" class="btn btn-sm btn-secondary" data-action="open-doc" data-id="' + escapeHtml(r.id) + '">Review / Process</button></td>'
            + '</tr>';
    }).join('');
}

async function openDoc(id) {
    const modal = document.getElementById('queue-doc-modal'); if (!modal) return;
    try {
        const d = await get('get_request', { id });
        if (!d.success) { toast('error', d.message || 'Not found.'); return; }
        const r = d.data || {};
        const atts = (r.attachments || []).map((a) => {
            const src = 'api.php?action=serve_attachment&id=' + encodeURIComponent(a.id);
            const kb = (Number(a.file_size_bytes || 0) / 1024).toFixed(1) + ' KB';
            const isImg = a.mime_type === 'image/jpeg' || a.mime_type === 'image/png';
            return '<div class="queue-attach"><div><strong>' + escapeHtml(a.file_name) + '</strong> <span class="queue-log-muted">(' + kb + ')</span></div>'
                + (isImg ? '<img src="' + src + '" alt="" loading="lazy">'
                    : '<a class="btn btn-sm btn-secondary" href="' + src + '" target="_blank" rel="noopener">Open / Download</a>') + '</div>';
        }).join('') || '<div class="queue-state">No files uploaded.</div>';
        const hist = (r.status_history || []).map((h) =>
            '<div class="queue-log-item"><span class="queue-log-dot"></span><div><strong>' + escapeHtml(h.new_status || '') + '</strong>'
            + ' <span class="queue-log-muted">' + fmtDateTime(h.created_at) + ' · ' + escapeHtml(h.changed_by_role || 'System') + '</span>'
            + (h.remarks ? '<div class="queue-log-muted">' + escapeHtml(h.remarks) + '</div>' : '') + '</div></div>'
        ).join('') || '<div class="queue-state">No activity yet.</div>';

        modal.innerHTML = modalFrame(
            '<div class="queue-modal-head"><div><div class="queue-eyebrow">Document Request</div>'
            + '<div class="queue-modal-title">' + escapeHtml(r.tracking_number) + ' — ' + escapeHtml(r.document_name) + '</div></div>'
            + '<button type="button" class="btn btn-sm btn-secondary" data-close="true">×</button></div>'
            + '<div class="queue-kv" style="margin:12px 0;">'
            + '<span>Purpose</span><span>' + escapeHtml(r.purpose || '—') + '</span>'
            + '<span>Constituent</span><span>' + escapeHtml(r.resident_email || '—') + '</span>'
            + '<span>Requested</span><span>' + fmtDateTime(r.created_at) + '</span>'
            + '<span>Base fee</span><span>₱' + Number(r.base_fee || 0).toFixed(2) + '</span>'
            + '<span>Payment</span><span>' + (r.payment_status === 'PAID' ? pill('#dcfce7', '#166534', 'PAID · ' + (r.official_receipt_number || '')) : pill('#fee2e2', '#991b1b', 'UNPAID')) + '</span>'
            + '</div>'
            + '<h4 class="queue-modal-h">Attachments</h4>' + atts
            + '<h4 class="queue-modal-h">Status history</h4><div class="queue-log">' + hist + '</div>'
            + '<h4 class="queue-modal-h">Processing</h4>'
            + '<div class="queue-actions"><div class="form-group"><label>Set status</label>'
            + '<select class="form-control" id="queue-doc-status-modal"><option value="VERIFYING">Mark VERIFYING</option>'
            + '<option value="APPROVED">Mark APPROVED</option><option value="READY_FOR_PICKUP">Mark READY FOR PICKUP</option>'
            + '<option value="COMPLETED">Mark COMPLETED</option><option value="REJECTED">Mark REJECTED</option></select></div>'
            + '<div class="form-group" style="flex:2 1 300px;"><label>Remarks / rejection reason</label>'
            + '<input type="text" class="form-control" id="queue-doc-remarks" placeholder="Optional"></div>'
            + '<button type="button" class="btn btn-sm btn-primary" data-action="doc-status" data-id="' + escapeHtml(r.id) + '">Save status</button></div>'
            + '<div class="queue-actions" style="margin-top:10px;">'
            + '<div class="form-group"><label>Official receipt (OR) # (auto)</label><input type="text" class="form-control" id="queue-doc-or" value="Auto-generated on save" disabled></div>'
            + '<div class="form-group"><label>Amount paid (₱)</label><input type="number" class="form-control" id="queue-doc-amount" step="0.01" placeholder="0.00"></div>'
            + '<button type="button" class="btn btn-sm btn-primary" data-action="doc-pay" data-id="' + escapeHtml(r.id) + '">Record payment</button></div>'
        );
        const backdrop = modal.firstElementChild || modal;
        openModal(backdrop);
    } catch (e) { toast('error', 'Could not load request details.'); }
}

async function updateDocStatus(id, btn) {
    const status = document.getElementById('queue-doc-status-modal').value;
    const remarks = (document.getElementById('queue-doc-remarks').value || '').trim();
    try {
        const d = await window.PemboButton.loading(btn, () => post('update_request_status', {
            request_id: id, status,
            remarks: remarks || (status === 'REJECTED' ? 'Rejected by staff.' : null),
            rejection_reason: status === 'REJECTED' ? (remarks || 'Rejected by staff.') : null,
        }), { loadingLabel: 'Saving…' });
        if (d.success) { toast('success', 'Status saved.'); closeModal(); reloadDocQueue(); }
        else toast('error', d.message || 'Update failed.');
    } catch (e) { toast('error', 'Network error.'); }
}

async function recordDocPayment(id, btn) {
    const amt = document.getElementById('queue-doc-amount').value;
    if (amt === '') { toast('error', 'Enter the amount paid.'); return; }
    try {
        const d = await window.PemboButton.loading(btn, () => post('record_payment', {
            request_id: id, official_receipt_number: '', amount_paid: Number(amt),
            remarks: 'Over-the-counter payment (staff)',
        }), { loadingLabel: 'Recording…' });
        if (d.success) {
            const or = d.data && d.data.official_receipt_number;
            toast('success', or ? ('Payment recorded — receipt ' + or + '.') : 'Payment recorded.');
            closeModal(); reloadDocQueue();
        }
        else toast('error', d.message || 'Could not record payment.');
    } catch (e) { toast('error', 'Network error.'); }
}

function reloadDocQueue() {
    const qEl = document.getElementById('queue-doc-q');
    const sEl = document.getElementById('queue-doc-status');
    const pEl = document.getElementById('queue-doc-pay');
    loadDocRows(docPage, { q: qEl ? qEl.value : '', status: sEl ? sEl.value : '', payment: pEl ? pEl.value : '' });
}

/* ---- action delegation (scoped to this queue) ---- */
function wireActions() {
    document.addEventListener('click', function onDocClick(e) {
        const close = e.target.closest('[data-close="true"], [data-close-scope="true"]');
        if (close) {
            if (close.hasAttribute('data-close') || close === e.target) closeModal();
            if (close.hasAttribute('data-close')) return;
        }
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        if (action === 'open-doc') openDoc(id);
        else if (action === 'refresh-docs') go(docPage);
        else if (action === 'doc-status') updateDocStatus(id, btn);
        else if (action === 'doc-pay') recordDocPayment(id, btn);
    });
    document.addEventListener('keydown', function onDocEsc(e) {
        if (e.key === 'Escape') closeModal();
    });
}

function go(page) {
    const qEl = document.getElementById('queue-doc-q');
    const statusEl = document.getElementById('queue-doc-status');
    const payEl = document.getElementById('queue-doc-pay');
    loadDocRows(page, { q: qEl ? qEl.value : '', status: statusEl ? statusEl.value : '', payment: payEl ? payEl.value : '' });
}

export function mount(host) {
    host.innerHTML = `
        <div class="queue-page-inner">
            <div class="queue-head">
                <div>
                    <span class="queue-eyebrow">Document Processing</span>
                    <h1>Document Requests</h1>
                    <p class="queue-sub">Review requirements, approve/issue clearances, mark ready for pickup, or reject. Record over-the-counter payment once collected.</p>
                </div>
                <span class="queue-role-badge">STAFF</span>
            </div>
            <div class="queue-toolbar">
                <div class="queue-toolbar-left">
                    <div class="queue-search">
                        <span class="queue-search-ico" aria-hidden="true">⌕</span>
                        <input type="text" id="queue-doc-q" class="form-control" placeholder="Search by tracking #, resident email, or document">
                    </div>
                    <select id="queue-doc-status" class="form-control queue-filter-select" aria-label="Filter by status">
                        <option value="">All statuses</option>${optionTags(DOC_STATUS_OPTS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })))}
                    </select>
                    <select id="queue-doc-pay" class="form-control queue-filter-select" aria-label="Filter by payment">
                        <option value="">All payments</option>
                        <option value="PAID">Paid</option>
                        <option value="UNPAID">Unpaid</option>
                    </select>
                </div>
                <div class="queue-toolbar-right">
                    <span class="queue-results" id="queue-doc-count"></span>
                    <button type="button" class="btn btn-secondary" data-action="refresh-docs">↻ Refresh</button>
                </div>
            </div>
            <div class="queue-table-wrap"><table>
                <thead><tr><th>Tracking #</th><th>Document</th><th>Resident</th><th>Status</th><th>Payment</th><th></th></tr></thead>
                <tbody id="queue-doc-tbody"></tbody>
            </table></div>
            <div class="queue-pager" id="queue-doc-pager"></div>
            <div id="queue-doc-modal"></div>
        </div>
    `;

    const qEl = host.querySelector('#queue-doc-q');
    const statusEl = host.querySelector('#queue-doc-status');
    const payEl = host.querySelector('#queue-doc-pay');
    qEl.addEventListener('input', debounce(() => go(1), 350));
    statusEl.addEventListener('change', () => go(1));
    payEl.addEventListener('change', () => go(1));
    host.querySelector('[data-action="refresh-docs"]').addEventListener('click', () => go(docPage));
    wireActions();
    go(1);
}
