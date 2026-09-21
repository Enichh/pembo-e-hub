/**
 * src/assets/input_validator.js
 * Centralized client-side input sanitization, keystroke filtering, and OTP clipboard distribution.
 * 
 * Features:
 *  - Cursor-preserving input filtering using `beforeinput` where supported.
 *  - Philippine name character validation (allows ñ, Ñ, hyphens, apostrophes, periods, spaces).
 *  - Contact number numeric masking.
 *  - Multi-box OTP paste distribution.
 */

(function (root) {
    'use strict';

    /**
     * Attaches a real-time character filter to an input element without resetting cursor position.
     * @param {HTMLInputElement|HTMLTextAreaElement} input - Target input element.
     * @param {RegExp} charRegex - Regex matching valid individual characters (e.g. /^[a-zA-ZñÑ\s\.\'\-]+$/).
     * @param {RegExp} fullRegex - Regex matching entire valid value.
     */
    function attachInputFilter(input, charRegex, fullRegex) {
        if (!input) return;

        // 1. Intercept before character enters DOM to prevent cursor jump.
        input.addEventListener('beforeinput', function (e) {
            if (e.data && !charRegex.test(e.data)) {
                e.preventDefault();
            }
        });

        // 2. Fallback on paste or mobile IME where beforeinput might not cancel cleanly.
        input.addEventListener('input', function () {
            const raw = input.value;
            const start = input.selectionStart;
            let cleaned = '';
            for (let i = 0; i < raw.length; i++) {
                if (charRegex.test(raw[i])) {
                    cleaned += raw[i];
                }
            }
            if (raw !== cleaned) {
                input.value = cleaned;
                if (typeof start === 'number') {
                    const newPos = Math.max(0, start - (raw.length - cleaned.length));
                    input.setSelectionRange(newPos, newPos);
                }
            }
        });
    }

    /**
     * Attaches Philippine name filtering to an input element (allows letters, ñ/Ñ, periods, hyphens, apostrophes, and spaces).
     * @param {HTMLInputElement} input
     */
    function attachNameFilter(input) {
        attachInputFilter(input, /^[a-zA-ZñÑ\s\.\'\-]+$/, /^[a-zA-ZñÑ\s\.\'\-]*$/);
    }

    /**
     * Attaches phone/contact number filtering (allows digits and leading +).
     * @param {HTMLInputElement} input
     */
    function attachPhoneFilter(input) {
        if (!input) return;
        input.setAttribute('inputmode', 'tel');

        input.addEventListener('beforeinput', function (e) {
            if (e.data && !/^[\d+]+$/.test(e.data)) {
                e.preventDefault();
            }
        });

        input.addEventListener('input', function () {
            const raw = input.value;
            const start = input.selectionStart;
            let cleaned = raw.replace(/[^\d+]/g, '');
            // Ensure '+' only appears at index 0 if present
            if (cleaned.indexOf('+') > 0) {
                cleaned = cleaned.charAt(0) === '+' ? '+' + cleaned.replace(/\+/g, '') : cleaned.replace(/\+/g, '');
            }
            if (raw !== cleaned) {
                input.value = cleaned;
                if (typeof start === 'number') {
                    const newPos = Math.max(0, start - (raw.length - cleaned.length));
                    input.setSelectionRange(newPos, newPos);
                }
            }
        });
    }

    /**
     * Attaches OTP paste handler to distribute multi-digit pasted strings across individual PIN inputs.
     * @param {HTMLElement} container - Wrapper element containing the 6 PIN inputs.
     */
    function attachOtpPasteHandler(container) {
        if (!container) return;

        container.addEventListener('paste', function (e) {
            const clipboardData = e.clipboardData || window.clipboardData;
            if (!clipboardData) return;

            const text = clipboardData.getData('text');
            const digits = text.replace(/\D/g, '').slice(0, 6);
            if (!digits) return;

            e.preventDefault();
            const inputs = Array.from(container.querySelectorAll('input'));
            digits.split('').forEach(function (digit, i) {
                if (inputs[i]) {
                    inputs[i].value = digit;
                    inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
                }
            });

            const targetIndex = Math.min(digits.length, inputs.length) - 1;
            if (targetIndex >= 0 && inputs[targetIndex]) {
                inputs[targetIndex].focus();
            }
        });
    }

    // Expose as global utility
    root.PemboInputValidator = {
        attachInputFilter: attachInputFilter,
        attachNameFilter: attachNameFilter,
        attachPhoneFilter: attachPhoneFilter,
        attachOtpPasteHandler: attachOtpPasteHandler,
    };

})(typeof window !== 'undefined' ? window : this);
