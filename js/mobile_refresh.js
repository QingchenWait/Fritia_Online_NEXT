(function () {
    'use strict';

    var BUTTON_ID = 'mobile-refresh-btn';
    var DIALOG_ID = 'mobile-refresh-confirm';

    function isTouchDevice() {
        return Boolean(('ontouchstart' in window) || navigator.maxTouchPoints > 0 || match('(pointer: coarse)'));
    }

    function match(query) {
        return Boolean(window.matchMedia && window.matchMedia(query).matches);
    }

    function getButton() {
        return document.getElementById(BUTTON_ID);
    }

    function createDialog() {
        var existing = document.getElementById(DIALOG_ID);
        if (existing) return existing;

        var overlay = document.createElement('div');
        overlay.id = DIALOG_ID;
        overlay.className = 'mobile-refresh-confirm hidden';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'mobile-refresh-title');

        var panel = document.createElement('div');
        panel.className = 'mobile-refresh-confirm__panel';

        var title = document.createElement('strong');
        title.id = 'mobile-refresh-title';
        title.textContent = '是否要重新载入本游戏？';

        var actions = document.createElement('div');
        actions.className = 'mobile-refresh-confirm__actions';

        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'mobile-refresh-confirm__btn mobile-refresh-confirm__btn--ghost';
        cancel.textContent = '否';

        var confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'mobile-refresh-confirm__btn mobile-refresh-confirm__btn--primary';
        confirm.textContent = '是';

        actions.append(cancel, confirm);
        panel.append(title, actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.target === overlay || event.target === cancel) hideDialog();
            if (event.target === confirm) window.location.reload();
        });

        overlay.addEventListener('pointerdown', function (event) {
            event.stopPropagation();
        }, true);

        return overlay;
    }

    function showDialog() {
        createDialog().classList.remove('hidden');
    }

    function hideDialog() {
        document.getElementById(DIALOG_ID)?.classList.add('hidden');
    }

    function bindButton() {
        var button = getButton();
        if (!button) return;
        button.classList.toggle('mobile-refresh-btn--hidden', !isTouchDevice());
        var hiddenOnScenes = function () {
            return Boolean(
                document.body.classList.contains('side-scroller-active')
                || document.body.classList.contains('room-panorama-active')
                || document.body.classList.contains('dream-revision-pending')
                || document.querySelector('.ui-overlay:not(.hidden)')
            );
        };
        var syncVisibility = function () {
            button.classList.toggle('mobile-refresh-btn--hidden', !isTouchDevice() || hiddenOnScenes());
        };
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (!isTouchDevice()) return;
            showDialog();
        });
        button.addEventListener('pointerdown', function (event) {
            event.stopPropagation();
        }, true);
        syncVisibility();
        window.addEventListener('resize', syncVisibility, { passive: true });
        window.addEventListener('orientationchange', syncVisibility, { passive: true });
        document.addEventListener('fritia-overlay-closed', syncVisibility);
        document.addEventListener('click', function () {
            window.setTimeout(syncVisibility, 0);
        }, true);
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') hideDialog();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindButton, { once: true });
    } else {
        bindButton();
    }
})();
