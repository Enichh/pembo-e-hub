// features/profile/components/profile.js
// Profile slice (SRP: owns ONLY the resident profile display + edit).
// Renders the resident's full profile (demographics, contact, voter status)
// into a host passed to `mount(host)`, with a read-only summary and an editable
// form. Fetches data from api.php?action=get_profile and saves via update_profile.

const GENDERS = ['Male', 'Female', 'Other'];
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

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

function initials(profile) {
    const first = (profile.first_name || '').charAt(0);
    const last = (profile.last_name || '').charAt(0);
    return (first + last).toUpperCase() || '?';
}

function fullName(profile) {
    const parts = [
        profile.first_name,
        profile.middle_name,
        profile.last_name,
        profile.suffix,
    ].filter((p) => p && p.trim() !== '');
    return parts.join(' ') || '—';
}

function render(host) {
    host.innerHTML = `
        <div class="prof">
            <div class="prof-intro">
                <h1>My Profile</h1>
                <p>Your personal details on file with Barangay Pembo. Update anything that has changed.</p>
            </div>
            <div id="prof-content"><div class="state-box">Loading your profile…</div></div>
        </div>
    `;

    loadProfile();
}

async function loadProfile() {
    const content = document.getElementById('prof-content');
    if (!content) return;

    try {
        const res = await fetch('api.php?action=get_profile');
        const data = await res.json();
        if (!data.success || !data.data) {
            content.innerHTML = '<div class="state-box">' + escapeHtml(data.message || 'Failed to load profile.') + '</div>';
            return;
        }
        content.innerHTML = buildMarkup(data.data);
        wireForm(data.data);
    } catch (e) {
        content.innerHTML = '<div class="state-box">Could not load your profile. Please try again.</div>';
    }
}

function optionList(allowlist, selected) {
    return allowlist.map((v) => {
        const sel = v === selected ? ' selected' : '';
        return '<option value="' + escapeHtml(v) + '"' + sel + '>' + escapeHtml(v) + '</option>';
    }).join('');
}

function buildMarkup(profile) {
    const genderOptions = optionList(GENDERS, profile.gender);
    const civOptions = optionList(CIVIL_STATUSES, profile.civil_status);

    const contact = profile.contact_number || '';
    const contactDisplay = contact ? escapeHtml(contact) : '<span class="prof-field-value is-empty">Not provided</span>';

    return `
        <section class="prof-card">
            <div class="prof-section-head"><h2>Account</h2></div>
            <div class="prof-id-row">
                <div class="prof-avatar" aria-hidden="true">${escapeHtml(initials(profile))}</div>
                <div>
                    <div class="prof-avatar-name">${escapeHtml(fullName(profile))}</div>
                    <div class="prof-avatar-sub">${escapeHtml(profile.email || '')}</div>
                </div>
            </div>
            <div class="prof-field">
                <span class="prof-field-label">Contact number</span>
                <span class="prof-field-value">${contactDisplay}</span>
            </div>
            <div class="prof-field">
                <span class="prof-field-label">Member since</span>
                <span class="prof-field-value">${escapeHtml(formatDate(profile.created_at))}</span>
            </div>
        </section>

        <section class="prof-card">
            <div class="prof-section-head"><h2>Edit Details</h2></div>
            <form id="prof-form" novalidate>
                <div class="prof-form-grid">
                    <div class="form-group">
                        <label for="prof-first-name">First name <span style="color:var(--prof-danger)">*</span></label>
                        <input type="text" id="prof-first-name" class="form-control" value="${escapeHtml(profile.first_name || '')}" required>
                    </div>
                    <div class="form-group">
                        <label for="prof-last-name">Last name <span style="color:var(--prof-danger)">*</span></label>
                        <input type="text" id="prof-last-name" class="form-control" value="${escapeHtml(profile.last_name || '')}" required>
                    </div>
                    <div class="form-group">
                        <label for="prof-middle-name">Middle name</label>
                        <input type="text" id="prof-middle-name" class="form-control" value="${escapeHtml(profile.middle_name || '')}">
                    </div>
                    <div class="form-group">
                        <label for="prof-suffix">Suffix</label>
                        <input type="text" id="prof-suffix" class="form-control" placeholder="e.g. Jr., Sr., III" value="${escapeHtml(profile.suffix || '')}">
                    </div>
                    <div class="form-group">
                        <label for="prof-gender">Gender <span style="color:var(--prof-danger)">*</span></label>
                        <select id="prof-gender" class="form-control" required>
                            <option value="">-- Select --</option>
                            ${genderOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="prof-civil-status">Civil status <span style="color:var(--prof-danger)">*</span></label>
                        <select id="prof-civil-status" class="form-control" required>
                            <option value="">-- Select --</option>
                            ${civOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="prof-contact-number">Contact number</label>
                        <input type="text" id="prof-contact-number" class="form-control" placeholder="e.g. 0917 123 4567" value="${escapeHtml(profile.contact_number || '')}">
                    </div>
                    <div class="form-group prof-birthdate-group">
                        <label>Birthdate <span style="color:var(--prof-danger)">*</span></label>
                        <div id="prof-birthdate-calendar" class="bd-calendar" role="application" aria-label="Choose your birthdate"></div>
                        <input type="hidden" id="prof-birthdate" autocomplete="bday" aria-describedby="prof-birthdate-hint">
                        <p id="prof-birthdate-hint" class="field-hint"></p>
                    </div>
                    <div class="form-group full">
                        <label for="prof-street-address">Complete address <span style="color:var(--prof-danger)">*</span></label>
                        <textarea id="prof-street-address" class="form-control" rows="2" required>${escapeHtml(profile.street_address || '')}</textarea>
                    </div>
                </div>
                <div class="prof-actions">
                    <button type="button" class="btn btn-secondary" id="prof-cancel">Cancel</button>
                    <button type="submit" class="prof-submit" id="prof-submit">Save Changes</button>
                </div>
                <div class="prof-alert" id="prof-alert" role="status"></div>
            </form>
        </section>
    `;
}

function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return escapeHtml(String(value));
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
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

// Client-side validation mirroring ProfileService::updateResidentProfile.
function validateProfileForm() {
    const first = document.getElementById('prof-first-name');
    const last = document.getElementById('prof-last-name');
    const gender = document.getElementById('prof-gender');
    const civil = document.getElementById('prof-civil-status');
    const address = document.getElementById('prof-street-address');
    const contact = document.getElementById('prof-contact-number');

    let valid = true;

    if (!first.value.trim()) {
        setFieldError(first, null, 'First name is required.');
        valid = false;
    } else {
        clearFieldError(first, null);
    }

    if (!last.value.trim()) {
        setFieldError(last, null, 'Last name is required.');
        valid = false;
    } else {
        clearFieldError(last, null);
    }

    if (!gender.value) {
        setFieldError(gender, null, 'Please select your gender.');
        valid = false;
    } else {
        clearFieldError(gender, null);
    }

    if (!civil.value) {
        setFieldError(civil, null, 'Please select your civil status.');
        valid = false;
    } else {
        clearFieldError(civil, null);
    }

    if (!address.value.trim()) {
        setFieldError(address, null, 'Complete address is required.');
        valid = false;
    } else {
        clearFieldError(address, null);
    }

    if (contact.value.trim() !== '' && !/^[0-9+\-\s()]{7,20}$/.test(contact.value.trim())) {
        setFieldError(contact, null, 'Contact number contains invalid characters.');
        valid = false;
    } else {
        clearFieldError(contact, null);
    }

    // Birthdate via the shared calendar.
    const bdHint = document.getElementById('prof-birthdate-hint');
    const bdHidden = document.getElementById('prof-birthdate');
    const bdError = window.PemboBirthdateCalendar
        ? window.PemboBirthdateCalendar.validateError('prof-birthdate-calendar')
        : '';
    if (!bdHidden.value) {
        if (bdHint) { bdHint.textContent = 'Birthdate is required.'; bdHint.classList.add('field-hint-error'); }
        valid = false;
    } else if (bdError !== '') {
        if (bdHint) { bdHint.textContent = bdError; bdHint.classList.add('field-hint-error'); }
        valid = false;
    } else if (bdHint) {
        bdHint.classList.remove('field-hint-error');
    }

    return valid;
}

function wireForm(original) {
    const form = document.getElementById('prof-form');
    const cancel = document.getElementById('prof-cancel');
    if (!form) return;

    // Mount the birthdate calendar (collapsible) with the current value preselected.
    if (window.PemboBirthdateCalendar) {
        window.PemboBirthdateCalendar.mount({
            mountId: 'prof-birthdate-calendar',
            hiddenInputId: 'prof-birthdate',
            hintId: 'prof-birthdate-hint',
            value: original.birthdate || '',
            collapsible: true,
            label: 'Choose your birthdate',
        });
    }

    function setAlert(msg, ok) {
        const el = document.getElementById('prof-alert');
        if (!el) return;
        el.textContent = msg;
        el.className = 'prof-alert is-visible ' + (ok ? 'is-success' : 'is-error');
    }

    function clearAlert() {
        const el = document.getElementById('prof-alert');
        if (el) el.className = 'prof-alert';
    }

    // Cancel = restore the original values into the form (no reload needed).
    cancel.addEventListener('click', () => {
        setField('prof-first-name', original.first_name);
        setField('prof-last-name', original.last_name);
        setField('prof-middle-name', original.middle_name);
        setField('prof-suffix', original.suffix);
        setField('prof-contact-number', original.contact_number);
        setField('prof-gender', original.gender);
        setField('prof-civil-status', original.civil_status);
        setField('prof-street-address', original.street_address);
        // Re-mount the calendar with the original (saved) birthdate.
        if (window.PemboBirthdateCalendar) {
            window.PemboBirthdateCalendar.mount({
                mountId: 'prof-birthdate-calendar',
                hiddenInputId: 'prof-birthdate',
                hintId: 'prof-birthdate-hint',
                value: original.birthdate || '',
                collapsible: true,
                label: 'Choose your birthdate',
            });
        }
        clearAlert();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        if (!validateProfileForm()) {
            setAlert('Please fix the highlighted fields and try again.', false);
            return;
        }

        const payload = {
            first_name: val('prof-first-name'),
            middle_name: val('prof-middle-name'),
            last_name: val('prof-last-name'),
            suffix: val('prof-suffix'),
            birthdate: val('prof-birthdate'),
            gender: val('prof-gender'),
            civil_status: val('prof-civil-status'),
            contact_number: val('prof-contact-number'),
            street_address: val('prof-street-address'),
        };

        const submit = document.getElementById('prof-submit');

        try {
            const data = await window.PemboButton.loading(submit, async () => {
                const res = await fetch('api.php?action=update_profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
                    body: JSON.stringify(payload),
                });
                return res.json();
            }, { loadingLabel: 'Saving…' });

            if (data.success) {
                setAlert('Profile updated successfully.', true);
                // Refresh the read-only summary in place without a full reload.
                const content = document.getElementById('prof-content');
                if (data.data && content) {
                    content.innerHTML = buildMarkup(data.data);
                    wireForm(data.data);
                }
            } else {
                setAlert(data.message || 'Failed to update profile.', false);
            }
        } catch (err) {
            setAlert('Network error. Please try again.', false);
        }
    });
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function setField(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

export function mount(host) {
    render(host);
}
