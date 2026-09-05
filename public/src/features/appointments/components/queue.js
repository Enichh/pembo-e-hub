// features/appointments/components/queue.js
// Appointments staff scheduling queue slice (SRP: owns ONLY the staff
// appointment-schedule console). Renders into a host passed to `mount(host)`
// and wires its own events. Residents self-book through their own slice; this
// queue is where staff confirm or advance each booking.
//
// Native ES module. Mirrors features/complaints/components/queue.js; imports
// shared helpers from src/assets/core.js.

import {
    escapeHtml, get, post, pill, optionTags, debounce, renderPager,
    fmtDate, fmtDateTime, APT_CLS,
} from '../../../assets/core.js';

let aptPage = 1;
let aptMeta = null;
const APT_PER_PAGE = 8;

// Calendar view state (staff schedule).
let aptView = 'list';              // 'list' | 'calendar'
let aptCalDate = '';               // YYYY-MM-DD selected in the calendar
let aptCalMonth = null;            // { year, month } 0-based month
let aptAll = [];                   // every appointment (staff sees all)

const APT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const APT_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function aptTodayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function aptToYmd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// BOOKED is the resting state a resident creates; staff may advance to the
// remaining transitions. Booked is shown but is not an action target.
const APT_ACTION_OPTS = ['CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'];
const APT_STATUS_OPTS = ['BOOKED'].concat(APT_ACTION_OPTS);

function toast(type, message, opts) {
    if (window.PemboToast) window.PemboToast[type](message, opts);
    else alert(message);
}

/** Wrap modal markup; the outer node is the click-catch backdrop. */
function modalFrame(inner) {
    return '<div class="queue-modal-backdrop" data-close-scope="true"><div class="queue-modal" role="dialog" aria-modal="true">' + inner + '</div></div>';
}

function closeModal() {
    const m = document.getElementById('queue-apt-modal');
    if (m) { m.style.display = 'none'; m.innerHTML = ''; }
}

function openModal(backdrop) {
    const outer = document.getElementById('queue-apt-modal');
    if (outer) outer.style.display = ''; // undo prior inline 'none' so it can reopen
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.style.display = 'flex';
}

async function loadAppointments(page, qs) {
    aptPage = page;
    const list = document.getElementById('queue-apt-list'); if (!list) return;
    const params = {
        page: aptPage, per_page: APT_PER_PAGE,
        q: (qs || {}).q || '', status: (qs || {}).status || '', date: (qs || {}).date || '',
        _: Date.now(),
    };
    list.innerHTML = '<div class="queue-state">Loading scheduled appointments…</div>';
    document.getElementById('queue-apt-pager').innerHTML = '';
    try {
        const d = await get('list_appointments', params);
        if (!d.success) { list.innerHTML = '<div class="queue-state">' + escapeHtml(d.message || 'Failed to load.') + '</div>'; return; }
        const payload = d.data || {};
        const rows = Array.isArray(payload) ? payload : (payload.data || []);
        aptMeta = Array.isArray(payload) ? null : (payload.meta || null);
        if (!rows.length) { list.innerHTML = '<div class="queue-state">No appointments match your filters.</div>'; return; }
        list.innerHTML = rows.map(aptCard).join('');
        const after = { q: params.q, status: params.status, date: params.date };
        renderPager(document.getElementById('queue-apt-pager'), aptPage, aptMeta ? aptMeta.total_pages : 1, (p) => loadAppointments(p, after));
    } catch (e) { list.innerHTML = '<div class="queue-state">Could not load the appointment schedule.</div>'; }
}

function aptCard(a) {
    const lastName = (a.last_name || '').trim();
    const firstName = (a.first_name || '').trim();
    const name = (firstName + ' ' + lastName).trim() || a.resident_email || 'Resident';
    const contact = a.contact_number ? ' · ' + escapeHtml(a.contact_number) : '';
    const [sb, sf] = APT_CLS[a.status] || ['#f1f5f9', '#475569'];
    return '<article class="queue-card" data-aid="' + escapeHtml(a.id) + '">'
        + '<div class="queue-card-head"><span class="queue-card-title">' + escapeHtml(a.service_type) + '</span>' + pill(sb, sf, a.status) + '</div>'
        + '<div class="queue-card-meta">' + escapeHtml(a.appointment_date) + ' · ' + escapeHtml(a.time_slot) + '</div>'
        + '<div class="queue-card-meta">' + escapeHtml(name) + ' · ' + escapeHtml(a.resident_email) + contact + '</div>'
        + '<div class="queue-actions">'
        + '<div class="form-group"><label>Advance to</label><select class="form-control queue-apt-status">'
        + APT_ACTION_OPTS.map((s) => '<option value="' + s + '">' + escapeHtml(s.replace(/_/g, ' ')) + '</option>').join('')
        + '</select></div>'
        + '<div class="form-group" style="flex:2 1 260px;"><label>Cancellation reason (only if cancelling)</label>'
        + '<input type="text" class="form-control queue-apt-reason" placeholder="Optional"></div>'
        + '<button type="button" class="btn btn-sm btn-secondary" data-action="apt-detail">Details</button>'
        + '<button type="button" class="btn btn-sm btn-primary" data-action="apt-update">Save</button>'
        + '</div></article>';
}

/* ------------------------------------------------------------------ */
/* Calendar view: month grid (count badges) + per-day appointment list */
/* reusing the same card + status-advance controls as the list view.   */
/* ------------------------------------------------------------------ */

function aptCounts() {
    const counts = {};
    aptAll.forEach((a) => {
        const d = String(a.appointment_date || '').slice(0, 10);
        if (d) counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
}

async function loadCalendarAppointments() {
    const host = document.getElementById('queue-apt-calendar');
    if (!host) return;
    host.innerHTML = '<div class="queue-state">Loading calendar…</div>';
    try {
        // Cache-busting `_` param: the API sends no Cache-Control header, so the
        // browser may otherwise serve a stale cached GET after a status POST
        // (the DB updates, but the re-fetch returns the old list).
        const d = await get('list_appointments', { page: 1, per_page: 200, _: Date.now() });
        const payload = d.data || {};
        const rows = Array.isArray(payload) ? payload : (payload.data || []);
        aptAll = rows;
    } catch (e) {
        aptAll = [];
    }
    renderCalendarGrid();
}

function renderCalendarGrid() {
    const host = document.getElementById('queue-apt-calendar');
    if (!host) return;

    if (!aptCalDate) aptCalDate = aptTodayYmd();
    if (!aptCalMonth) {
        const now = new Date();
        aptCalMonth = { year: now.getFullYear(), month: now.getMonth() };
    }

    const { year, month } = aptCalMonth;
    const counts = aptCounts();
    const todayYmd = aptTodayYmd();

    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const head = APT_WEEKDAYS.map((w) => '<span class="apt-cal-dow">' + w + '</span>').join('');

    let cells = '';
    for (let i = 0; i < startOffset; i++) cells += '<span class="apt-cal-cell apt-cal-empty"></span>';

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const ymd = aptToYmd(date);
        const count = counts[ymd] || 0;
        const isToday = ymd === todayYmd;
        const isSelected = ymd === aptCalDate;

        let cls = 'apt-cal-cell apt-cal-day';
        if (count > 0) cls += ' has-count';
        if (isToday) cls += ' is-today';
        if (isSelected) cls += ' is-selected';

        const badge = count > 0 ? '<span class="apt-cal-badge">' + count + '</span>' : '';
        cells += '<button type="button" class="' + cls + '" data-ymd="' + ymd + '"'
            + ' aria-label="' + d + (count ? ', ' + count + ' appointment(s)' : '') + '">'
            + d + badge + '</button>';
    }

    const remainder = (startOffset + daysInMonth) % 7;
    if (remainder !== 0) {
        for (let i = remainder; i < 7; i++) cells += '<span class="apt-cal-cell apt-cal-empty"></span>';
    }

    host.innerHTML = `
        <div class="apt-cal-head">
            <button type="button" class="apt-cal-nav" data-action="cal-prev" aria-label="Previous month">&lt;</button>
            <div class="apt-cal-title">${APT_MONTHS[month]} ${year}</div>
            <button type="button" class="apt-cal-nav" data-action="cal-next" aria-label="Next month">&gt;</button>
        </div>
        <div class="apt-cal-grid">${head}${cells}</div>
    `;

    renderCalendarDay();
}

function renderCalendarDay() {
    const list = document.getElementById('queue-apt-cal-list');
    const hint = document.getElementById('queue-apt-cal-hint');
    if (!list) return;

    const date = aptCalDate || aptTodayYmd();
    if (hint) {
        const pretty = new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        hint.textContent = 'Showing ' + pretty;
    }

    const dayAppts = aptAll
        .filter((a) => String(a.appointment_date || '').slice(0, 10) === date)
        .sort((a, b) => String(a.time_slot).localeCompare(String(b.time_slot)));

    if (!dayAppts.length) {
        list.innerHTML = '<div class="queue-state">No appointments on this date.</div>';
        return;
    }

    list.innerHTML = dayAppts.map((a) => aptCard(a)).join('');
}

function wireCalendar() {
    const host = document.getElementById('queue-apt-calendar');
    if (!host) return;
    host.addEventListener('click', (e) => {
        // Day cells carry `data-ymd` (no `data-action`), so handle them first.
        const day = e.target.closest('.apt-cal-day');
        if (day) {
            aptCalDate = day.getAttribute('data-ymd');
            renderCalendarGrid();
            return;
        }

        const action = e.target.closest('[data-action]');
        if (!action) return;
        const act = action.getAttribute('data-action');
        if (act === 'cal-prev') {
            aptCalMonth.month--;
            if (aptCalMonth.month < 0) { aptCalMonth.month = 11; aptCalMonth.year--; }
            renderCalendarGrid();
        } else if (act === 'cal-next') {
            aptCalMonth.month++;
            if (aptCalMonth.month > 11) { aptCalMonth.month = 0; aptCalMonth.year++; }
            renderCalendarGrid();
        }
    });
}

function aptDetailModal(a) {
    const name = ((a.first_name || '') + ' ' + (a.last_name || '')).trim() || a.resident_email || 'Resident';
    const modal = document.getElementById('queue-apt-modal'); if (!modal) return;
    modal.innerHTML = modalFrame(
        '<div class="queue-modal-head"><div><div class="queue-eyebrow">Appointment</div>'
        + '<div class="queue-modal-title">' + escapeHtml(a.service_type) + '</div></div>'
        + '<button type="button" class="btn btn-sm btn-secondary" data-close="true">×</button></div>'
        + '<div class="queue-kv" style="margin:12px 0;">'
        + '<span>Resident</span><span>' + escapeHtml(name) + '</span>'
        + '<span>Email</span><span>' + escapeHtml(a.resident_email) + '</span>'
        + '<span>Contact</span><span>' + escapeHtml(a.contact_number || '—') + '</span>'
        + '<span>Date</span><span>' + fmtDate(a.appointment_date) + '</span>'
        + '<span>Time slot</span><span>' + escapeHtml(a.time_slot) + '</span>'
        + '<span>Status</span><span>' + escapeHtml((a.status || '').replace(/_/g, ' ')) + '</span>'
        + '<span>Booked</span><span>' + fmtDateTime(a.created_at) + '</span>'
        + (a.cancellation_reason ? '<span>Cancellation reason</span><span>' + escapeHtml(a.cancellation_reason) + '</span>' : '')
        + '</div>'
        + '<div class="queue-actions" style="margin-top:12px;">'
        + '<button type="button" class="btn btn-sm btn-secondary" data-close="true">Close</button>'
        + '<button type="button" class="btn btn-sm btn-primary" data-action="apt-modal-update" data-id="' + escapeHtml(a.id) + '">Update Status</button>'
        + '</div>'
    );
    const backdrop = modal.firstElementChild || modal;
    openModal(backdrop);
}

/** Advance an appointment's status straight from the card. */
async function updateAppointment(aid, status, reason, btn) {
    try {
        const d = await window.PemboButton.loading(btn, () => post('update_appointment_status', {
            appointment_id: aid, status,
            cancellation_reason: status === 'CANCELLED' ? (reason || null) : null,
        }), { loadingLabel: 'Saving…' });
        if (d.success) toast('success', 'Appointment status updated.');
        else toast('error', d.message || 'Update failed.');
    } catch (e) { toast('error', 'Network error.'); }
    finally { reloadAppointmentQueue(); }
}

function reloadAppointmentQueue() {
    if (aptView === 'calendar') {
        loadCalendarAppointments();
        return;
    }
    const qEl = document.getElementById('queue-apt-q');
    const sEl = document.getElementById('queue-apt-status');
    loadAppointments(aptPage, { q: qEl ? qEl.value : '', status: sEl ? sEl.value : '' });
}

function wireActions() {
    document.addEventListener('click', function onAptClick(e) {
        const explicitClose = e.target.closest('[data-close="true"]');
        if (explicitClose) { closeModal(); return; }
        const backdrop = e.target.closest('[data-close-scope="true"]');
        if (backdrop && backdrop === e.target) { closeModal(); return; }

        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        if (action === 'apt-update') {
            const card = btn.closest('[data-aid]');
            if (card) {
                updateAppointment(
                    card.getAttribute('data-aid'),
                    card.querySelector('.queue-apt-status').value,
                    (card.querySelector('.queue-apt-reason').value || '').trim(),
                    btn
                );
            }
        } else if (action === 'apt-detail') {
            const card = btn.closest('[data-aid]');
            if (card) openDetail(card.getAttribute('data-aid'));
        } else if (action === 'apt-modal-update') {
            const aid = btn.getAttribute('data-id');
            closeModal();
            scrollToCardAndUpdate(aid);
        } else if (action === 'refresh-apt') go(aptPage);
    });
    document.addEventListener('keydown', function onAptEsc(e) {
        if (e.key === 'Escape') closeModal();
    });
}

/** Reopen the card-level controls for a specific appointment after closing the detail modal. */
function scrollToCardAndUpdate(aid) {
    const card = document.querySelector('[data-aid="' + CSS.escape(aid) + '"]');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Open the read-only detail modal for a resident appointment. */
async function openDetail(aid) {
    // Re-fetch the specific row from the currently loaded page to keep it simple.
    const dEl = document.getElementById('queue-apt-q');
    const detailQuery = { q: dEl ? dEl.value : '', status: '', date: '' };
    try {
        const d = await get('list_appointments', { page: 1, per_page: 200, q: detailQuery.q });
        const payload = d && d.success ? (d.data || {}) : {};
        const rows = Array.isArray(payload) ? payload : (payload.data || []);
        const a = rows.find((x) => x.id === aid);
        if (!a) { toast('error', 'Appointment no longer available.'); return; }
        aptDetailModal(a);
    } catch (e) { toast('error', 'Network error.'); }
}

function go(page) {
    const qEl = document.getElementById('queue-apt-q');
    const statusEl = document.getElementById('queue-apt-status');
    loadAppointments(page, { q: qEl ? qEl.value : '', status: statusEl ? statusEl.value : '' });
}

export function mount(host) {
    host.innerHTML = `
        <div class="queue-page-inner">
            <div class="queue-head">
                <div>
                    <span class="queue-eyebrow">Service Scheduling</span>
                    <h1>Appointment Schedule</h1>
                    <p class="queue-sub">Confirm and manage resident service bookings. Advancing a status emails the resident automatically; cancellations carry a required reason.</p>
                </div>
                <span class="queue-role-badge">STAFF</span>
            </div>
            <div class="queue-toolbar">
                <div class="queue-toolbar-left">
                    <div class="queue-search">
                        <span class="queue-search-ico" aria-hidden="true">⌕</span>
                        <input type="text" id="queue-apt-q" class="form-control" placeholder="Search by service, resident, or time slot">
                    </div>
                    <select id="queue-apt-status" class="form-control queue-filter-select" aria-label="Filter by status">
                        <option value="">All statuses</option>${optionTags(APT_STATUS_OPTS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })))}
                    </select>
                </div>
                <div class="queue-toolbar-right">
                    <button type="button" class="btn btn-secondary" data-action="apt-view-toggle" data-view="calendar">Calendar</button>
                    <button type="button" class="btn btn-secondary" data-action="apt-view-toggle" data-view="list">List</button>
                    <button type="button" class="btn btn-secondary" data-action="refresh-apt">Refresh</button>
                </div>
            </div>
            <div class="queue-cards" id="queue-apt-list"></div>
            <div class="queue-pager" id="queue-apt-pager"></div>
            <div class="queue-calendar-wrap" id="queue-apt-calendar-wrap" style="display:none;">
                <div class="apt-calendar" id="queue-apt-calendar"></div>
                <div class="queue-calendar-side">
                    <p class="queue-sub" id="queue-apt-cal-hint"></p>
                    <div class="queue-cards" id="queue-apt-cal-list"></div>
                </div>
            </div>
            <div id="queue-apt-modal"></div>
        </div>
    `;

    const qEl = host.querySelector('#queue-apt-q');
    const statusEl = host.querySelector('#queue-apt-status');
    qEl.addEventListener('input', debounce(() => go(1), 350));
    statusEl.addEventListener('change', () => go(1));
    host.querySelector('[data-action="refresh-apt"]').addEventListener('click', () => go(aptPage));
    host.querySelectorAll('[data-action="apt-view-toggle"]').forEach((b) => {
        b.addEventListener('click', () => setView(b.getAttribute('data-view')));
    });
    wireActions();
    wireCalendar();
    go(1);
}

function setView(view) {
    aptView = view;
    const listEl = document.getElementById('queue-apt-list');
    const pagerEl = document.getElementById('queue-apt-pager');
    const calWrap = document.getElementById('queue-apt-calendar-wrap');
    if (view === 'calendar') {
        if (listEl) listEl.style.display = 'none';
        if (pagerEl) pagerEl.style.display = 'none';
        if (calWrap) calWrap.style.display = 'grid';
        loadCalendarAppointments();
    } else {
        if (listEl) listEl.style.display = '';
        if (pagerEl) pagerEl.style.display = '';
        if (calWrap) calWrap.style.display = 'none';
        go(aptPage);
    }
}
