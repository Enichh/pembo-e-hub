// features/emergency/components/queue.js
// Emergency SOS staff dispatch slice (SRP: owns ONLY the staff SOS dispatch
// board). Renders into a host passed to `mount(host)` and wires its own events.
//
// Native ES module. Extract of the sos view from the former `workbench.js`
// monolith; now imports shared helpers from src/assets/core.js.

import {
    escapeHtml, get, post, pill, optionTags, debounce, renderPager,
    shownLabel, fmtDateTime, SOS_CLS,
} from '../../../assets/core.js';
import { initMap, showLocation, refreshSize, destroyMap } from './map.js';
import { reverseGeocode } from './map.js';

const SOS_TARGETS = ['ACKNOWLEDGED', 'RESPONDERS_DISPATCHED', 'RESOLVED', 'FALSE_ALARM'];
const SOS_TYPE_OPTS = ['MEDICAL', 'FIRE', 'POLICE_SECURITY', 'NATURAL_DISASTER', 'OTHER'];
let sosPage = 1;
let sosMeta = null;
const SOS_PER_PAGE = 8;

function toast(type, message, opts) {
    if (window.PemboToast) window.PemboToast[type](message, opts);
    else alert(message);
}

async function loadSos(page, qs) {
    sosPage = page;
    const list = document.getElementById('queue-sos-list'); if (!list) return;
    const params = {
        page: sosPage, per_page: SOS_PER_PAGE,
        q: (qs || {}).q || '', type: (qs || {}).type || '',
    };
    list.innerHTML = '<div class="queue-state">Loading active alerts…</div>';
    document.getElementById('queue-sos-pager').innerHTML = '';
    document.getElementById('queue-sos-count').textContent = '';
    try {
        const d = await get('list_active_sos', params);
        if (!d.success) { list.innerHTML = '<div class="queue-state">' + escapeHtml(d.message || 'Failed to load.') + '</div>'; return; }
        const payload = d.data || {};
        const rows = Array.isArray(payload) ? payload : (payload.data || []);
        sosMeta = Array.isArray(payload) ? null : (payload.meta || null);
        if (!rows.length) { list.innerHTML = '<div class="queue-state">No active SOS alerts match your filters.</div>'; return; }
        const fragments = await Promise.all(rows.map(async (s) => {
            let logs = '<div class="queue-log-muted">No responder logged yet.</div>';
            try {
                const ld = await get('list_sos_dispatch_logs', { id: s.id });
                const lr = ld.success ? (ld.data || []) : [];
                if (lr.length) logs = lr.map((l) =>
                    '<div class="queue-log-item"><span class="queue-log-dot"></span><div>'
                    + '<strong>' + escapeHtml(l.responder_team) + '</strong> — by ' + escapeHtml(l.dispatched_by_email)
                    + ' <span class="queue-log-muted">' + fmtDateTime(l.dispatch_time) + '</span>'
                    + (l.clearance_time ? ' · cleared ' + fmtDateTime(l.clearance_time) : '')
                    + (l.action_notes ? '<div class="queue-log-muted">' + escapeHtml(l.action_notes) + '</div>' : '')
                    + '</div></div>').join('');
            } catch (e) { /* keep */ }
            const [sb, sf] = SOS_CLS[s.status] || ['#f1f5f9', '#475569'];
            return '<article class="queue-card queue-sos-card" data-sid="' + escapeHtml(s.id) + '">'
                + '<div class="queue-sos-top"><span class="queue-sos-code">' + escapeHtml(s.sos_code) + '</span>' + pill(sb, sf, s.status) + '</div>'
                + '<div class="queue-kv">'
                + '<span>Type</span><span>' + escapeHtml(s.emergency_type.replace(/_/g, ' ')) + '</span>'
                + '<span>Constituent</span><span>' + escapeHtml(s.resident_email || '') + '</span>'
                + '<span>Location</span><span>lat ' + Number(s.latitude).toFixed(5) + ', lng ' + Number(s.longitude).toFixed(5) + (s.accuracy_meters ? ' (±' + Math.round(s.accuracy_meters) + 'm)' : '') + '</span>'
                + '<span>Raised</span><span>' + fmtDateTime(s.created_at) + '</span>'
                + (s.resolved_at ? '<span>Resolved</span><span>' + fmtDateTime(s.resolved_at) + '</span>' : '')
                + '</div>'
                + '<div class="queue-actions queue-sos-ctl"><div class="form-group" style="flex:2 1 260px;"><label>Advance to</label>'
                + '<select class="form-control queue-sos-target">' + SOS_TARGETS.map((x) => '<option value="' + x + '">' + escapeHtml(x.replace(/_/g, ' ')) + '</option>').join('') + '</select></div></div>'
                + '<button type="button" class="btn btn-sm btn-secondary" data-action="sos-locate" data-lat="' + Number(s.latitude) + '" data-lng="' + Number(s.longitude) + '">View location</button>'
                + '<div class="form-group"><label>Responder team / unit notified</label><input type="text" class="form-control queue-sos-team" placeholder="e.g. BHERT on-call / BFP station"></div>'
                + '<div class="form-group"><label>Action notes</label><textarea class="form-control queue-sos-note" placeholder="What was done / outcome"></textarea></div>'
                + '<button type="button" class="btn btn-sm btn-primary" data-action="sos-advance">Apply status</button>'
                + '<h4 class="queue-modal-h">Dispatch log</h4><div class="queue-log">' + logs + '</div>'
                + '</article>';
        }));
        list.innerHTML = fragments.join('');
        const after = { q: params.q, type: params.type };
        renderPager(document.getElementById('queue-sos-pager'), sosPage, sosMeta ? sosMeta.total_pages : 1, (p) => loadSos(p, after));
        const count = document.getElementById('queue-sos-count');
        if (count && sosMeta) count.textContent = shownLabel(rows.length, sosMeta.total);
    } catch (e) { list.innerHTML = '<div class="queue-state">Could not load the SOS board.</div>'; }
}

async function advanceSos(card, btn) {
    const sid = card.getAttribute('data-sid');
    const target = card.querySelector('.queue-sos-target').value;
    const team = (card.querySelector('.queue-sos-team').value || '').trim();
    const note = (card.querySelector('.queue-sos-note').value || '').trim();
    try {
        await window.PemboButton.loading(btn, () =>
            post('update_sos_status', { sos_id: sid, status: target, responder_team: team || null, action_notes: note || null })
        , { loadingLabel: 'Saving…' })
            .then((d) => {
                if (d.success) toast('success', 'SOS dispatch status saved.');
                else toast('error', d.message || 'Update failed.');
            });
    } catch (e) { toast('error', 'Network error.'); }
    finally { reloadSosQueue(); }
}

function reloadSosQueue() {
    const qEl = document.getElementById('queue-sos-q');
    const tEl = document.getElementById('queue-sos-type');
    loadSos(sosPage, { q: qEl ? qEl.value : '', type: tEl ? tEl.value : '' });
}

function wireActions() {
    document.addEventListener('click', function onSosClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        if (action === 'sos-advance') {
            const c = btn.closest('[data-sid]');
            if (c) advanceSos(c, btn);
        } else if (action === 'refresh-sos') go(sosPage);
        else if (action === 'sos-locate') {
            openLocationModal(Number(btn.getAttribute('data-lat')), Number(btn.getAttribute('data-lng')));
        } else if (action === 'sos-map-close') closeLocationModal();
    });
}

/**
 * Open a modal showing a single SOS location. Reuses one Leaflet instance and
 * calls invalidateSize after display so the map tiles render at full size.
 *
 * @param {number} lat
 * @param {number} lng
 */
function openLocationModal(lat, lng) {
    let backdrop = document.getElementById('sos-map-modal');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sos-map-modal';
        backdrop.className = 'queue-modal-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.innerHTML =
            '<div class="queue-modal" role="dialog" aria-modal="true" aria-labelledby="sos-map-title">'
            + '<h2 id="sos-map-title" class="sos-map-title">Emergency Location</h2>'
            + '<p class="sos-map-sub">Current reported location of the constituent.</p>'
            + '<div class="sos-address" id="sos-map-address">Locating address…</div>'
            + '<div id="sos-map-host" class="sos-map-host"></div>'
            + '</div>';
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', (ev) => {
            if (ev.target === backdrop) closeLocationModal();
        });
    }

    const host = document.getElementById('sos-map-host');
    initMap(host);
    showLocation(lat, lng);

    const addrEl = document.getElementById('sos-map-address');
    if (addrEl) {
        addrEl.textContent = 'Locating address…';
    }
    reverseGeocode(lat, lng).then((address) => {
        const el = document.getElementById('sos-map-address');
        if (el) {
            el.textContent = address || 'Address unavailable for this area.';
        }
    });

    backdrop.style.display = 'flex';
    backdrop.setAttribute('aria-hidden', 'false');
    // Tiles need a known container size after the modal is shown.
    requestAnimationFrame(() => refreshSize());
}

function closeLocationModal() {
    const backdrop = document.getElementById('sos-map-modal');
    if (backdrop) {
        backdrop.style.display = 'none';
        backdrop.setAttribute('aria-hidden', 'true');
        destroyMap();
    }
}

function go(page) {
    const qEl = document.getElementById('queue-sos-q');
    const typeEl = document.getElementById('queue-sos-type');
    loadSos(page, { q: qEl ? qEl.value : '', type: typeEl ? typeEl.value : '' });
}

export function mount(host) {
    host.innerHTML = `
        <div class="queue-page-inner">
            <div class="queue-head">
                <div>
                    <span class="queue-eyebrow">SOS Dispatch</span>
                    <h1>Emergency SOS Dispatch</h1>
                    <p class="queue-sub">Acknowledge alerts and — after the Barangay desk has notified a responder unit physically/by phone — record the dispatch and advance the status. Every step is kept on a permanent dispatch log.</p>
                </div>
                <span class="queue-role-badge">STAFF</span>
            </div>
            <div class="queue-toolbar">
                <div class="queue-toolbar-left">
                    <div class="queue-search">
                        <span class="queue-search-ico" aria-hidden="true">⌕</span>
                        <input type="text" id="queue-sos-q" class="form-control" placeholder="Search by SOS code or resident">
                    </div>
                    <select id="queue-sos-type" class="form-control queue-filter-select" aria-label="Filter by type">
                        <option value="">All types</option>${optionTags(SOS_TYPE_OPTS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })))}
                    </select>
                </div>
                <div class="queue-toolbar-right">
                    <span class="queue-results" id="queue-sos-count"></span>
                    <button type="button" class="btn btn-secondary" data-action="refresh-sos">↻ Refresh</button>
                </div>
            </div>
            <div class="queue-sos-grid" id="queue-sos-list"></div>
            <div class="queue-pager" id="queue-sos-pager"></div>
        </div>
    `;

    const qEl = host.querySelector('#queue-sos-q');
    const typeEl = host.querySelector('#queue-sos-type');
    qEl.addEventListener('input', debounce(() => go(1), 350));
    typeEl.addEventListener('change', () => go(1));
    host.querySelector('[data-action="refresh-sos"]').addEventListener('click', () => go(sosPage));
    wireActions();
    go(1);
}
