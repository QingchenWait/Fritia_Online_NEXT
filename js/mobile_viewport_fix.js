(function () {
    'use strict';

    var ROOT = document.documentElement;
    var DEFAULT_CONTENT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    var REPAIR_STEPS = [0, 60, 140, 260, 420];
    var lastOrientation = getOrientation();
    var rememberedPortraitWidth = 0;
    var lastAppliedContent = '';

    function isTouchDevice() {
        return Boolean(('ontouchstart' in window) || navigator.maxTouchPoints > 0 || match('(pointer: coarse)'));
    }

    function match(query) {
        return Boolean(window.matchMedia && window.matchMedia(query).matches);
    }

    function getOrientation() {
        var size = getViewportSize();
        return size.height >= size.width ? 'portrait' : 'landscape';
    }

    function getViewportSize() {
        var vv = window.visualViewport;
        var width = Number(vv && vv.width) || window.innerWidth || ROOT.clientWidth || 0;
        var height = Number(vv && vv.height) || window.innerHeight || ROOT.clientHeight || 0;
        return { width: width, height: height };
    }

    function getTrustedClientSize() {
        var width = Number(ROOT.clientWidth) || window.innerWidth || 0;
        var height = Number(ROOT.clientHeight) || window.innerHeight || 0;
        return {
            width: Math.round(width),
            height: Math.round(height)
        };
    }

    function validPortraitWidth(value) {
        return isFinite(value) && value >= 240 && value <= 820;
    }

    function rememberPortraitWidthValue(value) {
        value = Math.round(Number(value) || 0);
        if (!validPortraitWidth(value)) return;
        if (!rememberedPortraitWidth || value < rememberedPortraitWidth) {
            rememberedPortraitWidth = value;
        }
    }

    function getViewportMeta() {
        return document.querySelector('meta[name="viewport"]');
    }

    function normalizeViewportMeta(content) {
        var meta = getViewportMeta();
        if (!meta) return;
        var next = content || DEFAULT_CONTENT;
        if (next === lastAppliedContent && meta.getAttribute('content') === next) return;
        lastAppliedContent = next;
        meta.setAttribute('content', next);
    }

    function getPortraitDeviceWidth() {
        var preferred = Number(rememberedPortraitWidth);
        if (validPortraitWidth(preferred)) {
            return String(Math.round(preferred));
        }
        var values = [
            Number(window.screen && window.screen.width),
            Number(window.screen && window.screen.height),
            Number(window.screen && window.screen.availWidth),
            Number(window.screen && window.screen.availHeight)
        ].filter(validPortraitWidth);
        if (!values.length) return 'device-width';
        return String(Math.round(Math.min.apply(Math, values)));
    }

    function getViewportContentForOrientation(orientation) {
        if (orientation !== 'portrait') return DEFAULT_CONTENT;
        return 'width=' + getPortraitDeviceWidth() + ', initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover';
    }

    function forceViewportReflow() {
        var body = document.body;
        if (!ROOT || !body) return;
        ROOT.style.minWidth = '0';
        body.style.minWidth = '0';
        void ROOT.offsetWidth;
        ROOT.style.removeProperty('min-width');
        body.style.removeProperty('min-width');
    }

    function applyPortraitLayoutFix(orientation) {
        if (!isTouchDevice() || orientation !== 'portrait') {
            ROOT.classList.remove('mobile-portrait-viewport-fixed');
            ROOT.style.removeProperty('--mobile-portrait-layout-w');
            ROOT.style.removeProperty('--mobile-portrait-layout-h');
            try { delete window.FritiaMobileViewportSize; } catch { window.FritiaMobileViewportSize = null; }
            return;
        }
        var size = getTrustedClientSize();
        if (!validPortraitWidth(size.width) || !isFinite(size.height) || size.height < size.width) return;
        ROOT.style.setProperty('--mobile-portrait-layout-w', size.width + 'px');
        ROOT.style.setProperty('--mobile-portrait-layout-h', size.height + 'px');
        ROOT.classList.add('mobile-portrait-viewport-fixed');
        window.FritiaMobileViewportSize = { width: size.width, height: size.height };
        try {
            window.dispatchEvent(new CustomEvent('fritia-mobile-viewport-fixed', { detail: window.FritiaMobileViewportSize }));
        } catch {
            window.dispatchEvent(new Event('fritia-mobile-viewport-fixed'));
        }
    }

    function applyViewportForCurrentOrientation() {
        if (!isTouchDevice()) {
            normalizeViewportMeta(DEFAULT_CONTENT);
            applyPortraitLayoutFix('desktop');
            return;
        }
        var orientation = getOrientation();
        if (orientation === 'portrait') rememberPortraitWidth();
        normalizeViewportMeta(getViewportContentForOrientation(orientation));
        applyPortraitLayoutFix(orientation);
        forceViewportReflow();
    }

    function rememberPortraitWidth() {
        var size = getViewportSize();
        if (size.height < size.width) return;
        rememberPortraitWidthValue(size.width);
    }

    function schedulePortraitRepair() {
        if (!isTouchDevice()) return;
        REPAIR_STEPS.forEach(function (delay) {
            window.setTimeout(function () {
                if (getOrientation() === 'portrait') applyViewportForCurrentOrientation();
            }, delay);
        });
    }

    function handleViewportChange() {
        if (!isTouchDevice()) return;
        var next = getOrientation();
        if (lastOrientation === 'landscape' && next === 'portrait') {
            schedulePortraitRepair();
        } else {
            applyViewportForCurrentOrientation();
        }
        lastOrientation = next;
    }

    rememberPortraitWidth();
    applyViewportForCurrentOrientation();
    window.addEventListener('orientationchange', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportChange, { passive: true });
    }
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) handleViewportChange();
    });
})();
