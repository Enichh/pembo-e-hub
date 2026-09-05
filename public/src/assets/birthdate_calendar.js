// src/assets/birthdate_calendar.js
// Reusable birthdate/date calendar (single source of truth). IIFE-scoped; exposes
// window.PemboBirthdateCalendar so register and profile slices can mount the same
// calendar without duplicating the ~180 lines of grid/navigation/keyboard logic.
//
// Dates are constrained to a min/max age window (default 15..120 years) that
// mirrors AuthService::validateProfile. The selected value is written to a
// hidden <input> and reflected in a hint element.

/**
 * @typedef {Object} CalendarMountOptions
 * @property {string} mountId - Container DOM element ID.
 * @property {string} hiddenInputId - Hidden input element ID storing YYYY-MM-DD.
 * @property {string} [hintId] - Optional text element ID displaying formatted date hint.
 * @property {number} [minYears=15] - Minimum age limit in years.
 * @property {number} [maxYears=120] - Maximum age limit in years.
 * @property {string} [value] - Initial selected YYYY-MM-DD date value.
 * @property {boolean} [collapsible=false] - Whether calendar is rendered as a collapsible dropdown.
 * @property {string} [label] - Optional field label text.
 * @property {boolean} [pastOnly=false] - Restrict dates to today or earlier.
 * @property {boolean} [expanded=false] - Initial expanded state for collapsible mode.
 */

/**
 * @typedef {Object} CalendarState
 * @property {string} mountId
 * @property {string} hiddenInputId
 * @property {string|null} hintId
 * @property {number} minYears
 * @property {number} maxYears
 * @property {string} selected
 * @property {{ year: number, month: number }|null} view
 * @property {boolean} collapsible
 * @property {string} label
 * @property {boolean} pastOnly
 * @property {boolean} expanded
 */

(function () {
    'use strict';

    /** @type {string[]} */
    var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    /** @type {string[]} */
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];

    /** @type {Record<string, CalendarState>} */
    var state = {};

    /**
     * Gets today's Date set to 00:00:00.
     * @returns {Date} Today date object.
     */
    function today() {
        var d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * Formats a Date object to YYYY-MM-DD string.
     * @param {Date} d - Date object.
     * @returns {string} Formatted YYYY-MM-DD string.
     */
    function toYmd(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1);
        if (m.length < 2) m = '0' + m;
        var day = String(d.getDate());
        if (day.length < 2) day = '0' + day;
        return y + '-' + m + '-' + day;
    }

    /**
     * Escapes HTML special characters.
     * @param {*} value - Value to escape.
     * @returns {string} Escaped HTML string.
     */
    function escapeHtmlString(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Calculates the minimum valid birthdate for a given minimum age.
     * @param {number} minYears - Minimum age in years.
     * @returns {string} Cutoff YYYY-MM-DD string.
     */
    function minYmd(minYears) {
        var d = new Date();
        d.setFullYear(d.getFullYear() - minYears);
        return toYmd(d);
    }

    /**
     * Calculates the maximum valid birthdate for a given maximum age.
     * @param {number} maxYears - Maximum age in years.
     * @returns {string} Cutoff YYYY-MM-DD string.
     */
    function maxYmd(maxYears) {
        var d = new Date();
        d.setFullYear(d.getFullYear() - maxYears);
        return toYmd(d);
    }

    /**
     * Checks if a YYYY-MM-DD date is within allowed boundaries.
     * @param {string} ymd - Target date string.
     * @param {CalendarState} s - Calendar state object.
     * @returns {boolean} True if date is allowed.
     */
    function allowed(ymd, s) {
        if (s.pastOnly) {
            return ymd <= toYmd(today());
        }
        return ymd <= minYmd(s.minYears) && ymd >= maxYmd(s.maxYears);
    }

    /**
     * Shifts a date by a delta number of days.
     * @param {number} y - Year.
     * @param {number} m - Month (1-indexed).
     * @param {number} d - Day of month.
     * @param {number} delta - Day offset (+/-).
     * @returns {string} Resulting YYYY-MM-DD date string.
     */
    function shiftDay(y, m, d, delta) {
        var dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() + delta);
        return toYmd(dt);
    }

    /**
     * Renders the calendar UI into its mount element.
     * @param {string} mountId - Mount element ID.
     */
    function render(mountId) {
        var s = state[mountId];
        if (!s) return;
        var host = document.getElementById(mountId);
        if (!host) return;

        var now = today();
        if (!s.view) {
            s.view = { year: now.getFullYear(), month: now.getMonth() };
        }
        var year = s.view.year;
        var month = s.view.month;

        var collapsible = !!s.collapsible;
        var bodyId = mountId + '-body';
        var toggleId = mountId + '-toggle';

        var first = new Date(year, month, 1);
        var startOffset = first.getDay();
        var daysInMonth = new Date(year, month + 1, 0).getDate();

        var thisYear = now.getFullYear();
        var minYear = s.pastOnly ? (thisYear - 5) : (thisYear - s.maxYears);
        var yearOptions = '';
        for (var y = thisYear; y >= minYear; y--) {
            yearOptions += '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>';
        }
        var monthOptions = '';
        for (var m = 0; m < 12; m++) {
            monthOptions += '<option value="' + m + '"' + (m === month ? ' selected' : '') + '>' + MONTHS[m] + '</option>';
        }

        var head = WEEKDAYS.map(function (w) { return '<span class="bd-cal-dow">' + w + '</span>'; }).join('');

        // Build calendar grid
        var daysHtml = '';
        for (var i = 0; i < startOffset; i++) {
            daysHtml += '<span class="bd-cal-empty"></span>';
        }
        for (var day = 1; day <= daysInMonth; day++) {
            var dateObj = new Date(year, month, day);
            var ymd = toYmd(dateObj);
            var isAllowed = allowed(ymd, s);
            var isSelected = s.selected === ymd;
            var classes = 'bd-cal-day' + (isSelected ? ' is-selected' : '') + (!isAllowed ? ' is-disabled' : '');
            daysHtml += '<button type="button" class="' + classes + '" data-ymd="' + ymd + '"' + (!isAllowed ? ' disabled' : '') + '>' + day + '</button>';
        }

        var calendarMarkup = '<div class="bd-cal-head">'
            + '<select class="bd-cal-select bd-cal-month-select">' + monthOptions + '</select>'
            + '<select class="bd-cal-select bd-cal-year-select">' + yearOptions + '</select>'
            + '</div>'
            + '<div class="bd-cal-grid">' + head + daysHtml + '</div>';

        if (collapsible) {
            var selectedLabel = s.selected ? s.selected : 'Select date';
            host.innerHTML = '<button type="button" id="' + toggleId + '" class="bd-cal-toggle" aria-expanded="' + (s.expanded ? 'true' : 'false') + '" aria-controls="' + bodyId + '">'
                + '<span class="bd-cal-toggle-label">' + escapeHtmlString(selectedLabel) + '</span>'
                + '<span class="bd-cal-toggle-chevron"></span>'
                + '</button>'
                + '<div id="' + bodyId + '" class="bd-cal-body' + (s.expanded ? '' : ' bd-cal-body-hidden') + '">' + calendarMarkup + '</div>';

            var toggleBtn = document.getElementById(toggleId);
            if (toggleBtn) {
                toggleBtn.addEventListener('click', function () {
                    s.expanded = !s.expanded;
                    render(mountId);
                });
            }
        } else {
            host.innerHTML = calendarMarkup;
        }

        // Attach month/year select listeners
        var monthSelect = host.querySelector('.bd-cal-month-select');
        if (monthSelect) {
            monthSelect.addEventListener('change', function (e) {
                s.view.month = parseInt(e.target.value, 10);
                render(mountId);
            });
        }
        var yearSelect = host.querySelector('.bd-cal-year-select');
        if (yearSelect) {
            yearSelect.addEventListener('change', function (e) {
                s.view.year = parseInt(e.target.value, 10);
                render(mountId);
            });
        }

        host.querySelectorAll('.bd-cal-day:not(.is-disabled)').forEach(function (btn) {
            btn.addEventListener('click', function () {
                select(mountId, btn.getAttribute('data-ymd'));
            });
        });

        host.addEventListener('keydown', function (e) {
            var activeElement = document.activeElement;
            if (!activeElement || !activeElement.classList.contains('bd-cal-day')) return;
            var ymd = activeElement.getAttribute('data-ymd');
            if (!ymd) return;
            var parts = ymd.split('-').map(Number);
            var focusYmd = null;
            if (e.key === 'ArrowLeft') focusYmd = shiftDay(parts[0], parts[1], parts[2], -1);
            else if (e.key === 'ArrowRight') focusYmd = shiftDay(parts[0], parts[1], parts[2], 1);
            else if (e.key === 'ArrowUp') focusYmd = shiftDay(parts[0], parts[1], parts[2], -7);
            else if (e.key === 'ArrowDown') focusYmd = shiftDay(parts[0], parts[1], parts[2], 7);
            else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!activeElement.disabled) select(mountId, ymd);
                return;
            } else return;

            e.preventDefault();
            if (focusYmd > toYmd(today())) return;
            var target = focusYmd.split('-').map(Number);
            if (target[0] !== s.view.year || (target[1] - 1) !== s.view.month) {
                s.view = { year: target[0], month: target[1] - 1 };
                render(mountId);
            }
            var targetEl = host.querySelector('.bd-cal-day[data-ymd="' + focusYmd + '"]');
            if (targetEl) targetEl.focus();
        });
    }

    /**
     * Selects a date value for the specified calendar instance.
     * @param {string} mountId - Calendar mount ID.
     * @param {string} ymd - YYYY-MM-DD date string.
     */
    function select(mountId, ymd) {
        var s = state[mountId];
        if (!s) return;
        s.selected = ymd;
        var hiddenInput = document.getElementById(s.hiddenInputId);
        if (hiddenInput) {
            hiddenInput.value = ymd;
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (s.hintId) {
            var hint = document.getElementById(s.hintId);
            if (hint) hint.textContent = ymd;
        }
        if (s.collapsible) {
            s.expanded = false;
        }
        render(mountId);
    }

    /**
     * Mounts a calendar into a target DOM element.
     * @param {CalendarMountOptions} opts - Calendar initialization options.
     */
    function mount(opts) {
        var mountId = opts.mountId;
        state[mountId] = {
            mountId: mountId,
            hiddenInputId: opts.hiddenInputId,
            hintId: opts.hintId || null,
            minYears: opts.minYears || 15,
            maxYears: opts.maxYears || 120,
            selected: opts.value || '',
            view: null,
            collapsible: !!opts.collapsible,
            label: opts.label || '',
            pastOnly: !!opts.pastOnly,
            expanded: !!(opts.expanded || (!opts.collapsible)),
        };
        // Mark collapsible hosts so the dropdown body can overlay (position
        // context + no clipping border/overflow).
        var host = document.getElementById(mountId);
        if (host) {
            host.classList.toggle('bd-calendar--collapsible', !!opts.collapsible);
        }
        // If we have a value, default the view to that year/month for good UX.
        if (opts.value) {
            var parts = opts.value.split('-').map(Number);
            state[mountId].view = { year: parts[0], month: parts[1] - 1 };
        }
        render(mountId);
    }

    /**
     * Gets the currently selected YYYY-MM-DD date value.
     * @param {string} mountId - Calendar mount ID.
     * @returns {string} Date string in YYYY-MM-DD format.
     */
    function getValue(mountId) {
        var s = state[mountId];
        if (!s) return '';
        var hidden = document.getElementById(s.hiddenInputId);
        return hidden ? hidden.value : s.selected;
    }

    /**
     * Validates the selected value against min/max age rules. Returns empty string if valid.
     * @param {string} mountId - Calendar mount ID.
     * @returns {string} Error message string or empty string if valid.
     */
    function validateError(mountId) {
        var s = state[mountId];
        var value = getValue(mountId);
        if (!value) return 'Date is required.';
        if (!allowed(value, s)) {
            if (s.pastOnly) {
                return 'The date cannot be in the future.';
            }
            if (value > minYmd(s.minYears)) {
                return 'Age must be at least ' + s.minYears + '.';
            }
            return 'Please enter a valid birthdate.';
        }
        return '';
    }

    /**
     * @type {{
     *   mount: function(CalendarMountOptions): void,
     *   getValue: function(string): string,
     *   validateError: function(string): string
     * }}
     */
    window.PemboBirthdateCalendar = {
        mount: mount,
        getValue: getValue,
        validateError: validateError,
    };
})();
