// src/features/appointments/components/appointments.js
// Appointments slice (SRP: owns ONLY appointments). Renders a three-step
// booking flow (service, date, time slot) into a host passed to `mount(host)`,
// and wires events via delegation.

import { useVersionPoll } from '../../../assets/useVersionPoll.js';

let selectedSlot = '';
let selectedService = '';
let selectedDate = '';            // YYYY-MM-DD
let calendarView = null;           // { year, month } 0-based month

const uiState = { modalOpen: false, formDirty: false, uploadInProgress: false };
let refreshPending = false;
let pollInstance = null;

function csrf() {
    return window.pemboCsrfToken || '';
}

function toast(type, message, opts) {
    if (window.PemboToast) {
        window.PemboToast[type](message, opts);
    } else {
        alert(message);
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function toYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function minDate() {
    return toYmd(today());
}

const SERVICES = [
    { value: 'Barangay Clearance Appointment', label: 'Barangay Clearance', icon: 'doc' },
    { value: 'Certificate of Residency Appointment', label: 'Certificate of Residency', icon: 'doc' },
    { value: 'Blotter / Complaint Filing', label: 'Blotter / Complaint', icon: 'alert' },
    { value: 'Barangay ID Appointment', label: 'Barangay ID', icon: 'id' },
];

const ICONS = {
    doc: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
    id: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="M7 15c.8-1.3 2-2 3-2s2.2.7 3 2"/><line x1="15" y1="8" x2="18" y2="8"/><line x1="15" y1="12" x2="18" y2="12"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
};

function showUpdatesBadge() {
    const container = document.getElementById('apt-updates-badge-container');
    if (!container) return;
    container.innerHTML = `<button type="button" class="updates-badge" id="apt-updates-badge" aria-label="Refresh appointments">● New updates available — click to refresh</button>`;
    const btn = document.getElementById('apt-updates-badge');
    if (btn) {
        btn.addEventListener('click', () => {
            refreshPending = false;
            hideUpdatesBadge();
            refreshAppointmentsTable();
        });
    }
}

function hideUpdatesBadge() {
    const container = document.getElementById('apt-updates-badge-container');
    if (container) {
        container.innerHTML = '';
    }
}

function checkDeferredRefresh() {
    if (!uiState.modalOpen && !uiState.formDirty && !uiState.uploadInProgress) {
        if (refreshPending) {
            refreshPending = false;
            hideUpdatesBadge();
            refreshAppointmentsTable();
        }
    }
}

function handleAppointmentsChange() {
    if (uiState.modalOpen || uiState.formDirty || uiState.uploadInProgress) {
        refreshPending = true;
        showUpdatesBadge();
        return;
    }
    refreshAppointmentsTable();
}

async function refreshAppointmentsTable() {
    await loadAppointmentsTable();
    await markTakenSlots();
}

function render(host) {
    host.innerHTML = `
        <div class="apt">
            <div class="apt-intro">
                <h1>Book an Appointment</h1>
                <p>Schedule a visit at a time that works for you and skip the queue.</p>
            </div>

            <form id="create-appointment-form" novalidate>
                <section class="apt-card">
                    <div class="apt-section-head"><span class="apt-section-num">1</span><h2>Choose a Service</h2></div>
                    <div class="apt-service-grid" id="apt-service-grid" role="radiogroup" aria-label="Service"></div>
                    <p class="apt-hint" id="apt-service-hint">Select the service you want to schedule.</p>
                </section>

                <section class="apt-card">
                    <div class="apt-choose">
                        <div class="apt-choose-col">
                            <div class="apt-section-head"><span class="apt-section-num">2</span><h2>Pick a Date</h2></div>
                            <div class="apt-calendar" id="apt-calendar" role="application" aria-label="Choose an appointment date"></div>
                            <p class="apt-hint" id="apt-date-hint">Choose an available date.</p>
                        </div>
                        <div class="apt-choose-col">
                            <div class="apt-section-head"><span class="apt-section-num">3</span><h2>Select a Time Slot</h2></div>
                            <div class="apt-slot-grid" id="appointment-slots"></div>
                            <p class="apt-hint" id="apt-slot-hint">Pick an available time.</p>
                        </div>
                    </div>
                </section>

                <button type="submit" class="apt-submit" id="apt-submit-btn">Book Appointment</button>
            </form>

            <section class="apt-card">
                <div class="apt-section-head" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <h2>My Appointments</h2>
                    <div id="apt-updates-badge-container"></div>
                </div>
                <div class="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Time Slot</th>
                                <th>Service</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="appointments-table-body"></tbody>
                    </table>
                </div>
            </section>
        </div>
    `;

    renderServicePicker();
    renderCalendar();
    wireForm();
}

function renderServicePicker() {
    const grid = document.getElementById('apt-service-grid');
    if (!grid) return;
    grid.innerHTML = SERVICES.map((s) => `
        <label class="apt-service-card" data-value="${escapeHtml(s.value)}">
            <input type="radio" name="apt-service" class="apt-service-radio" value="${escapeHtml(s.value)}">
            <span class="apt-service-icon" aria-hidden="true">${ICONS[s.icon]}</span>
            <span class="apt-service-name">${escapeHtml(s.label)}</span>
        </label>
    `).join('');
}

function wireForm() {
    const grid = document.getElementById('apt-service-grid');
    const form = document.getElementById('create-appointment-form');

    if (grid) {
        grid.addEventListener('change', (e) => {
            const radio = e.target.closest('input[name="apt-service"]');
            if (!radio) return;
            selectedService = radio.value;
            uiState.formDirty = true;
            grid.querySelectorAll('.apt-service-card').forEach((c) => {
                c.classList.toggle('is-selected', c.dataset.value === radio.value);
            });
            const hint = document.getElementById('apt-service-hint');
            if (hint) hint.textContent = '';
        });
    }

    if (form) {
        form.addEventListener('submit', handleBook);
        form.addEventListener('reset', () => {
            uiState.formDirty = false;
            checkDeferredRefresh();
        });
    }
}

/* ---------- Custom calendar (framework-free, accessible) ---------- */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function renderCalendar() {
    const host = document.getElementById('apt-calendar');
    if (!host) return;

    const now = today();
    if (!calendarView) { calendarView = { year: now.getFullYear(), month: now.getMonth() }; }
    const { year, month } = calendarView;
    const ymdToday = toYmd(now);

    const first = new Date(year, month, 1);
    const startOffset = first.getDay();               // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Weekday header.
    let head = WEEKDAYS.map((w) => '<span class="apt-cal-dow">' + w + '</span>').join('');

    // Leading blanks.
    let cells = '';
    for (let i = 0; i < startOffset; i++) {
        cells += '<span class="apt-cal-cell apt-cal-empty"></span>';
    }

    // Day cells.
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const ymd = toYmd(date);
        const past = ymd < ymdToday;
        const isToday = ymd === ymdToday;
        const isSelected = ymd === selectedDate;

        let cls = 'apt-cal-cell apt-cal-day';
        if (past) cls += ' is-disabled';
        if (isToday) cls += ' is-today';
        if (isSelected) cls += ' is-selected';

        const label = past
            ? (d + ' (unavailable)')
            : (isSelected ? d + ' (selected)' : d);

        cells += '<button type="button" class="' + cls + '" data-ymd="' + ymd + '"'
            + (past ? ' disabled aria-disabled="true" tabindex="-1"' : '')
            + ' aria-label="' + label + '" draggable="false">' + d + '</button>';
    }

    // Pad trailing blanks so the last row stays even.
    const total = startOffset + daysInMonth;
    const remainder = total % 7;
    if (remainder !== 0) {
        for (let i = remainder; i < 7; i++) {
            cells += '<span class="apt-cal-cell apt-cal-empty"></span>';
        }
    }

    host.innerHTML = `
        <div class="apt-cal-head">
            <button type="button" class="apt-cal-nav" id="apt-cal-prev" aria-label="Previous month" data-action="cal-prev">${ICONS.chevL}</button>
            <div class="apt-cal-title">${MONTHS[month]} ${year}</div>
            <button type="button" class="apt-cal-nav" id="apt-cal-next" aria-label="Next month" data-action="cal-next">${ICONS.chevR}</button>
        </div>
        <div class="apt-cal-grid">
            ${head}
            ${cells}
        </div>
    `;

    wireCalendar();
}

function wireCalendar() {
    const host = document.getElementById('apt-calendar');
    if (!host) return;

    host.querySelectorAll('[data-action="cal-prev"]').forEach((b) => b.addEventListener('click', () => {
        calendarView.month--;
        if (calendarView.month < 0) { calendarView.month = 11; calendarView.year--; }
        renderCalendar();
    }));
    host.querySelectorAll('[data-action="cal-next"]').forEach((b) => b.addEventListener('click', () => {
        calendarView.month++;
        if (calendarView.month > 11) { calendarView.month = 0; calendarView.year++; }
        renderCalendar();
    }));

    host.querySelectorAll('.apt-cal-day:not(.is-disabled)').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedDate = btn.getAttribute('data-ymd');
            const hint = document.getElementById('apt-date-hint');
            if (hint) {
                const pretty = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                hint.textContent = 'Selected: ' + pretty;
                hint.classList.remove('apt-hint-error');
            }
            renderCalendar();       // refresh selected state
            loadSlots();            // re-mark taken slots for the new date
        });
    });

    // Keyboard: arrow keys navigate, Enter/Space selects the focused day.
    host.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        if (!active || !active.classList.contains('apt-cal-day')) return;
        const ymd = active.getAttribute('data-ymd');
        if (!ymd) return;
        const [y, m, d] = ymd.split('-').map(Number);
        let focusYmd = null;
        if (e.key === 'ArrowLeft')  focusYmd = shiftDay(y, m, d, -1);
        else if (e.key === 'ArrowRight') focusYmd = shiftDay(y, m, d, 1);
        else if (e.key === 'ArrowUp')    focusYmd = shiftDay(y, m, d, -7);
        else if (e.key === 'ArrowDown')  focusYmd = shiftDay(y, m, d, 7);
        else return;

        e.preventDefault();
        // If focus moved to another month, re-render that month.
        const target = focusYmd.split('-').map(Number);
        if (target[0] !== calendarView.year || (target[1] - 1) !== calendarView.month) {
            calendarView = { year: target[0], month: target[1] - 1 };
            renderCalendar();
        }
        const el = host.querySelector('.apt-cal-day[data-ymd="' + focusYmd + '"]');
        if (el) el.focus();
    });
}

function shiftDay(y, m, d, delta) {
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return toYmd(dt);
}

/* Slots shown are the barangay's fixed windows. We query available and booked slots
 * for the chosen date and annotate taken slots clearly in the UI. */
async function loadSlots() {
    const box = document.getElementById('appointment-slots');
    if (!box) return;

    if (!selectedDate) {
        box.innerHTML = `<div class="apt-no-date-prompt"><span class="apt-no-date-icon" aria-hidden="true">${ICONS.calendar}</span><span>Please pick a date on the calendar to view available time slots.</span></div>`;
        const hint = document.getElementById('apt-slot-hint');
        if (hint) {
            hint.textContent = 'Pick a date first to view time slots.';
            hint.classList.remove('apt-hint-error');
        }
        return;
    }

    try {
        const res = await fetch('api.php?action=appointment_slots&date=' + encodeURIComponent(selectedDate));
        const data = await res.json();
        
        let rawSlots = [];
        let takenSet = new Set();
        if (data.success && data.data) {
            if (Array.isArray(data.data)) {
                rawSlots = data.data;
            } else if (data.data.slots && Array.isArray(data.data.slots)) {
                rawSlots = data.data.slots;
                if (Array.isArray(data.data.taken)) {
                    takenSet = new Set(data.data.taken);
                }
            }
        }

        box.innerHTML = '';
        if (rawSlots.length === 0) {
            box.innerHTML = '<span class="text-muted" style="grid-column:1/-1;">No slots configured.</span>';
            return;
        }

        const now = today();
        const nowTime = new Date();
        const ymdToday = toYmd(now);
        const isToday = selectedDate === ymdToday;
        const isPastDate = selectedDate < ymdToday;

        const processedSlots = rawSlots.map((item) => {
            if (typeof item === 'string') {
                const isTaken = takenSet.has(item);
                let isPast = isPastDate;
                if (isToday) {
                    const startTimeStr = item.split('-')[0].trim();
                    const [h, m] = startTimeStr.split(':').map(Number);
                    const slotTime = new Date();
                    slotTime.setHours(h, m, 0, 0);
                    if (slotTime <= nowTime) isPast = true;
                }
                return {
                    slot: item,
                    capacity: 10,
                    booked: isTaken ? 10 : 0,
                    remaining: isTaken ? 0 : 10,
                    is_full: isTaken,
                    is_past: isPast,
                    is_available: !isTaken && !isPast,
                };
            }
            // item is object from backend API
            let isPast = Boolean(item.is_past) || isPastDate;
            if (isToday && !isPast) {
                const startTimeStr = item.slot.split('-')[0].trim();
                const [h, m] = startTimeStr.split(':').map(Number);
                const slotTime = new Date();
                slotTime.setHours(h, m, 0, 0);
                if (slotTime <= nowTime) isPast = true;
            }
            const remaining = Number(item.remaining ?? 0);
            const isFull = Boolean(item.is_full) || remaining <= 0;
            return {
                slot: item.slot,
                capacity: Number(item.capacity ?? 10),
                booked: Number(item.booked ?? 0),
                remaining: remaining,
                is_full: isFull,
                is_past: isPast,
                is_available: !isFull && !isPast,
            };
        });

        // If previously selected slot is no longer available, clear selection
        if (selectedSlot) {
            const currentSelected = processedSlots.find(s => s.slot === selectedSlot);
            if (!currentSelected || !currentSelected.is_available) {
                selectedSlot = '';
                const hint = document.getElementById('apt-slot-hint');
                if (hint) {
                    hint.textContent = 'The previously selected time slot is no longer available for this date. Please pick another time.';
                    hint.classList.add('apt-hint-error');
                }
            }
        }

        const slotMap = new Map();
        processedSlots.forEach(s => slotMap.set(s.slot, s));

        processedSlots.forEach((slotData) => {
            const { slot, capacity, remaining, is_full, is_past, is_available } = slotData;
            const isSelected = selectedSlot === slot;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'apt-slot'
                + (!is_available ? ' is-taken' : ' is-available')
                + (is_past ? ' is-past' : '')
                + (isSelected ? ' is-selected' : '');
            btn.setAttribute('data-slot', slot);

            if (!is_available) {
                btn.disabled = true;
                btn.setAttribute('aria-disabled', 'true');
                const badgeText = is_past ? 'Passed' : 'Full';
                const badgeCls = is_past ? 'badge-passed' : 'badge-taken';
                const infoText = is_past ? 'Time elapsed' : '0 spots left';
                const tooltip = is_past ? 'This time slot has already passed for today' : ('This time slot is full (' + capacity + '/' + capacity + ' booked)');
                btn.title = tooltip;
                btn.innerHTML = `
                    <span class="apt-slot-time">${escapeHtml(slot)}</span>
                    <span class="apt-slot-badge ${badgeCls}">${badgeText}</span>
                    <span class="apt-slot-info">${infoText}</span>
                `;
            } else {
                let badgeText = '';
                let badgeCls = '';
                if (isSelected) {
                    badgeText = 'Selected';
                    badgeCls = 'badge-available';
                } else if (remaining <= 3) {
                    badgeText = `${remaining} left`;
                    badgeCls = 'badge-limited';
                } else {
                    badgeText = `${remaining} spots`;
                    badgeCls = 'badge-available';
                }
                const infoText = `${remaining} of ${capacity} spots`;
                btn.title = `Click to select ${slot} (${remaining} of ${capacity} spots remaining)`;
                btn.innerHTML = `
                    <span class="apt-slot-time">${escapeHtml(slot)}</span>
                    <span class="apt-slot-badge ${badgeCls}">${badgeText}</span>
                    <span class="apt-slot-info">${infoText}</span>
                `;

                btn.addEventListener('click', () => {
                    selectedSlot = slot;
                    uiState.formDirty = true;
                    box.querySelectorAll('.apt-slot').forEach((b) => {
                        b.classList.remove('is-selected');
                        const bSlot = b.getAttribute('data-slot');
                        const bData = slotMap.get(bSlot);
                        if (bData && bData.is_available) {
                            const bBadge = b.querySelector('.apt-slot-badge');
                            if (bBadge) {
                                bBadge.className = `apt-slot-badge ${bData.remaining <= 3 ? 'badge-limited' : 'badge-available'}`;
                                bBadge.textContent = bData.remaining <= 3 ? `${bData.remaining} left` : `${bData.remaining} spots`;
                            }
                        }
                    });
                    btn.classList.add('is-selected');
                    const badge = btn.querySelector('.apt-slot-badge');
                    if (badge) {
                        badge.className = 'apt-slot-badge badge-available';
                        badge.textContent = 'Selected';
                    }
                    const hint = document.getElementById('apt-slot-hint');
                    if (hint) {
                        hint.textContent = `Selected: ${slot} (${remaining} spots remaining)`;
                        hint.classList.remove('apt-hint-error');
                    }
                });
            }

            box.appendChild(btn);
        });
    } catch (e) {
        box.innerHTML = '<span class="text-muted" style="grid-column:1/-1;">Failed to load slots.</span>';
    }
}

async function markTakenSlots() {
    await loadSlots();
}

async function loadAppointmentsTable() {
    const body = document.getElementById('appointments-table-body');
    if (!body) return;
    const isStaff = window.currentUserRole === 'ADMIN' || window.currentUserRole === 'STAFF';
    try {
        const res = await fetch('api.php?action=list_appointments');
        const data = await res.json();
        if (!data.success) { body.innerHTML = '<tr><td colspan="4">Failed to load appointments.</td></tr>'; return; }
        const rows = data.data || [];
        if (rows.length === 0) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No appointments found.</td></tr>'; return; }
        body.innerHTML = rows.map((a) => {
            const residentLabel = isStaff ? escapeHtml(a.resident_email || a.resident_id) : 'You';
            const statusClass = 'apt-status apt-status-' + (a.status || '').toLowerCase();
            return '<tr>'
                + '<td>' + escapeHtml(a.appointment_date) + '</td>'
                + '<td>' + escapeHtml(a.time_slot) + '</td>'
                + '<td>' + escapeHtml(a.service_type) + (isStaff ? ' <span class="text-muted">(' + residentLabel + ')</span>' : '') + '</td>'
                + '<td><span class="' + statusClass + '">' + escapeHtml(a.status) + '</span></td>'
                + '</tr>';
        }).join('');
    } catch (e) {
        body.innerHTML = '<tr><td colspan="4">Error loading appointments.</td></tr>';
    }
}

async function handleBook(e) {
    e.preventDefault();

    if (!selectedService) {
        const hint = document.getElementById('apt-service-hint');
        if (hint) { hint.textContent = 'Please select a service.'; hint.classList.add('apt-hint-error'); }
        return;
    }
    if (!selectedDate) {
        const hint = document.getElementById('apt-date-hint');
        if (hint) { hint.textContent = 'Please choose an available date.'; hint.classList.add('apt-hint-error'); }
        return;
    }
    if (!selectedSlot) {
        const hint = document.getElementById('apt-slot-hint');
        if (hint) { hint.textContent = 'Please select a time slot.'; hint.classList.add('apt-hint-error'); }
        return;
    }

    const submitBtn = document.getElementById('apt-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Booking...'; }

    try {
        const res = await fetch('api.php?action=create_appointment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
            body: JSON.stringify({ service_type: selectedService, appointment_date: selectedDate, time_slot: selectedSlot }),
        });
        const data = await res.json();
        if (data.success) {
            toast('success', 'Your appointment has been booked.', {
                title: 'Appointment confirmed',
                code: data.data.appointment_date + ' · ' + data.data.time_slot,
            });
            document.getElementById('create-appointment-form').reset();
            selectedSlot = '';
            selectedService = '';
            selectedDate = '';
            uiState.formDirty = false;
            const grid = document.getElementById('apt-service-grid');
            if (grid) grid.querySelectorAll('.apt-service-card').forEach((c) => c.classList.remove('is-selected'));
            const box = document.getElementById('appointment-slots');
            if (box) box.querySelectorAll('.apt-slot').forEach((b) => b.classList.remove('is-selected'));
            const sHint = document.getElementById('apt-slot-hint');
            if (sHint) { sHint.textContent = 'Pick an available time.'; sHint.classList.remove('apt-hint-error'); }
            const dHint = document.getElementById('apt-date-hint');
            if (dHint) { dHint.textContent = 'Choose an available date.'; dHint.classList.remove('apt-hint-error'); }
            renderCalendar();
            loadSlots();
            loadAppointmentsTable();
            checkDeferredRefresh();
        } else {
            toast('error', data.message || 'Failed to book appointment.');
        }
    } catch (e) {
        toast('error', 'Network error booking appointment.');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Book Appointment'; }
    }
}

export function mount(host) {
    render(host);
    loadSlots();
    loadAppointmentsTable();

    if (pollInstance) {
        pollInstance.stop();
    }
    pollInstance = useVersionPoll({
        url: 'api.php?action=versions',
        onChange: handleAppointmentsChange
    });
}
