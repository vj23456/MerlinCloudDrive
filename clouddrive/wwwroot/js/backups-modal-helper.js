/* backups-modal-helper.js
   Small helper to compute precise modal top/bottom offsets for the Backups page
   Uses VisualViewport when available and watches for modal openings to update CSS vars.
*/
(function () {
    if (window.backupsModalHelper) return; // already loaded

    function getHeaderHeight() {
        try {
            var hdr = document.querySelector('.app-header');
            if (hdr) return Math.round(hdr.getBoundingClientRect().height || 0);
        } catch (e) { }
        // fallback to CSS variable if available
        try {
            var val = getComputedStyle(document.documentElement).getPropertyValue('--header-height');
            if (val) return parseInt(val, 10) || 60;
        } catch (e) { }
        return 60; // safe fallback
    }

    function getBottomUiHeight() {
        // Estimate bottom browser UI / keyboard / safe-area using VisualViewport when available
        try {
            if (window.visualViewport && typeof window.visualViewport.height === 'number') {
                var inner = window.innerHeight || document.documentElement.clientHeight;
                var bottomUi = Math.max(0, inner - window.visualViewport.height - (window.visualViewport.offsetTop || 0));
                return Math.round(bottomUi);
            }
        } catch (e) { }
        return 0;
    }

    function updateVars() {
        try {
            var headerH = getHeaderHeight();
            var bottomUi = getBottomUiHeight();

            // Ensure a minimum bottom padding so the footer isn't flush with screen edges
            var bottomPad = Math.max(8, bottomUi);

            document.documentElement.style.setProperty('--backups-modal-top-offset', headerH + 'px');
            document.documentElement.style.setProperty('--backups-modal-bottom-padding', bottomPad + 'px');
        } catch (e) {
            console.warn('backups-modal-helper: updateVars failed', e);
        }
    }

    function onViewportChange() {
        updateVars();
    }

    function observeModals() {
        // When a backups modal is added to the DOM, recompute offsets immediately
        var mo = new MutationObserver(function (mutations) {
            for (var m of mutations) {
                if (m.addedNodes && m.addedNodes.length) {
                    for (var n of m.addedNodes) {
                        if (!(n instanceof HTMLElement)) continue;
                        if (n.classList && n.classList.contains('backups-modal-backdrop')) {
                            // modal shown
                            // update immediately and a tiny delay to catch layout changes
                            updateVars();
                            setTimeout(updateVars, 120);
                        }
                    }
                }
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        try {
            updateVars();
            // Listen for viewport/resize/orientation changes
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', onViewportChange);
                window.visualViewport.addEventListener('scroll', onViewportChange);
            }
            window.addEventListener('resize', onViewportChange);
            window.addEventListener('orientationchange', onViewportChange);

            // Also recompute when the header height may change (e.g., nav toggles)
            var hdr = document.querySelector('.app-header');
            if (hdr) {
                try {
                    var hdMo = new MutationObserver(function () { updateVars(); });
                    hdMo.observe(hdr, { attributes: true, childList: true, subtree: true });
                } catch (e) { }
            }

            observeModals();
        } catch (e) {
            console.warn('backups-modal-helper.init failed', e);
        }
    }

    window.backupsModalHelper = {
        init: init,
        updateVars: updateVars
    };

    // Auto-init when script loads
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 20);
    } else {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 20); });
    }
})();
