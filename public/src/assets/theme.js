// src/assets/theme.js
// Universal light/dark mode. Single IIFE, single source of truth.
//
// - Resolves the theme: localStorage override -> system preference -> light.
// - Applies it synchronously as `data-theme` on <html> (load this file in
//   <head>, before stylesheets, to avoid a flash of the wrong theme).
// - Injects a floating toggle button (sun/moon) on DOMContentLoaded.

/**
 * @typedef {'light'|'dark'} ThemeMode
 */

(function () {
    'use strict';

    /** @type {string} */
    var STORAGE_KEY = 'pembo-theme';

    /**
     * Checks if the user system prefers dark mode.
     * @returns {boolean} True if system prefers dark mode.
     */
    function systemPrefersDark() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    /**
     * Resolves the theme preference from storage or system settings.
     * @returns {ThemeMode} Resolved theme mode ('light' or 'dark').
     */
    function resolveTheme() {
        var saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        if (saved === 'dark' || saved === 'light') return saved;
        return systemPrefersDark() ? 'dark' : 'light';
    }

    /**
     * Applies the theme attribute to documentElement and saves it to localStorage.
     * @param {ThemeMode} theme - Theme mode to apply.
     */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore */ }
    }

    /**
     * Animates the theme switch transition.
     * @param {ThemeMode} next - Target theme mode.
     * @param {HTMLButtonElement|Element} [btn] - Toggle button trigger element.
     */
    function animateThemeSwitch(next, btn) {
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!btn || !document.startViewTransition || reduced) {
            applyTheme(next);
            setToggleIcon(next);
            return;
        }

        var transition = document.startViewTransition(function () {
            applyTheme(next);
        });

        transition.ready.then(function () {
            setToggleIcon(next);

            // Center of the toggle button (source of the reveal).
            var rect = btn.getBoundingClientRect();
            var x = rect.left + rect.width / 2;
            var y = rect.top + rect.height / 2;

            // Radius large enough to cover the whole viewport from that point.
            var maxRadius = Math.hypot(
                Math.max(x, window.innerWidth - x),
                Math.max(y, window.innerHeight - y)
            );

            // Animate the NEW state's clip-path from a dot to full screen.
            document.documentElement.animate(
                {
                    clipPath: [
                        'circle(0px at ' + x + 'px ' + y + 'px)',
                        'circle(' + maxRadius + 'px at ' + x + 'px ' + y + 'px)'
                    ]
                },
                {
                    duration: 500,
                    easing: 'ease-in-out',
                    pseudoElement: '::view-transition-new(root)'
                }
            );
        }).catch(function () {
            setToggleIcon(next);
        });
    }

    // Apply immediately (no FOUC).
    applyTheme(resolveTheme());

    // Icons (moon shown in light = "switch to dark"; sun shown in dark).
    var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';
    var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

    /**
     * Updates toggle button icons and labels.
     * @param {ThemeMode} theme - Current theme mode.
     */
    function setToggleIcon(theme) {
        var icon = theme === 'dark' ? SUN : MOON;
        var label = theme === 'dark' ? 'Light mode' : 'Dark mode';
        var buttons = document.querySelectorAll('.theme-toggle');
        buttons.forEach(function (btn) {
            // Nav renders an icon slot + a text label; the floating fallback is
            // icon-only. Update only what exists so a label is never clobbered.
            var iconSlot = btn.querySelector('[data-theme-icon]');
            var labelSlot = btn.querySelector('[data-theme-label]');
            if (iconSlot) {
                iconSlot.innerHTML = icon;
            } else {
                btn.innerHTML = icon;
            }
            if (labelSlot) labelSlot.textContent = label;
            btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        });
    }

    /**
     * Wires click event listener to a theme toggle button.
     * @param {HTMLButtonElement|Element} btn - Toggle button element.
     */
    function wireToggle(btn) {
        btn.addEventListener('click', function () {
            var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            animateThemeSwitch(next, btn);
        });
    }

    /**
     * Injects floating toggle button if needed and wires all toggle elements.
     */
    function injectToggle() {
        var theme = document.documentElement.getAttribute('data-theme') || 'light';
        var hasNav = !!document.getElementById('app-nav');

        // Only inject a floating fallback when there is no nav to host the
        // toggle (landing + auth pages).
        if (!hasNav && !document.querySelector('.theme-toggle')) {
            var btn = document.createElement('button');
            btn.className = 'theme-toggle';
            btn.type = 'button';
            document.body.appendChild(btn);
        }

        var buttons = document.querySelectorAll('.theme-toggle');
        buttons.forEach(function (btn) {
            if (!btn.dataset.wired) {
                wireToggle(btn);
                btn.dataset.wired = '1';
            }
        });
        setToggleIcon(theme);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectToggle);
    } else {
        injectToggle();
    }

    /**
     * @type {{ refresh: function(): void }}
     */
    window.PemboTheme = {
        refresh: function () { injectToggle(); },
    };
})();

