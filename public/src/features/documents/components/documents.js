// src/features/documents/components/documents.js
// Documents slice (SRP: this file owns ONLY the documents feature). It renders
// its own structure into a host element passed to `mount(host)`, and wires its
// own events via delegation (no inline onclick). It does not depend on any host
// page's markup.
//
// Native ES module. Exports a single `mount(host)` used by the resident
// dashboard shell. Module scope keeps all functions private to this slice.

let docTypes = [];
let currentAttachmentPreviewUrl = null;
let selectedTypeId = null;
let selectedFile = null;

// Pagination state for the requests table.
let requestsPage = 1;
const REQUESTS_PER_PAGE = 10;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isViewableImage(mime) {
    return mime === 'image/jpeg' || mime === 'image/png';
}

function isPdf(mime) {
    return mime === 'application/pdf';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function attachmentSourceUrl(attachmentId) {
    return 'api.php?action=serve_attachment&id=' + encodeURIComponent(attachmentId);
}

function csrfTokenHeader() {
    return window.pemboCsrfToken || '';
}

function toast(type, message, opts) {
    if (window.PemboToast) {
        window.PemboToast[type](message, opts);
    } else {
        // Fallback if the shared toast script hasn't loaded.
        alert(message);
    }
}

const ICONS = {
    doc: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    file: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

/* ---------- Render the slice's own structure ---------- */
function render(host) {
    host.innerHTML = `
        <div class="doc">
            <div class="doc-intro">
                <h1>Request a Document</h1>
                <p>Choose a certificate, tell us why you need it, and attach your valid ID. We handle the rest.</p>
            </div>

            <form id="create-doc-form" novalidate>
                <section class="doc-card">
                    <div class="doc-section-head"><span class="doc-section-num">1</span><h2>Select a Certificate / Clearance</h2></div>
                    <div class="doc-type-grid" id="doc-type-grid" role="radiogroup" aria-label="Document type"></div>
                    <p class="doc-hint" id="doc-type-hint">Select the document you need.</p>
                </section>

                <section class="doc-card">
                    <div class="doc-section-head"><span class="doc-section-num">2</span><h2>Purpose of Request</h2></div>
                    <label class="doc-label" for="doc-purpose">Why do you need this document?</label>
                    <textarea id="doc-purpose" class="doc-textarea" rows="3" placeholder="e.g. Local employment application" maxlength="500"></textarea>
                </section>

                <section class="doc-card">
                    <div class="doc-section-head"><span class="doc-section-num">3</span><h2>Upload Supporting ID</h2></div>
                    <div class="doc-dropzone" id="doc-dropzone" role="button" tabindex="0" aria-label="Upload supporting document">
                        <span class="doc-dropzone-icon" aria-hidden="true">${ICONS.upload}</span>
                        <span class="doc-dropzone-text">Drop your file here, or <span class="browse">browse</span></span>
                        <span class="doc-dropzone-sub">JPG, PNG, or PDF, up to 5 MB</span>
                        <input type="file" id="doc-attachment" accept=".jpg,.jpeg,.png,.pdf" />
                    </div>
                    <div id="doc-preview-wrap"></div>
                    <p class="doc-hint" id="doc-attachment-hint">A valid ID or supporting document is required.</p>
                </section>

                <button type="submit" class="doc-submit" id="doc-submit-btn">Submit Document Request</button>
            </form>

            <section class="doc-card">
                <div class="doc-section-head"><h2>My Document Requests</h2></div>
                <div class="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>Tracking #</th>
                                <th>Document</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="requests-table-body"></tbody>
                    </table>
                </div>
                <div class="doc-pagination" id="requests-pagination"></div>
            </section>
        </div>

        <div id="details-modal" class="modal-backdrop doc-modal-backdrop">
            <div class="modal doc-modal" role="dialog" aria-modal="true" aria-label="Request details">
                <div id="modal-details-body"></div>
            </div>
        </div>
    `;

    wireDocumentForm();
}

async function loadDocumentTypes() {
    const grid = document.getElementById('doc-type-grid');
    if (!grid) return;
    try {
        const res = await fetch('api.php?action=document_types');
        const data = await res.json();
        if (data.success) {
            docTypes = data.data;
            grid.innerHTML = docTypes.map((t) => {
                return `
                    <label class="doc-type-card" data-id="${escapeHtml(t.id)}">
                        <input type="radio" name="doc-type" class="doc-type-radio" value="${escapeHtml(t.id)}">
                        <span class="doc-type-body">
                            <span class="doc-type-name">${escapeHtml(t.name)}</span>
                        </span>
                    </label>
                `;
            }).join('');
        }
    } catch (e) {
        console.error('Failed to load document types:', e);
    }
}

async function loadRequestsTable() {
    const tableBody = document.getElementById('requests-table-body');
    if (!tableBody) return;

    const pagination = document.getElementById('requests-pagination');

    try {
        const res = await fetch('api.php?action=list_requests&page=' + requestsPage + '&per_page=' + REQUESTS_PER_PAGE);
        const data = await res.json();
        if (!data.success) {
            tableBody.innerHTML = '<tr><td colspan="5">Failed to load requests.</td></tr>';
            if (pagination) pagination.innerHTML = '';
            return;
        }

        // Backward-compatible: an array means no pagination info was requested
        // (shouldn't happen here), otherwise an envelope { data, meta }.
        const requests = Array.isArray(data.data) ? data.data : (data.data && data.data.data ? data.data.data : []);
        const meta = Array.isArray(data.data) ? null : (data.data && data.data.meta ? data.data.meta : null);

        if (requests.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No document requests found.</td></tr>';
            if (pagination) pagination.innerHTML = '';
            return;
        }

        tableBody.innerHTML = requests.map((r) => {
            const statusClass = 'badge-status-' + (r.status || '').toLowerCase();
            const paymentBadge = r.payment_status === 'PAID'
                ? '<span class="badge badge-paid">PAID (OR: ' + escapeHtml(r.official_receipt_number) + ')</span>'
                : '<span class="badge badge-unpaid">UNPAID</span>';
            return '<tr>'
                + '<td><strong>' + escapeHtml(r.tracking_number) + '</strong></td>'
                + '<td>' + escapeHtml(r.document_name) + '</td>'
                + '<td><span class="badge ' + statusClass + '">' + escapeHtml(r.status) + '</span></td>'
                + '<td>' + paymentBadge + '</td>'
                + '<td><button class="btn btn-sm btn-secondary" data-action="view-request" data-id="' + escapeHtml(r.id) + '">View Details</button></td>'
                + '</tr>';
        }).join('');

        if (pagination && meta) {
            pagination.innerHTML = renderPagination(meta);
            wirePagination();
        }
    } catch (e) {
        console.error('Failed to load requests:', e);
    }
}

function renderPagination(meta) {
    const totalPages = meta.total_pages || 0;
    if (totalPages <= 1) return '';

    const prevDisabled = meta.page <= 1 ? ' disabled' : '';
    const nextDisabled = meta.page >= totalPages ? ' disabled' : '';

    return '<div class="doc-pagination-inner">'
        + '<button type="button" class="btn btn-sm btn-secondary" data-page="prev"' + prevDisabled + '>Prev</button>'
        + '<span class="doc-pagination-info">Page ' + meta.page + ' of ' + totalPages + '</span>'
        + '<button type="button" class="btn btn-sm btn-secondary" data-page="next"' + nextDisabled + '>Next</button>'
        + '</div>';
}

function wirePagination() {
    document.querySelectorAll('#requests-pagination [data-page]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const dir = btn.getAttribute('data-page');
            if (dir === 'prev') requestsPage = Math.max(1, requestsPage - 1);
            else requestsPage = requestsPage + 1;
            loadRequestsTable();
        });
    });
}

/* ---------- Attachment selection + preview ---------- */
function setAttachmentError(message) {
    const hint = document.getElementById('doc-attachment-hint');
    const drop = document.getElementById('doc-dropzone');
    if (hint) { hint.textContent = message || 'A valid ID or supporting document is required.'; hint.classList.toggle('doc-hint-error', !!message); }
    if (drop) drop.classList.toggle('is-error', !!message);
}

function handleFileSelect(file) {
    // Validate type + size client-side for instant feedback (server re-validates).
    const okType = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'application/pdf';
    if (!okType) {
        selectedFile = null;
        renderPreview(null);
        setAttachmentError('Unsupported file type. Please upload a JPG, PNG, or PDF.');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        selectedFile = null;
        renderPreview(null);
        setAttachmentError('File is too large. Maximum size is 5 MB.');
        return;
    }

    selectedFile = file;
    renderPreview(file);
    setAttachmentError('');
}

function renderPreview(file) {
    const wrap = document.getElementById('doc-preview-wrap');
    if (!wrap) return;
    if (!file) { wrap.innerHTML = ''; return; }

    if (currentAttachmentPreviewUrl) {
        URL.revokeObjectURL(currentAttachmentPreviewUrl);
        currentAttachmentPreviewUrl = null;
    }

    const isImage = isViewableImage(file.type);
    const thumb = isImage
        ? '<img class="doc-preview-thumb" alt="Uploaded preview">'
        : '<div class="doc-preview-thumb is-pdf">' + ICONS.file + '</div>';

    wrap.innerHTML = `
        <div class="doc-preview">
            ${thumb}
            <div class="doc-preview-meta">
                <div class="doc-preview-name">${escapeHtml(file.name)}</div>
                <div class="doc-preview-size">${escapeHtml(formatFileSize(file.size))}</div>
                <span class="doc-preview-ok">${ICONS.check} Ready to upload</span>
            </div>
            <button type="button" class="doc-remove" aria-label="Remove file">${ICONS.close}</button>
        </div>
    `;

    if (isImage) {
        currentAttachmentPreviewUrl = URL.createObjectURL(file);
        const img = wrap.querySelector('.doc-preview-thumb');
        if (img) img.src = currentAttachmentPreviewUrl;
    }

    wrap.querySelector('.doc-remove').addEventListener('click', () => {
        if (currentAttachmentPreviewUrl) { URL.revokeObjectURL(currentAttachmentPreviewUrl); currentAttachmentPreviewUrl = null; }
        selectedFile = null;
        const input = document.getElementById('doc-attachment');
        if (input) input.value = '';
        renderPreview(null);
        setAttachmentError('');
    });
}

/* ---------- Wire the form (picker, dropzone, submit) ---------- */
function wireDocumentForm() {
    const grid = document.getElementById('doc-type-grid');
    const dropzone = document.getElementById('doc-dropzone');
    const fileInput = document.getElementById('doc-attachment');
    const form = document.getElementById('create-doc-form');

    // Document type picker: delegate card selection to the radios.
    if (grid) {
        grid.addEventListener('change', (e) => {
            const radio = e.target.closest('input[name="doc-type"]');
            if (!radio) return;
            selectedTypeId = radio.value;
            grid.querySelectorAll('.doc-type-card').forEach((c) => {
                c.classList.toggle('is-selected', c.dataset.id === radio.value);
            });
            const hint = document.getElementById('doc-type-hint');
            if (hint) hint.textContent = '';
        });
    }

    // File input change (click-to-browse).
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) handleFileSelect(fileInput.files[0]);
        });
    }

    // Drag & drop + keyboard on the dropzone.
    if (dropzone) {
        ['dragenter', 'dragover'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropzone.classList.add('is-dragover');
        }));
        ['dragleave', 'drop'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropzone.classList.remove('is-dragover');
        }));
        dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files[0]) {
                if (fileInput) {
                    const dt = new DataTransfer();
                    dt.items.add(files[0]);
                    fileInput.files = dt.files;
                }
                handleFileSelect(files[0]);
            }
        });
        dropzone.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && fileInput) { e.preventDefault(); fileInput.click(); }
        });
    }

    if (form) form.addEventListener('submit', handleCreateRequest);
}

/* ---------- Create request ---------- */
async function handleCreateRequest(e) {
    e.preventDefault();
    const purpose = document.getElementById('doc-purpose').value.trim();

    if (!selectedTypeId) {
        const hint = document.getElementById('doc-type-hint');
        if (hint) { hint.textContent = 'Please select a document type.'; hint.classList.add('doc-hint-error'); }
        return;
    }
    if (!purpose) {
        toast('error', 'Please enter the purpose of your request.');
        return;
    }
    if (purpose.length > 500) {
        toast('error', 'Purpose of request must be 500 characters or fewer.');
        return;
    }
    if (!selectedFile) {
        setAttachmentError('Please attach your supporting document / Valid ID.');
        return;
    }

    const submitBtn = document.getElementById('doc-submit-btn');

    const formData = new FormData();
    formData.append('document_type_id', selectedTypeId);
    formData.append('purpose', purpose);
    formData.append('attachment', selectedFile);

    try {
        const data = await window.PemboButton.loading(submitBtn, async () => {
            const res = await fetch('api.php?action=create_request', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrfTokenHeader() },
                body: formData,
            });
            return res.json();
        }, { loadingLabel: 'Submitting…' });

        if (data.success) {
            toast('success', 'Your document request has been submitted.', {
                title: 'Request submitted',
                code: data.data.tracking_number,
            });
            document.getElementById('create-doc-form').reset();
            selectedTypeId = null;
            selectedFile = null;
            const grid = document.getElementById('doc-type-grid');
            if (grid) grid.querySelectorAll('.doc-type-card').forEach((c) => c.classList.remove('is-selected'));
            if (currentAttachmentPreviewUrl) { URL.revokeObjectURL(currentAttachmentPreviewUrl); currentAttachmentPreviewUrl = null; }
            renderPreview(null);
            setAttachmentError('');
            requestsPage = 1;
            loadRequestsTable();
        } else {
            toast('error', data.message || 'Failed to submit request.');
        }
    } catch (err) {
        toast('error', 'Network error submitting request.');
    }
}

/* ---------- Request details modal ---------- */
async function viewRequestDetails(requestId) {
    const modal = document.getElementById('details-modal');
    const modalContent = document.getElementById('modal-details-body');
    if (!modal || !modalContent) return;
    try {
        const res = await fetch('api.php?action=get_request&id=' + encodeURIComponent(requestId));
        const data = await res.json();
        if (!data.success) { toast('error', data.message); return; }
        const r = data.data;

        const canStaff = window.currentUserRole === 'ADMIN' || window.currentUserRole === 'STAFF';

        modalContent.innerHTML = modalHeader(r)
            + modalSummaryGrid(r)
            + modalAttachments(r)
            + modalTimeline(r)
            + (canStaff ? modalStaffPanel(r) : '');

        modal.style.display = 'flex';
    } catch (e) {
        toast('error', 'Failed to fetch request details.');
    }
}

function modalHeader(r) {
    const statusClass = 'badge-status-' + (r.status || '').toLowerCase();
    return '<div class="doc-modal-head">'
        + '<div class="doc-modal-head-main">'
        + '<div class="doc-modal-kicker">Document Request</div>'
        + '<div class="doc-modal-title">' + escapeHtml(r.tracking_number) + '</div>'
        + '<div class="doc-modal-sub">' + escapeHtml(r.document_name) + '</div>'
        + '</div>'
        + '<div class="doc-modal-head-side">'
        + '<button type="button" class="doc-modal-close" data-action="close-modal" aria-label="Close" title="Close">&times;</button>'
        + '<span class="badge ' + statusClass + '">' + escapeHtml(r.status) + '</span>'
        + '</div>'
        + '</div>';
}

function modalSummaryGrid(r) {
    const paymentCell = r.payment_status === 'PAID'
        ? '<span class="doc-pay doc-pay-paid">PAID</span><div class="doc-modal-meta">OR #' + escapeHtml(r.official_receipt_number || '—') + '</div>'
        : '<span class="doc-pay doc-pay-unpaid">UNPAID</span>';

    const cells = [
        ['Purpose', r.purpose],
        ['Requested', formatDate(r.created_at)],
        ['Resident', r.resident_email],
        ['Last updated', formatDate(r.updated_at)],
    ];

    const grid = cells.map(([label, value]) =>
        '<div class="doc-modal-cell"><span class="doc-modal-label">' + escapeHtml(label) + '</span>'
        + '<span class="doc-modal-value">' + escapeHtml(String(value ?? '—')) + '</span></div>'
    ).join('');

    return '<div class="doc-modal-section"><h4 class="doc-modal-h">Overview</h4>'
        + '<div class="doc-modal-grid">' + grid
        + '<div class="doc-modal-cell"><span class="doc-modal-label">Payment</span>' + paymentCell + '</div>'
        + '</div></div>';
}

function modalAttachments(r) {
    const atts = r.attachments || [];
    let inner;
    if (atts.length === 0) {
        inner = '<div class="doc-empty">No files uploaded.</div>';
    } else {
        inner = atts.map((a) => {
            const sizeKb = (Number(a.file_size_bytes || 0) / 1024).toFixed(1);
            const src = attachmentSourceUrl(a.id);
            const isImage = isViewableImage(a.mime_type);
            return '<div class="doc-attach">'
                + '<div class="doc-attach-head"><span class="doc-attach-name">' + escapeHtml(a.file_name) + '</span>'
                + '<span class="doc-modal-meta">' + sizeKb + ' KB</span></div>'
                + (isImage
                    ? '<img src="' + src + '" alt="' + escapeHtml(a.file_name) + '" loading="lazy" class="attachment-preview">'
                    : '<a class="btn btn-sm btn-secondary" href="' + src + '" target="_blank" rel="noopener">Open / Download</a>')
                + '</div>';
        }).join('');
    }
    return '<div class="doc-modal-section"><h4 class="doc-modal-h">Attachments</h4><div class="doc-attach-list">' + inner + '</div></div>';
}

function modalTimeline(r) {
    const history = r.status_history || [];
    if (history.length === 0) {
        return '<div class="doc-modal-section"><h4 class="doc-modal-h">History</h4><div class="doc-empty">No activity yet.</div></div>';
    }
    const items = history.map((h) =>
        '<div class="doc-tl-item"><span class="doc-tl-dot"></span><div>'
        + '<div class="doc-tl-status">' + escapeHtml(h.new_status) + '</div>'
        + '<div class="doc-modal-meta">' + formatDate(h.created_at) + ' · ' + escapeHtml(h.changed_by_role) + '</div>'
        + (h.remarks ? '<div class="doc-tl-remarks">' + escapeHtml(h.remarks) + '</div>' : '')
        + '</div></div>'
    ).join('');
    return '<div class="doc-modal-section"><h4 class="doc-modal-h">Status history</h4><div class="doc-timeline">' + items + '</div></div>';
}

function modalStaffPanel(r) {
    return '<div class="doc-modal-section doc-modal-staff">'
        + '<h4 class="doc-modal-h">Staff actions</h4>'
        + '<div class="doc-modal-staff-grid">'
        + '<div class="form-group"><label>Update status</label>'
        + '<select id="modal-new-status" class="form-control">'
        + '<option value="VERIFYING">Mark VERIFYING</option>'
        + '<option value="APPROVED">Mark APPROVED</option>'
        + '<option value="READY_FOR_PICKUP">Mark READY FOR PICKUP</option>'
        + '<option value="COMPLETED">Mark COMPLETED</option>'
        + '<option value="REJECTED">Mark REJECTED</option>'
        + '</select></div>'
        + '<div class="form-group"><label>Remarks / rejection reason</label>'
        + '<input type="text" id="modal-status-remarks" class="form-control" placeholder="Optional"></div>'
        + '<button class="btn btn-sm btn-primary" data-action="update-status" data-id="' + escapeHtml(r.id) + '">Update Status</button>'
        + '</div>'
        + '<div class="doc-modal-staff-grid doc-modal-staff-pay">'
        + '<div class="form-group"><label>Official Receipt (OR) # (auto)</label>'
        + '<input type="text" id="modal-or-number" class="form-control" value="Auto-generated on save" disabled></div>'
        + '<div class="form-group"><label>Amount paid</label>'
        + '<input type="number" id="modal-amount-paid" class="form-control" placeholder="0.00" step="0.01"></div>'
        + '<button class="btn btn-sm btn-primary" data-action="record-payment" data-id="' + escapeHtml(r.id) + '">Record Payment</button>'
        + '</div>'
        + '</div>';
}

function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return escapeHtml(String(value));
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function updateStatus(requestId, btn) {
    const status = document.getElementById('modal-new-status').value;
    const remarks = document.getElementById('modal-status-remarks').value;
    try {
        const data = await window.PemboButton.loading(btn, async () => {
            const res = await fetch('api.php?action=update_request_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokenHeader() },
                body: JSON.stringify({ request_id: requestId, status, remarks, rejection_reason: status === 'REJECTED' ? remarks : null }),
            });
            return res.json();
        }, { loadingLabel: 'Updating…' });
        if (data.success) {
            toast('success', 'Status updated successfully.');
            viewRequestDetails(requestId);
            loadRequestsTable();
        } else {
            toast('error', data.message || 'Failed to update status.');
        }
    } catch (e) {
        toast('error', 'Network error updating status.');
    }
}

async function recordPayment(requestId, btn) {
    const amountPaid = document.getElementById('modal-amount-paid').value;
    if (!amountPaid) { toast('error', 'Please enter the amount paid.'); return; }
    try {
        const data = await window.PemboButton.loading(btn, async () => {
            const res = await fetch('api.php?action=record_payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokenHeader() },
                body: JSON.stringify({ request_id: requestId, official_receipt_number: '', amount_paid: amountPaid, remarks: 'Over-the-counter payment' }),
            });
            return res.json();
        }, { loadingLabel: 'Recording…' });
        if (data.success) {
            const or = data.data && data.data.official_receipt_number;
            toast('success', or ? ('Payment recorded — receipt ' + or + '.') : 'Payment recorded.');
            viewRequestDetails(requestId);
            loadRequestsTable();
        } else {
            toast('error', data.message || 'Failed to record payment.');
        }
    } catch (e) {
        toast('error', 'Network error recording payment.');
    }
}

/* ---------- Event delegation (no inline onclick) ---------- */
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.getAttribute('data-action');
        const id = el.getAttribute('data-id');
        if (action === 'view-request') viewRequestDetails(id);
        else if (action === 'close-modal') { const m = document.getElementById('details-modal'); if (m) m.style.display = 'none'; }
        else if (action === 'update-status') updateStatus(id, el);
        else if (action === 'record-payment') recordPayment(id, el);
    });

    // Close on backdrop click (outside .modal) or Escape.
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('details-modal');
        if (!modal || modal.style.display !== 'flex') return;
        if (e.target === modal) modal.style.display = 'none';
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById('details-modal');
        if (modal && modal.style.display === 'flex') modal.style.display = 'none';
    });
}

export function mount(host) {
    render(host);
    loadDocumentTypes();
    loadRequestsTable();
}

export { escapeHtml, isViewableImage, attachmentSourceUrl };
