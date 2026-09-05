// features/complaints/components/queue.js
// Complaints staff queue slice (SRP: owns ONLY the staff complaint-resolution
// console). Renders into a host passed to `mount(host)` and wires its own events.
//
// Native ES module. Extract of the complaints view from the former `workbench.js`
// monolith; now imports shared helpers from src/assets/core.js.

import {
    escapeHtml, get, post, pill, optionTags, debounce, renderPager,
    shownLabel, fmtDateTime, CMP_CLS,
} from '../../../assets/core.js';

let cmpPage = 1;
let cmpMeta = null;
const CMP_PER_PAGE = 6;
const CMP_STATUS_OPTS = ['FILED', 'UNDER_INVESTIGATION', 'HEARING_SCHEDULED', 'RESOLVED', 'DISMISSED'];

function toast(type, message, opts) {
    if (window.PemboToast) window.PemboToast[type](message, opts);
    else alert(message);
}

async function loadComplaints(page, qs) {
    cmpPage = page;
    const list = document.getElementById('queue-cmp-list'); if (!list) return;
    const params = {
        page: cmpPage, per_page: CMP_PER_PAGE,
        q: (qs || {}).q || '', status: (qs || {}).status || '',
    };
    list.innerHTML = '<div class="queue-state">Loading complaints…</div>';
    document.getElementById('queue-cmp-pager').innerHTML = '';
    document.getElementById('queue-cmp-count').textContent = '';
    try {
        const qRes = await get('list_all_complaints', params);
        if (!qRes.success) { list.innerHTML = '<div class="queue-state">' + escapeHtml(qRes.message || 'Failed to load.') + '</div>'; return; }
        const payload = qRes.data || {};
        const rows = Array.isArray(payload) ? payload : (payload.data || []);
        cmpMeta = Array.isArray(payload) ? null : (payload.meta || null);
        if (!rows.length) { list.innerHTML = '<div class="queue-state">No complaints match your filters.</div>'; return; }
        list.innerHTML = rows.map(cmpCard).join('');
        const after = { q: params.q, status: params.status };
        renderPager(document.getElementById('queue-cmp-pager'), cmpPage, cmpMeta ? cmpMeta.total_pages : 1, (p) => loadComplaints(p, after));
        const count = document.getElementById('queue-cmp-count');
        if (count && cmpMeta) count.textContent = shownLabel(rows.length, cmpMeta.total);
    } catch (e) { list.innerHTML = '<div class="queue-state">Could not load the complaint queue.</div>'; }
}

function cmpCard(c) {
    const statusOpts = CMP_STATUS_OPTS.map((s) => '<option value="' + s + '"' + (c.status === s ? ' selected' : '') + '>' + escapeHtml(s.replace(/_/g, ' ')) + '</option>').join('');
    const [sb, sf] = CMP_CLS[c.status] || ['#f1f5f9', '#475569'];
    return '<article class="queue-card" data-cid="' + escapeHtml(c.id) + '">'
        + '<div class="queue-card-head"><span class="queue-card-title">' + escapeHtml(c.complaint_number) + '</span>' + pill(sb, sf, c.status) + '</div>'
        + '<div class="queue-card-meta">' + escapeHtml(c.incident_type) + ' · ' + escapeHtml(c.resident_email) + ' · ' + fmtDateTime(c.incident_date) + '</div>'
        + '<div class="queue-card-meta">' + escapeHtml(c.incident_location) + '</div>'
        + '<p class="queue-narrative">' + escapeHtml(c.narrative_details) + '</p>'
        + '<div class="queue-actions">'
        + '<div class="form-group"><label>Status</label><select class="form-control queue-cmp-status">' + statusOpts + '</select></div>'
        + '<div class="form-group" style="flex:2 1 300px;"><label>Action / resolution note (optional)</label>'
        + '<input type="text" class="form-control queue-cmp-note" placeholder="e.g. Violations conference scheduled"></div>'
        + '<button type="button" class="btn btn-sm btn-primary" data-action="cmp-update">Save</button>'
        + '</div></article>';
}

async function updateComplaint(card, btn) {
    const cid = card.getAttribute('data-cid');
    const status = card.querySelector('.queue-cmp-status').value;
    const note = (card.querySelector('.queue-cmp-note').value || '').trim();
    try {
        const d = await window.PemboButton.loading(btn, () => post('update_complaint_status', {
            complaint_id: cid, status,
            action_taken: note || null,
            resolution_notes: (status === 'RESOLVED' || status === 'DISMISSED') ? (note || 'Closed via staff console.') : null,
        }), { loadingLabel: 'Saving…' });
        if (d.success) toast('success', 'Complaint updated.');
        else toast('error', d.message || 'Update failed.');
    } catch (e) { toast('error', 'Network error.'); }
    finally { reloadComplaintQueue(); }
}

function reloadComplaintQueue() {
    const qEl = document.getElementById('queue-cmp-q');
    const sEl = document.getElementById('queue-cmp-status');
    loadComplaints(cmpPage, { q: qEl ? qEl.value : '', status: sEl ? sEl.value : '' });
}

function wireActions() {
    document.addEventListener('click', function onCmpClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        if (action === 'cmp-update') {
            const c = btn.closest('[data-cid]');
            if (c) updateComplaint(c, btn);
        } else if (action === 'refresh-cmp') go(cmpPage);
    });
}

function go(page) {
    const qEl = document.getElementById('queue-cmp-q');
    const statusEl = document.getElementById('queue-cmp-status');
    loadComplaints(page, { q: qEl ? qEl.value : '', status: statusEl ? statusEl.value : '' });
}

export function mount(host) {
    host.innerHTML = `
        <div class="queue-page-inner">
            <div class="queue-head">
                <div>
                    <span class="queue-eyebrow">Complaints Resolution</span>
                    <h1>Complaints Queue</h1>
                    <p class="queue-sub">Log the action taken and move filed incidents toward resolution. Every update is kept on the complaint's permanent history.</p>
                </div>
                <span class="queue-role-badge">STAFF</span>
            </div>
            <div class="queue-toolbar">
                <div class="queue-toolbar-left">
                    <div class="queue-search">
                        <span class="queue-search-ico" aria-hidden="true">⌕</span>
                        <input type="text" id="queue-cmp-q" class="form-control" placeholder="Search by complaint #, resident, type, or location">
                    </div>
                    <select id="queue-cmp-status" class="form-control queue-filter-select" aria-label="Filter by status">
                        <option value="">All statuses</option>${optionTags(CMP_STATUS_OPTS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })))}
                    </select>
                </div>
                <div class="queue-toolbar-right">
                    <span class="queue-results" id="queue-cmp-count"></span>
                    <button type="button" class="btn btn-secondary" data-action="refresh-cmp">↻ Refresh</button>
                </div>
            </div>
            <div class="queue-cards" id="queue-cmp-list"></div>
            <div class="queue-pager" id="queue-cmp-pager"></div>
        </div>
    `;

    const qEl = host.querySelector('#queue-cmp-q');
    const statusEl = host.querySelector('#queue-cmp-status');
    qEl.addEventListener('input', debounce(() => go(1), 350));
    statusEl.addEventListener('change', () => go(1));
    host.querySelector('[data-action="refresh-cmp"]').addEventListener('click', () => go(cmpPage));
    wireActions();
    go(1);
}
