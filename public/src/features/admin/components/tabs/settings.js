// features/admin/components/tabs/settings.js
// Admin System Settings slice (SRP: owns ONLY platform settings form).
// Renders into host passed to `mount(host)`. Native ESM.

import { get, post } from '../../../../assets/core.js';
import { toast } from '../admin-helpers.js';

/**
 * @param {HTMLElement} host
 */
export function mount(host) {
    host.innerHTML = `
        <section class="admin-card-panel" aria-label="System Settings">
            <div class="admin-panel-head">
                <div>
                    <h2 class="admin-panel-title">Platform System Settings</h2>
                    <div class="admin-panel-sub">Modify barangay hall operating parameters dynamically without modifying code.</div>
                </div>
            </div>

            <form id="form-system-settings">
                <div class="admin-settings-grid">
                    <div class="form-group">
                        <label>Barangay Operating Hours</label>
                        <input type="text" id="set-office-hours" class="form-control" required placeholder="Monday - Friday: 8:00 AM - 5:00 PM">
                    </div>
                    <div class="form-group">
                        <label>Emergency Dispatch Hotline</label>
                        <input type="text" id="set-hotline" class="form-control" required placeholder="8888-PEMBO / 0917-123-4567">
                    </div>
                    <div class="form-group">
                        <label>Standard Document Clearance Fee (PHP)</label>
                        <input type="text" id="set-fee" class="form-control" required placeholder="50.00">
                    </div>
                    <div class="form-group">
                        <label>Maintenance Mode Toggle</label>
                        <select id="set-maintenance" class="form-control">
                            <option value="0">Disabled (Normal Operations)</option>
                            <option value="1">Enabled (System Maintenance)</option>
                        </select>
                    </div>
                </div>
                <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
                    <button type="submit" class="btn btn-primary" id="btn-save-settings">Save Platform Settings</button>
                </div>
            </form>
        </section>
    `;

    loadSystemSettings();

    const form = host.querySelector('#form-system-settings');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = host.querySelector('#btn-save-settings');

        const settings = {
            office_hours: host.querySelector('#set-office-hours').value.trim(),
            emergency_hotline: host.querySelector('#set-hotline').value.trim(),
            standard_clearance_fee: host.querySelector('#set-fee').value.trim(),
            maintenance_mode: host.querySelector('#set-maintenance').value,
        };

        try {
            const res = await window.PemboButton.loading(btn, () => post('update_system_settings', { settings }), { loadingLabel: 'Saving…' });
            if (res.success) {
                toast('success', 'Platform system settings updated successfully.');
            } else {
                toast('error', res.message || 'Failed to update system settings.');
            }
        } catch (err) {
            toast('error', 'Error updating system settings.');
        }
    });
}

async function loadSystemSettings() {
    try {
        const res = await get('get_system_settings');
        if (!res.success || !res.data.settings) return;
        const s = res.data.settings;
        if (s.office_hours && document.getElementById('set-office-hours')) document.getElementById('set-office-hours').value = s.office_hours.value || '';
        if (s.emergency_hotline && document.getElementById('set-hotline')) document.getElementById('set-hotline').value = s.emergency_hotline.value || '';
        if (s.standard_clearance_fee && document.getElementById('set-fee')) document.getElementById('set-fee').value = s.standard_clearance_fee.value || '';
        if (s.maintenance_mode && document.getElementById('set-maintenance')) document.getElementById('set-maintenance').value = s.maintenance_mode.value || '0';
    } catch (e) {
        console.error('Settings load error:', e);
    }
}
