/* features/landing/components/landing.js
 * Behavior for the landing slice only. Vanilla JS, IIFE-scoped (no global
 * leaks). Powers a light reveal-on-scroll effect and the mobile nav menu.
 * No dependencies. */

(function () {
    'use strict';

    // ---------- Reveal on scroll ----------
    function initReveal() {
        if (!('IntersectionObserver' in window)) {
            var els = document.querySelectorAll('.reveal');
            for (var i = 0; i < els.length; i++) els[i].classList.add('is-visible');
            return;
        }
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });
        var targets = document.querySelectorAll('.reveal');
        for (var j = 0; j < targets.length; j++) observer.observe(targets[j]);
    }

    // ---------- Mobile nav menu ----------
    function initMobileNav() {
        var toggle = document.getElementById('nav-toggle');
        var nav = document.getElementById('site-nav');
        if (!toggle || !nav) return;

        function setOpen(open) {
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            nav.classList.toggle('is-open', open);
            document.body.classList.toggle('menu-open', open);
        }

        toggle.addEventListener('click', function () {
            setOpen(!nav.classList.contains('is-open'));
        });

        // Close the menu when a nav link is chosen (anchor navigation).
        nav.addEventListener('click', function (e) {
            if (e.target && e.target.tagName === 'A') setOpen(false);
        });

        // Close on Escape.
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setOpen(false);
        });

        // Close if the viewport grows past mobile (e.g. device rotation).
        window.addEventListener('resize', function () {
            if (window.innerWidth > 640) setOpen(false);
        });
    }

    function boot() {
        initReveal();
        initMobileNav();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
