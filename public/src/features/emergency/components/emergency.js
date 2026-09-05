// features/emergency/components/emergency.js
// Emergency SOS slice (SRP: owns ONLY the resident SOS trigger + history).
// Renders into a host passed to `mount(host)`.
//
// Location capture is ONE-TIME (not real-time): we use
// navigator.geolocation.getCurrentPosition() a single time on trigger, show the
// captured coordinates in a confirmation modal, and require the user to accept
// a legal disclaimer before the report is ever sent to the backend.


const EMERGENCY_TYPES = [
    { value: 'MEDICAL', label: 'Medical emergency' },
    { value: 'FIRE', label: 'Fire' },
    { value: 'POLICE_SECURITY', label: 'Police / Security' },
    { value: 'NATURAL_DISASTER', label: 'Natural disaster' },
    { value: 'OTHER', label: 'Other' },
];

// Keep the pending trigger in memory between capture and confirmation.
let pending = null;

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

function currentUser() {
    return window.currentUser || null;
}

function render(host) {
    const typeOptions = EMERGENCY_TYPES.map((t) =>
        '<option value="' + t.value + '">' + escapeHtml(t.label) + '</option>'
    ).join('');

    host.innerHTML = `
        <section class="card">
            <h2>Emergency SOS</h2>
            <p class="muted">Send your current location to the Barangay emergency response team. Use this only in a real emergency.</p>
            <form id="sos-form">
                <div class="form-group">
                    <label for="sos-type">Type of emergency</label>
                    <select id="sos-type" required>
                        <option value="">-- Select type --</option>
                        ${typeOptions}
                    </select>
                </div>
                <div class="form-group">
                    <span id="sos-location-status" class="muted">Location: not yet captured.</span>
                </div>
                <button type="submit" class="btn btn-danger" id="sos-submit">Send Emergency Alert</button>
            </form>
        </section>

        <section class="card">
            <h2>My Emergency Reports</h2>
            <div id="sos-history" class="record-list"></div>
        </section>

        <div id="sos-confirm-modal" class="modal-backdrop" aria-hidden="true"></div>
    `;

    document.getElementById('sos-form').addEventListener('submit', handleTrigger);
    loadHistory();
}

function handleTrigger(e) {
    e.preventDefault();
    const type = document.getElementById('sos-type').value;
    if (!type) { toast('error', 'Please select the type of emergency.'); return; }

    if (!navigator.geolocation) {
        toast('error', 'Your device does not support location capture.');
        return;
    }

    const statusEl = document.getElementById('sos-location-status');
    if (statusEl) statusEl.textContent = 'Capturing your location…';

    // ONE-TIME capture. maximumAge: 0 forces a fresh fix; no watchPosition.
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = pos.coords.accuracy || null;

            if (statusEl) statusEl.textContent = 'Location captured. Review and confirm below.';

            pending = { type, latitude: lat, longitude: lng, accuracy_meters: accuracy };
            openConfirmModal(pending);
        },
        (err) => {
            if (statusEl) statusEl.textContent = 'Location: not yet captured.';
            toast('error', 'Location could not be captured. Please allow location access and try again.');
            console.error('Geolocation error:', err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function openConfirmModal(data) {
    const modal = document.getElementById('sos-confirm-modal');
    if (!modal) return;

    const user = currentUser();
    const email = user ? user.email : 'your registered account';
    const typeLabel = (EMERGENCY_TYPES.find((t) => t.value === data.type) || {}).label || data.type;

    modal.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="sos-modal-title">
            <h2 id="sos-modal-title" class="modal-title">Confirm Emergency Report</h2>

            <div class="sos-confirm-summary">
                <div class="sos-confirm-row"><span>Emergency type</span><strong>${escapeHtml(typeLabel)}</strong></div>
                <div class="sos-confirm-row"><span>Latitude</span><strong>${data.latitude.toFixed(6)}</strong></div>
                <div class="sos-confirm-row"><span>Longitude</span><strong>${data.longitude.toFixed(6)}</strong></div>
                <div class="sos-confirm-row"><span>Location accuracy</span><strong>${data.accuracy_meters ? '± ' + Math.round(data.accuracy_meters) + ' m' : 'Unavailable'}</strong></div>
                <div class="sos-confirm-row"><span>Account</span><strong>${escapeHtml(email)}</strong></div>
            </div>

            <div class="sos-disclaimer" role="note">
                <strong>Important: false reports are a crime.</strong>
                Filing a false or malicious emergency report is punishable under
                <em>Presidential Decree No. 1727</em> — by imprisonment of up to
                <strong>five (5) years</strong>, a fine of up to
                <strong>₱40,000.00</strong>, or both. Your name and credentials
                are on record with this report and will be provided to
                authorities if necessary.
            </div>

            <label class="sos-ack">
                <input type="checkbox" id="sos-ack-checkbox">
                <span>I confirm this is a genuine emergency and I accept that false reports are prohibited by law.</span>
            </label>

            <div class="sos-modal-actions">
                <button type="button" class="btn btn-secondary" id="sos-confirm-cancel">Cancel</button>
                <button type="button" class="btn btn-danger" id="sos-confirm-send" disabled>Confirm &amp; Send</button>
            </div>
        </div>
    `;

    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';

    const checkbox = document.getElementById('sos-ack-checkbox');
    const sendBtn = document.getElementById('sos-confirm-send');

    checkbox.addEventListener('change', () => {
        sendBtn.disabled = !checkbox.checked;
    });

    document.getElementById('sos-confirm-cancel').addEventListener('click', closeConfirmModal);
    sendBtn.addEventListener('click', async () => {
        if (!checkbox.checked) return;
        // Keep the modal open while sending so the user sees a clear pending
        // state on the button instead of being left blind.
        try {
            await window.PemboButton.loading(sendBtn, () => sendSos(data), { loadingLabel: 'Sending…' });
        } catch (e) {
            /* toast already handled in sendSos */
        }
    });
}

function closeConfirmModal() {
    const modal = document.getElementById('sos-confirm-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '';
    pending = null;
}

async function sendSos(data) {
    const statusEl = document.getElementById('sos-location-status');
    if (statusEl) statusEl.textContent = 'Sending…';

    try {
        const res = await fetch('api.php?action=trigger_sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
            body: JSON.stringify({
                emergency_type: data.type,
                latitude: data.latitude,
                longitude: data.longitude,
                accuracy_meters: data.accuracy_meters,
            }),
        });
        const result = await res.json();
        if (result.success) {
            toast('success', 'Your emergency alert has been sent.', {
                title: 'Emergency sent',
                code: result.data.sos_code,
            });
            document.getElementById('sos-form').reset();
            if (statusEl) statusEl.textContent = 'Location: not yet captured.';
            closeConfirmModal();
            loadHistory();
        } else {
            toast('error', result.message || 'Failed to send alert.');
            if (statusEl) statusEl.textContent = 'Location captured. Review and confirm below.';
        }
    } catch (e) {
        toast('error', 'Network error sending alert. Please try again.');
        if (statusEl) statusEl.textContent = 'Location captured. Review and confirm below.';
    }
}

async function loadHistory() {
    const host = document.getElementById('sos-history');
    if (!host) return;
    try {
        const res = await fetch('api.php?action=list_my_sos');
        const data = await res.json();
        if (!data.success) { host.innerHTML = '<div class="state-box">Failed to load reports.</div>'; return; }
        const rows = data.data || [];
        if (rows.length === 0) {
            host.innerHTML = '<div class="state-box"><div class="state-box-title">No emergency reports</div><div class="state-box-sub">Your alerts will appear here.</div></div>';
            return;
        }
        host.innerHTML = rows.map((r) =>
            '<article class="record-item"><div class="record-item-top">'
            + '<span class="record-item-title">' + escapeHtml(r.emergency_type) + '</span>'
            + '<span class="status-pill status-pill-' + (r.status || '').toLowerCase() + '">' + escapeHtml(r.status) + '</span>'
            + '</div><div class="record-item-meta"><span>' + escapeHtml(r.sos_code) + '</span><span>' + escapeHtml(r.created_at) + '</span></div></article>'
        ).join('');
    } catch (e) {
        host.innerHTML = '<div class="state-box">Error loading reports.</div>';
    }
}

export function mount(host) {
    render(host);
}
