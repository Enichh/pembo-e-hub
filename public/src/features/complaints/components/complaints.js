// features/complaints/components/complaints.js
// Complaints & Incidents slice (SRP: owns ONLY complaint filing + history/queue).
// Renders into a host passed to `mount(host)`. Residents see a filing form +
// their own history; staff/admin see a triage queue.

// Matches ComplaintsService::INCIDENT_TYPES (free-text categories).
const INCIDENT_TYPES = [
    'Noise Disturbance',
    'Peace & Order',
    'Solid Waste',
    'Boundary Dispute',
    'Harassment',
    'Other',
];

// Matches ComplaintsService::ALLOWED_STATUSES.
const STATUSES = [
    'FILED',
    'UNDER_INVESTIGATION',
    'HEARING_SCHEDULED',
    'RESOLVED',
    'DISMISSED',
];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

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

function role() {
    return window.currentUserRole || '';
}

function isStaff() {
    const r = role().toUpperCase();
    return r === 'STAFF' || r === 'ADMIN';
}

function render(host) {
    // Same shell either way; the inner content differs by role.
    host.innerHTML = `
        <div class="cmp">
            <div class="cmp-intro">
                <h1>Complaints &amp; Incidents</h1>
                <p>Report a community concern or incident. Your complaint is recorded with your name on file.</p>
            </div>
            <div id="cmp-content"><div class="state-box">Loading…</div></div>
        </div>
    `;

    if (isStaff()) {
        loadStaffQueue();
    } else {
        renderResidentForm();
        loadMyComplaints();
    }
}

/* ---------------- Resident: filing form ---------------- */
function renderResidentForm() {
    const content = document.getElementById('cmp-content');
    if (!content) return;

    const typeOptions = INCIDENT_TYPES.map((t) =>
        '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>'
    ).join('');

    content.innerHTML = `
        <section class="cmp-card">
            <div class="cmp-section-head"><h2>File a Complaint</h2></div>
            <form id="cmp-form" novalidate>
                <div class="cmp-form-grid">
                    <div class="form-group">
                        <label for="cmp-incident-type">Incident type *</label>
                        <select id="cmp-incident-type" class="form-control" required>
                            <option value="">-- Select type --</option>
                            ${typeOptions}
                        </select>
                        <p class="field-hint" id="cmp-incident-type-hint"></p>
                    </div>
                    <div class="form-group cmp-date-group">
                        <label>When did it happen? *</label>
                        <div id="cmp-incident-date-calendar" class="bd-calendar" role="application" aria-label="Choose the incident date"></div>
                        <input type="time" id="cmp-incident-time" class="form-control cmp-time" aria-label="Time of incident">
                        <input type="hidden" id="cmp-incident-date" autocomplete="off" aria-describedby="cmp-incident-date-hint">
                        <p class="field-hint" id="cmp-incident-date-hint"></p>
                    </div>
                    <div class="form-group full">
                        <label for="cmp-incident-location">Where did it happen? *</label>
                        <input type="text" id="cmp-incident-location" class="form-control" placeholder="e.g. Block 4, Sampaguita St." required>
                        <p class="field-hint" id="cmp-incident-location-hint"></p>
                    </div>
                    <div class="form-group full">
                        <label for="cmp-narrative">What happened? *</label>
                        <textarea id="cmp-narrative" class="form-control" rows="4" placeholder="Describe the incident in your own words." required></textarea>
                        <p class="field-hint" id="cmp-narrative-hint"></p>
                    </div>
                </div>
                <button type="submit" class="cmp-submit" id="cmp-submit">Submit Complaint</button>
                <div class="cmp-alert" id="cmp-alert" role="status"></div>
            </form>
        </section>

        <section class="cmp-card">
            <div class="cmp-section-head"><h2>My Complaints</h2></div>
            <div id="cmp-history"></div>
        </section>
    `;

    document.getElementById('cmp-form').addEventListener('submit', handleCreate);
    wireLiveValidation();

    // Mount the custom incident-date calendar (past-only, no lower bound).
    if (window.PemboBirthdateCalendar) {
        window.PemboBirthdateCalendar.mount({
            mountId: 'cmp-incident-date-calendar',
            hiddenInputId: 'cmp-incident-date',
            hintId: 'cmp-incident-date-hint',
            pastOnly: true,
        });
    }
}

// Clear per-field errors as the user corrects them.
function wireLiveValidation() {
    const pairs = [
        ['cmp-incident-type', 'cmp-incident-type-hint'],
        ['cmp-incident-location', 'cmp-incident-location-hint'],
        ['cmp-narrative', 'cmp-narrative-hint'],
    ];

    // The incident time is a separate input next to the calendar.
    const timeEl = document.getElementById('cmp-incident-time');
    if (timeEl) {
        timeEl.addEventListener('input', () => {
            const hint = document.getElementById('cmp-incident-date-hint');
            if (hint && hint.classList.contains('field-hint-error')) {
                hint.classList.remove('field-hint-error');
            }
        });
    }
    pairs.forEach(([inputId, hintId]) => {
        const el = document.getElementById(inputId);
        const hint = document.getElementById(hintId);
        if (el) {
            const evt = el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(evt, () => {
                if (el.classList.contains('field-invalid')) clearFieldError(el, hint);
            });
        }
    });
}

function setFieldError(input, hintEl, message) {
    input.classList.add('field-invalid');
    if (hintEl) {
        hintEl.textContent = message;
        hintEl.classList.add('field-hint-error');
    }
}

function clearFieldError(input, hintEl, okText) {
    input.classList.remove('field-invalid');
    if (hintEl) {
        hintEl.textContent = okText || '';
        hintEl.classList.remove('field-hint-error');
    }
}

// Client-side validation mirroring ComplaintsService::create.
function validateComplaintForm() {
    const type = document.getElementById('cmp-incident-type');
    const date = document.getElementById('cmp-incident-date');
    const location = document.getElementById('cmp-incident-location');
    const narrative = document.getElementById('cmp-narrative');

    let valid = true;

    if (!type.value) {
        setFieldError(type, document.getElementById('cmp-incident-type-hint'), 'Please select the incident type.');
        valid = false;
    } else {
        clearFieldError(type, document.getElementById('cmp-incident-type-hint'));
    }

    // Incident date (custom calendar) + time.
    const time = document.getElementById('cmp-incident-time');
    const dateHint = document.getElementById('cmp-incident-date-hint');
    if (!date.value) {
        if (dateHint) { dateHint.textContent = 'Incident date is required.'; dateHint.classList.add('field-hint-error'); }
        valid = false;
    } else if (!time.value) {
        if (dateHint) { dateHint.textContent = 'Please choose a time of the incident.'; dateHint.classList.add('field-hint-error'); }
        valid = false;
    } else {
        if (dateHint) dateHint.classList.remove('field-hint-error');
    }

    if (!location.value.trim()) {
        setFieldError(location, document.getElementById('cmp-incident-location-hint'), 'Incident location is required.');
        valid = false;
    } else {
        clearFieldError(location, document.getElementById('cmp-incident-location-hint'));
    }

    if (!narrative.value.trim()) {
        setFieldError(narrative, document.getElementById('cmp-narrative-hint'), 'Please describe what happened.');
        valid = false;
    } else {
        clearFieldError(narrative, document.getElementById('cmp-narrative-hint'));
    }

    return valid;
}

async function handleCreate(e) {
    e.preventDefault();
    const alertEl = document.getElementById('cmp-alert');
    alertEl.className = 'cmp-alert';

    if (!validateComplaintForm()) {
        alertEl.textContent = 'Please fix the highlighted fields and try again.';
        alertEl.className = 'cmp-alert is-visible is-error';
        return;
    }

    const payload = {
        incident_type: val('cmp-incident-type'),
        incident_date: buildIncidentDate(),
        incident_location: val('cmp-incident-location'),
        narrative_details: val('cmp-narrative'),
    };

    const submit = document.getElementById('cmp-submit');

    try {
        const data = await window.PemboButton.loading(submit, async () => {
            const res = await fetch('api.php?action=create_complaint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
                body: JSON.stringify(payload),
            });
            return res.json();
        }, { loadingLabel: 'Submitting…' });

        if (data.success) {
            alertEl.textContent = 'Complaint filed. Reference: ' + data.data.complaint_number;
            alertEl.className = 'cmp-alert is-visible is-success';
            document.getElementById('cmp-form').reset();
            loadMyComplaints();
        } else {
            alertEl.textContent = data.message || 'Failed to file complaint.';
            alertEl.className = 'cmp-alert is-visible is-error';
        }
    } catch (err) {
        alertEl.textContent = 'Network error. Please try again.';
        alertEl.className = 'cmp-alert is-visible is-error';
    }
}

async function loadMyComplaints() {
    const host = document.getElementById('cmp-history');
    if (!host) return;
    try {
        const res = await fetch('api.php?action=list_my_complaints');
        const data = await res.json();
        if (!data.success) { host.innerHTML = '<div class="state-box">Failed to load complaints.</div>'; return; }
        const rows = data.data || [];
        if (rows.length === 0) {
            host.innerHTML = '<div class="state-box"><div class="state-box-title">No complaints yet</div><div class="state-box-sub">Your filed complaints will appear here.</div></div>';
            return;
        }
        host.innerHTML = rows.map(recordMarkup).join('');
    } catch (e) {
        host.innerHTML = '<div class="state-box">Error loading complaints.</div>';
    }
}

function recordMarkup(r) {
    const statusCls = (r.status || 'FILED').toUpperCase();
    return '<article class="cmp-record">'
        + '<div class="cmp-record-top"><span class="cmp-record-title">' + escapeHtml(r.complaint_number) + '</span>'
        + '<span class="cmp-status-pill cmp-status-' + statusCls + '">' + escapeHtml(statusCls.replace(/_/g, ' ')) + '</span></div>'
        + '<div class="cmp-record-meta">' + escapeHtml(r.incident_type) + ' · ' + escapeHtml(r.created_at) + '</div>'
        + '</article>';
}

/* ---------------- Staff/admin: triage queue ---------------- */
async function loadStaffQueue() {
    const content = document.getElementById('cmp-content');
    if (!content) return;
    content.innerHTML = '<div class="state-box">Loading queue…</div>';

    try {
        const [queueRes, officerRes] = await Promise.all([
            fetch('api.php?action=list_all_complaints'),
            fetch('api.php?action=list_officers'),
        ]);
        const queueData = await queueRes.json();
        const officerData = await officerRes.json();

        if (!queueData.success) {
            content.innerHTML = '<div class="state-box">' + escapeHtml(queueData.message || 'Failed to load queue.') + '</div>';
            return;
        }
        const officers = officerData.success && officerData.data ? officerData.data : [];
        const rows = queueData.data || [];

        const officerOptions = officers.map((o) =>
            '<option value="' + escapeHtml(o.id) + '">' + escapeHtml(o.email) + '</option>'
        ).join('');
        const statusOptions = STATUSES.map((s) =>
            '<option value="' + s + '">' + escapeHtml(s.replace(/_/g, ' ')) + '</option>'
        ).join('');

        if (rows.length === 0) {
            content.innerHTML = '<section class="cmp-card"><div class="state-box"><div class="state-box-title">No complaints</div><div class="state-box-sub">No complaints have been filed yet.</div></div></section>';
            return;
        }

        content.innerHTML = rows.map((c) => staffRecordMarkup(c, officerOptions, statusOptions)).join('');
        wireStaffActions();
    } catch (e) {
        content.innerHTML = '<div class="state-box">Error loading the complaint queue.</div>';
    }
}

function staffRecordMarkup(c, officerOptions, statusOptions) {
    const statusCls = (c.status || 'FILED').toUpperCase();
    const officerSel = (c.assigned_officer_id || '');

    // Emit officer options with the currently-assigned one pre-selected.
    const officerOpts = officerOptions.replace(
        'value="' + officerSel + '"',
        'value="' + officerSel + '" selected'
    );

    return '<section class="cmp-card" data-complaint-id="' + escapeHtml(c.id) + '">'
        + '<div class="cmp-section-head"><h2>' + escapeHtml(c.complaint_number) + '</h2>'
        + '<span class="cmp-status-pill cmp-status-' + statusCls + '">' + escapeHtml(statusCls.replace(/_/g, ' ')) + '</span></div>'
        + '<div class="cmp-record-meta" style="margin-bottom:8px;">'
        + escapeHtml(c.incident_type) + ' · Resident: ' + escapeHtml(c.resident_email)
        + ' · ' + escapeHtml(c.incident_date) + '</div>'
        + '<div class="cmp-record-meta">' + escapeHtml(c.incident_location) + '</div>'
        + '<p class="cmp-hint" style="white-space:pre-wrap;">' + escapeHtml(c.narrative_details) + '</p>'
        + '<div class="cmp-action-row" style="margin-top:12px;">'
        + '<div class="form-group"><label>Assign officer</label><select class="form-control cmp-officer">'
        + '<option value="">— None —</option>' + officerOpts + '</select></div>'
        + '<div class="form-group"><label>Status</label><select class="form-control cmp-new-status">'
        + statusOptions.replace('value="' + statusCls + '"', 'value="' + statusCls + '" selected')
        + '</select></div>'
        + '<button type="button" class="btn" style="padding:10px 16px;">Update</button></div>'
        + '</section>';
}

function wireStaffActions() {
    document.querySelectorAll('.cmp-card[data-complaint-id]').forEach((card) => {
        const btn = card.querySelector('button');
        btn.addEventListener('click', async () => {
            const id = card.getAttribute('data-complaint-id');
            const officer = card.querySelector('.cmp-officer').value;
            const status = card.querySelector('.cmp-new-status').value;

            try {
                const data = await window.PemboButton.loading(btn, async () => {
                    const res = await fetch('api.php?action=update_complaint_status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
                        body: JSON.stringify({
                            complaint_id: id,
                            status: status,
                            assigned_officer_id: officer || null,
                        }),
                    });
                    return res.json();
                }, { loadingLabel: 'Saving…' });

                if (data.success) {
                    loadStaffQueue();
                } else {
                    toast('error', data.message || 'Failed to update.');
                }
            } catch (e) {
                toast('error', 'Network error.');
            }
        });
    });
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

// Combine the calendar date + time input into a datetime-local string
// (e.g. 'YYYY-MM-DDTHH:MM' — matches ComplaintsService::create's parse).
function buildIncidentDate() {
    const date = val('cmp-incident-date');
    const time = val('cmp-incident-time');
    if (!date || !time) return '';
    return date + 'T' + time;
}

export function mount(host) {
    window.currentUserRole = window.currentUserRole || '';
    render(host);
}
