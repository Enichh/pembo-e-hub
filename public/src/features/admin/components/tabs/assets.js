// features/admin/components/tabs/assets.js
// Admin Asset Overseer slice (SRP: owns ONLY asset/inventory catalog + issue
// + register modals). Renders into host passed to `mount(host)`. Native ESM.

import { get, post, escapeHtml } from '../../../../assets/core.js';
import { toast, pageMeta, pagerHtml, wirePager, PAGE_SIZE } from '../admin-helpers.js';

let assetsRoster = [];
let assetsPage = 1;
let assetsSearchQuery = '';

/**
 * @param {HTMLElement} host
 */
export function mount(host) {
    host.innerHTML = `
        <section class="admin-card-panel" aria-label="Asset & Inventory Overseer">
            <div class="admin-panel-head">
                <div>
                    <h2 class="admin-panel-title">Asset & Inventory Overseer</h2>
                    <div class="admin-panel-sub">Track barangay equipment stock, condition, issuing, and returns.</div>
                </div>
                <button type="button" class="btn btn-primary" id="btn-register-asset">Register New Asset</button>
            </div>

            <div class="admin-filter-bar">
                <input type="text" id="assets-search-input" class="form-control admin-search-input" placeholder="Search by item name, tag, category, or storage location...">
            </div>

            <div id="assets-table-container" class="admin-table-wrap">
                <div style="padding: 24px; text-align: center; color: var(--admin-muted);">Loading inventory catalog...</div>
            </div>
        </section>
    `;

    host.querySelector('#btn-register-asset').addEventListener('click', openRegisterAssetModal);
    const assetSearch = host.querySelector('#assets-search-input');
    assetSearch.addEventListener('input', () => {
        assetsPage = 1;
        renderAssetsPage(assetSearch.value.trim().toLowerCase());
    });

    loadAssetsCatalog();
}

async function loadAssetsCatalog() {
    const container = document.getElementById('assets-table-container');
    if (!container) return;

    try {
        const res = await get('list_assets');
        if (!res.success || !Array.isArray(res.data.assets)) {
            container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Failed to load asset catalog.</div>';
            return;
        }
        assetsRoster = res.data.assets;
        const searchInput = document.getElementById('assets-search-input');
        renderAssetsPage(searchInput ? searchInput.value.trim().toLowerCase() : '');
    } catch (e) {
        console.error('Assets load error:', e);
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--admin-muted);">Error fetching assets.</div>';
    }
}

function renderAssetsPage(query, page) {
    const container = document.getElementById('assets-table-container');
    if (!container) return;
    assetsSearchQuery = query || '';

    const filtered = assetsRoster.filter((a) => {
        if (!assetsSearchQuery) return true;
        const text = (a.name + ' ' + a.asset_tag + ' ' + a.category + ' ' + a.storage_location).toLowerCase();
        return text.includes(assetsSearchQuery);
    });

    if (filtered.length === 0) {
        container.innerHTML = '<table class="admin-table"><thead><tr><th>Asset Tag</th><th>Item Name</th><th>Category</th><th>Available / Total</th><th>Condition</th><th>Storage Location</th><th>Action</th></tr></thead><tbody></tbody></table><div style="padding: 24px; text-align: center; color: var(--admin-muted);">' + (assetsSearchQuery ? 'No inventory assets match your search.' : 'No inventory assets registered yet. Click "Register New Asset" above.') + '</div>';
        return;
    }

    const meta = pageMeta(filtered.length, page || assetsPage);
    assetsPage = meta.cur;
    const rows = filtered.slice((meta.cur - 1) * PAGE_SIZE, meta.cur * PAGE_SIZE);

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr><th>Asset Tag</th><th>Item Name</th><th>Category</th><th>Available / Total</th><th>Condition</th><th>Storage Location</th><th>Action</th></tr>
            </thead>
            <tbody>
                ${rows.map((a) => {
        const avail = Number(a.available_quantity);
        const total = Number(a.total_quantity);
        let condBadge = '<span class="admin-badge-good">' + escapeHtml(a.item_condition) + '</span>';
        if (a.item_condition === 'DAMAGED' || a.item_condition === 'UNDER_MAINTENANCE') {
            condBadge = '<span class="admin-badge-danger">' + escapeHtml(a.item_condition) + '</span>';
        } else if (a.item_condition === 'FAIR') {
            condBadge = '<span class="admin-badge-warn">' + escapeHtml(a.item_condition) + '</span>';
        }
        return `
                        <tr>
                            <td><code>${escapeHtml(a.asset_tag)}</code></td>
                            <td><strong>${escapeHtml(a.name)}</strong></td>
                            <td>${escapeHtml(a.category)}</td>
                            <td><strong>${avail}</strong> / ${total}</td>
                            <td>${condBadge}</td>
                            <td>${escapeHtml(a.storage_location)}</td>
                            <td>
                                <button type="button" class="btn btn-sm btn-primary" data-issue-asset="${escapeHtml(a.id)}" data-asset-name="${escapeHtml(a.name)}" ${avail <= 0 ? 'disabled' : ''}>Issue</button>
                            </td>
                        </tr>`;
    }).join('')}
            </tbody>
        </table>
        ${pagerHtml(filtered.length, meta.cur)}
    `;

    container.querySelectorAll('[data-issue-asset]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-issue-asset');
            const name = btn.getAttribute('data-asset-name');
            openIssueAssetModal(id, name);
        });
    });

    wirePager(container, (next) => renderAssetsPage(assetsSearchQuery, next));
}

function openRegisterAssetModal() {
    const modalId = 'admin-register-asset-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-modal-overlay';
    modal.innerHTML = `
        <div class="admin-modal-content" role="dialog" aria-modal="true">
            <div class="admin-modal-head">
                <h3>Register New Inventory Asset</h3>
                <button type="button" class="admin-modal-close">&times;</button>
            </div>
            <form id="form-register-asset">
                <div class="admin-modal-body">
                    <div class="form-group"><label>Item Name *</label><input type="text" id="asset-name" class="form-control" required placeholder="e.g. Emergency Rescue Tent 10x10"></div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div class="form-group"><label>Category *</label><input type="text" id="asset-category" class="form-control" required placeholder="e.g. Emergency & Relief"></div>
                        <div class="form-group"><label>Total Quantity *</label><input type="number" id="asset-qty" class="form-control" required min="1" value="1"></div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div class="form-group">
                            <label>Item Condition</label>
                            <select id="asset-condition" class="form-control">
                                <option value="GOOD">GOOD</option><option value="NEW">NEW</option><option value="FAIR">FAIR</option><option value="DAMAGED">DAMAGED</option><option value="UNDER_MAINTENANCE">UNDER_MAINTENANCE</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Storage Location *</label><input type="text" id="asset-location" class="form-control" required placeholder="e.g. Supply Room B, 2nd Floor"></div>
                    </div>
                </div>
                <div class="admin-modal-foot">
                    <button type="button" class="btn btn-secondary btn-close-modal">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Asset</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.admin-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.btn-close-modal').addEventListener('click', closeModal);

    const form = document.getElementById('form-register-asset');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const payload = {
            name: document.getElementById('asset-name').value.trim(),
            category: document.getElementById('asset-category').value.trim(),
            total_quantity: Number(document.getElementById('asset-qty').value),
            storage_location: document.getElementById('asset-location').value.trim(),
            item_condition: document.getElementById('asset-condition').value,
        };
        try {
            const res = await window.PemboButton.loading(btn, () => post('create_asset', payload), { loadingLabel: 'Saving…' });
            if (res.success) {
                toast('success', 'Asset registered successfully.');
                closeModal();
                loadAssetsCatalog();
            } else {
                toast('error', res.message || 'Failed to register asset.');
            }
        } catch (err) {
            toast('error', 'Error registering asset.');
        }
    });
}

function openIssueAssetModal(assetId, assetName) {
    const modalId = 'admin-issue-asset-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-modal-overlay';
    modal.innerHTML = `
        <div class="admin-modal-content" role="dialog" aria-modal="true">
            <div class="admin-modal-head">
                <h3>Issue Item: ${escapeHtml(assetName)}</h3>
                <button type="button" class="admin-modal-close">&times;</button>
            </div>
            <form id="form-issue-asset">
                <div class="admin-modal-body">
                    <div class="form-group"><label>Borrower Full Name *</label><input type="text" id="issue-borrower" class="form-control" required placeholder="e.g. Juan Dela Cruz"></div>
                    <div class="form-group"><label>Borrower Contact Number *</label><input type="text" id="issue-contact" class="form-control" required placeholder="e.g. 09171234567"></div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div class="form-group"><label>Quantity to Borrow *</label><input type="number" id="issue-qty" class="form-control" required min="1" value="1"></div>
                        <div class="form-group"><label>Expected Return Date *</label><input type="date" id="issue-return-date" class="form-control" required></div>
                    </div>
                    <div class="form-group"><label>Remarks / Purpose</label><textarea id="issue-remarks" class="form-control" rows="2" placeholder="e.g. Community Event at Zone 3 Plaza"></textarea></div>
                </div>
                <div class="admin-modal-foot">
                    <button type="button" class="btn btn-secondary btn-close-modal">Cancel</button>
                    <button type="submit" class="btn btn-primary">Confirm Issue</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.admin-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.btn-close-modal').addEventListener('click', closeModal);

    const form = document.getElementById('form-issue-asset');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const payload = {
            asset_id: assetId,
            borrower_name: document.getElementById('issue-borrower').value.trim(),
            borrower_contact: document.getElementById('issue-contact').value.trim(),
            quantity_borrowed: Number(document.getElementById('issue-qty').value),
            expected_return_date: document.getElementById('issue-return-date').value,
            remarks: document.getElementById('issue-remarks').value.trim(),
        };
        try {
            const res = await window.PemboButton.loading(btn, () => post('issue_asset', payload), { loadingLabel: 'Issuing…' });
            if (res.success) {
                toast('success', 'Asset issued successfully.');
                closeModal();
                loadAssetsCatalog();
            } else {
                toast('error', res.message || 'Failed to issue asset.');
            }
        } catch (err) {
            toast('error', 'Error issuing asset.');
        }
    });
}
