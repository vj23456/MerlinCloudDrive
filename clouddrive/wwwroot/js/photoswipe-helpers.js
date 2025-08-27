// Modern PhotoSwipe JavaScript integration for CloudDrive2

window.photoSwipeHelpers = {
    currentGallery: null,
    subtitleLoadTimeout: null,
    loadedVideos: new Set(), // Track videos that already have subtitles loaded
    _imgSrcDescriptor: null,
    _imgSrcsetDescriptor: null,
    _imgPatched: false,
    dotNetRef: null,
    // Slideshow state
    slideshowActive: false,
    slideshowTimer: null,
    slideshowSeconds: 5,
    _userStopHandlersInstalled: false,
    _boundUserStopHandler: null,
    _currentMediaEl: null,
    _currentMediaEndedHandler: null,
    _immersiveCssInjected: false,
    _fullscreenChangeHandlers: null,
    _immersiveUiHideTimer: null,
    _immersiveResizeHandler: null,
    _mediaClickGuardEl: null,
    _mediaClickGuardHandler: null,
    _slideshowLoadWaitCleanup: null,
    _slideshowToken: 0,
    
    // Initialize PhotoSwipe gallery
    initGallery: function(dotNetRef, pswpElement, items, options) {
        console.log('PhotoSwipe initGallery called with', items.length, 'items');
        
        if (typeof PhotoSwipe === 'undefined') {
            console.error('PhotoSwipe library not loaded');
            return;
        }

        if (!pswpElement) {
            console.error('PhotoSwipe element not found');
            return;
        }

    // Destroy existing gallery if any
        this.destroyGallery();

    // Ensure image loads do not send Referrer header while gallery is active
    this._applyNoReferrerImagePatch();

    // Initialize PhotoSwipe
    this.currentGallery = new PhotoSwipe(pswpElement, PhotoSwipeUI_Default, items, {
            index: options.index || 0,
            bgOpacity: 0.85,
            shareEl: false,
            fullscreenEl: true,
            zoomEl: true,
            tapToClose: false,
            clickToCloseNonZoomable: false,
            closeOnScroll: false,
            history: false,
            focus: true,
            // Keep toolbar/caption always visible in non-fullscreen (use huge values; falsy values are overridden by UI defaults)
            timeToIdle: 99999999,
            timeToIdleOutside: 99999999,
            showAnimationDuration: 333,
            hideAnimationDuration: 333,
            maxSpreadZoom: 3,
            loop: false,
            arrowKeys: true,
            escKey: true,
            getDoubleTapZoom: function(isMouseClick, item) {
                if (item.initialZoomLevel < 0.7) {
                    return 1;
                } else if (item.initialZoomLevel < 1.2) {
                    return 1.5;
                } else {
                    return item.initialZoomLevel;
                }
            },
            getThumbBoundsFn: function(index) {
                return {x:0, y:0, w:0};
            }
        });

    // Store .NET reference for callbacks
    this.dotNetRef = dotNetRef;

    // Event listeners
        this.currentGallery.listen('gettingData', function(index, item) {
            if (dotNetRef) {
                return dotNetRef.invokeMethodAsync('OnGettingData', index, item);
            }
        });

    this.currentGallery.listen('afterChange', function() {
            if (dotNetRef) {
                const currentItem = this.currItem;
                if (currentItem && currentItem.videoId && currentItem.subtitleFiles) {
                    // Clear any existing timeout to prevent multiple rapid calls
                    if (window.photoSwipeHelpers.subtitleLoadTimeout) {
                        clearTimeout(window.photoSwipeHelpers.subtitleLoadTimeout);
                    }
                    
                    // Debounce subtitle loading and ensure DOM is ready
                    window.photoSwipeHelpers.subtitleLoadTimeout = setTimeout(() => {
                        // Add additional delay to ensure video element is in DOM
                        setTimeout(() => {
                            window.photoSwipeHelpers.loadSubtitlesForVideo(currentItem.videoId, currentItem.subtitleFiles);
                        }, 50);
                    }, 100);
                }
                
                dotNetRef.invokeMethodAsync('OnAfterChange', 
                    this.getCurrentIndex(), 
                    this.currItem, 
                    this.items.length);
            }
            // Reschedule slideshow on slide change
            try {
                if (window.photoSwipeHelpers.slideshowActive) {
                    window.photoSwipeHelpers._scheduleNextAdvance();
                }
            } catch (e) {}
            // Enforce no-referrer on current item's images
            try {
                const container = this.currItem && this.currItem.container;
                if (container) {
                    container.querySelectorAll('img').forEach(img => {
                        try {
                            img.referrerPolicy = 'no-referrer';
                            img.setAttribute('referrerpolicy', 'no-referrer');
                        } catch (e) {}
                    });
                }
            } catch (e) {}
            
            // Install media click guard in non-fullscreen to keep controls visible and allow bringing them back
            try {
                // Detach previous guard if any
                if (window.photoSwipeHelpers._mediaClickGuardEl && window.photoSwipeHelpers._mediaClickGuardHandler) {
                    const prev = window.photoSwipeHelpers._mediaClickGuardEl;
                    const h = window.photoSwipeHelpers._mediaClickGuardHandler;
                    try { prev.removeEventListener('click', h, true); } catch(_) {}
                    try { prev.removeEventListener('pswpTap', h, true); } catch(_) {}
                    try { prev.removeEventListener('touchend', h, true); } catch(_) {}
                }
                window.photoSwipeHelpers._mediaClickGuardEl = null;
                window.photoSwipeHelpers._mediaClickGuardHandler = null;

                const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                if (!isFs) {
                    const curr = this.currItem;
                    let mediaEl = null;
                    if (curr) {
                        if (curr.videoId) mediaEl = document.getElementById(curr.videoId);
                        if (!mediaEl && curr.container) mediaEl = curr.container.querySelector('video, audio');
                    }
                    if (mediaEl) {
                        const ui = this.ui;
                        const handler = (e) => {
                            // Let media handle the click, but prevent PhotoSwipe UI toggle
                            try { e.stopPropagation && e.stopPropagation(); } catch(_) {}
                            try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                            // If UI is hidden, show it so user can access controls while video plays
                            try { ui && ui.showControls && ui.showControls(); } catch(_) {}
                        };
                        mediaEl.addEventListener('click', handler, true);
                        mediaEl.addEventListener('pswpTap', handler, true);
                        mediaEl.addEventListener('touchend', handler, true);
                        window.photoSwipeHelpers._mediaClickGuardEl = mediaEl;
                        window.photoSwipeHelpers._mediaClickGuardHandler = handler;
                    }
                }
            } catch (e) {}
        });

        // Prevent PhotoSwipe from hijacking inputs inside custom toolbar controls
        try {
            const tmpl = this.currentGallery.template;
            const isInControls = (el) => !!(
                el && el.closest && (
                    el.closest('.pswp__slideshow-controls') ||
                    el.closest('.pswp__slideshow-input') ||
                    el.closest('.pswp__button--slideshow') ||
                    el.closest('.pswp__button--fs')
                )
            );
            if (tmpl) {
        const stopIfInControls = (e) => {
                    const el = e.target;
                    if (isInControls(el)) {
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    }
                };
                ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click','wheel'].forEach(evt => {
            tmpl.addEventListener(evt, stopIfInControls, true);
                });
        const keyBlocker = (e) => {
                    const ae = document.activeElement;
                    if (isInControls(ae) || isInControls(e.target)) {
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    }
                };
        window.addEventListener('keydown', keyBlocker, true);
                // Store to remove on destroy
                this._controlsGuards = { stopIfInControls, keyBlocker };
            }
        } catch (e) {}

        // Also set referrer policy right after an image finishes loading
        this.currentGallery.listen('imageLoadComplete', function(index, item) {
            try {
                const container = item && item.container;
                if (container) {
                    container.querySelectorAll('img').forEach(img => {
                        try {
                            img.referrerPolicy = 'no-referrer';
                            img.setAttribute('referrerpolicy', 'no-referrer');
                        } catch (e) {}
                    });
                }
                if (item && item.img) {
                    try {
                        item.img.referrerPolicy = 'no-referrer';
                        item.img.setAttribute('referrerpolicy', 'no-referrer');
                    } catch (e) {}
                }
                // If in fullscreen, just reflow size; do not override zoom to avoid flicker
                try {
                    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                    if (isFs && this && this.updateSize) {
                        this.updateSize(true);
                    }
                } catch (_) {}
            } catch (e) {}
        });

    this.currentGallery.listen('destroy', function() {
            // Clean up referrer patch and other state when gallery is destroyed
            try {
        // Ensure slideshow is stopped
        window.photoSwipeHelpers._stopSlideshowInternal(true);
                window.photoSwipeHelpers._removeNoReferrerImagePatch();
                window.photoSwipeHelpers.loadedVideos.clear();
                if (window.photoSwipeHelpers.subtitleLoadTimeout) {
                    clearTimeout(window.photoSwipeHelpers.subtitleLoadTimeout);
                    window.photoSwipeHelpers.subtitleLoadTimeout = null;
                }
                // Remove media click guard if present
                try {
                    if (window.photoSwipeHelpers._mediaClickGuardEl && window.photoSwipeHelpers._mediaClickGuardHandler) {
                        const prev = window.photoSwipeHelpers._mediaClickGuardEl;
                        const h = window.photoSwipeHelpers._mediaClickGuardHandler;
                        try { prev.removeEventListener('click', h, true); } catch(_) {}
                        try { prev.removeEventListener('pswpTap', h, true); } catch(_) {}
                        try { prev.removeEventListener('touchend', h, true); } catch(_) {}
                    }
                } catch(_) {}
                window.photoSwipeHelpers._mediaClickGuardEl = null;
                window.photoSwipeHelpers._mediaClickGuardHandler = null;
                // Remove control guards
                try {
                    const g = window.photoSwipeHelpers._controlsGuards;
                    if (g) {
                        const tmpl = window.photoSwipeHelpers.currentGallery && window.photoSwipeHelpers.currentGallery.template;
                        if (tmpl) {
                            ['pointerdown','mousedown','touchstart','click','wheel'].forEach(evt => {
                                tmpl.removeEventListener(evt, g.stopIfInControls, true);
                            });
                        }
                        window.removeEventListener('keydown', g.keyBlocker, true);
                        window.photoSwipeHelpers._controlsGuards = null;
                    }
                } catch (e2) {}
            } catch (e) {}
            if (dotNetRef) {
                dotNetRef.invokeMethodAsync('OnPhotoSwipeDestroyed');
            }
        });

    // Open the gallery
        console.log('Opening PhotoSwipe gallery...');
        this.currentGallery.init();
        console.log('PhotoSwipe gallery initialized and opened');
        
        // Initialize wheel navigation
        if (typeof enablePhotoSwipeWheelNavigation !== 'undefined') {
            enablePhotoSwipeWheelNavigation(this.currentGallery);
        }
        
        // Store globally for compatibility
        window.pswp = this.currentGallery;

        // Ensure controls never auto-hide in non-fullscreen: override UI idle handler
        try {
            const ui = this.currentGallery && this.currentGallery.ui;
            if (ui && !this._uiSetIdlePatched) {
                this._uiSetIdlePatched = true;
                this._origUiSetIdle = ui.setIdle && ui.setIdle.bind(ui);
                ui.setIdle = (isIdle) => {
                    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                    if (isFs && this._origUiSetIdle) {
                        // Allow default idle behavior in fullscreen if needed
                        this._origUiSetIdle(isIdle);
                    } else {
                        // In non-fullscreen, keep controls visible
                        try { ui.showControls && ui.showControls(); } catch(_) {}
                    }
                };
                // Restore on destroy
                this.currentGallery.listen('destroy', () => {
                    try {
                        if (ui && this._origUiSetIdle) ui.setIdle = this._origUiSetIdle;
                    } catch(_) {}
                    this._origUiSetIdle = null;
                    this._uiSetIdlePatched = false;
                });
            }
        } catch (_) {}

        // Inject slideshow toolbar button next to zoom/fullscreen
        try {
            this._injectSlideshowToolbarButton();
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to inject slideshow button:', e);
        }

        // Attach media click guard on first open (non-fullscreen)
        try {
            const g = this.currentGallery;
            const attachGuard = () => {
                try {
                    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                    if (isFs) return;
                    const curr = g && g.currItem;
                    let mediaEl = null;
                    if (curr) {
                        if (curr.videoId) mediaEl = document.getElementById(curr.videoId);
                        if (!mediaEl && curr.container) mediaEl = curr.container.querySelector('video, audio');
                    }
                    if (mediaEl) {
                        const ui = g.ui;
                        const handler = (e) => {
                            try { e.stopPropagation && e.stopPropagation(); } catch(_) {}
                            try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                            try { ui && ui.showControls && ui.showControls(); } catch(_) {}
                        };
                        // Cleanup previous
                        if (window.photoSwipeHelpers._mediaClickGuardEl && window.photoSwipeHelpers._mediaClickGuardHandler) {
                            const prev = window.photoSwipeHelpers._mediaClickGuardEl;
                            const h = window.photoSwipeHelpers._mediaClickGuardHandler;
                            try { prev.removeEventListener('click', h, true); } catch(_) {}
                            try { prev.removeEventListener('pswpTap', h, true); } catch(_) {}
                            try { prev.removeEventListener('touchend', h, true); } catch(_) {}
                        }
                        mediaEl.addEventListener('click', handler, true);
                        mediaEl.addEventListener('pswpTap', handler, true);
                        mediaEl.addEventListener('touchend', handler, true);
                        window.photoSwipeHelpers._mediaClickGuardEl = mediaEl;
                        window.photoSwipeHelpers._mediaClickGuardHandler = handler;
                    }
                } catch(_) {}
            };
            // Try right away and shortly after to handle delayed render
            attachGuard();
            setTimeout(attachGuard, 100);
            setTimeout(attachGuard, 250);
        } catch(_) {}

        // Enable immersive fullscreen UI (hide top toolbar and bottom caption in fullscreen)
        try {
            this._enableImmersiveFullscreen();
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to enable immersive fullscreen:', e);
        }

        // Fullscreen-only: stop pointer/touch/click bubbling from toolbar/caption/buttons (capture-phase)
        try {
            const tmpl = this.currentGallery && this.currentGallery.template;
            if (tmpl && !this._fsClickGuards) {
                const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                const inUiNonButton = (el) => !!(el && el.closest && (
                    el.closest('.pswp__button') ? false : (
                        el.closest('.pswp__top-bar') ||
                        el.closest('.pswp__caption') ||
                        el.closest('.pswp__counter')
                    )
                ));
                const handler = (e) => {
                    if (!isFullscreen()) return;
                    const t = e.target;
                    if (inUiNonButton(t)) {
                        try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                        try { e.stopPropagation && e.stopPropagation(); } catch(_) {}
                        // Do not preventDefault so button actions (e.g., close) still work
                    }
                };
                const types = ['click'];
                types.forEach(type => { try { tmpl.addEventListener(type, handler, true); } catch(_) {} });
                this._fsClickGuards = { handler, types };
                // Cleanup on destroy
                this.currentGallery.listen('destroy', () => {
                    try {
                        const g = this._fsClickGuards;
                        if (g && g.types) {
                            g.types.forEach(type => {
                                try { tmpl.removeEventListener(type, g.handler, true); } catch(_) {}
                            });
                        }
                    } catch(_) {}
                    this._fsClickGuards = null;
                });
            }
        } catch (_) {}
    },

    _enableImmersiveFullscreen: function() {
        const gallery = this.currentGallery;
        if (!gallery || !gallery.template) return;
        // Inject CSS once
        if (!this._immersiveCssInjected) {
            try {
                const style = document.createElement('style');
                style.setAttribute('data-cd-immersive', '1');
                style.textContent = [
                    // In fullscreen, position toolbar/caption as overlays without reserving space
                    '.pswp.cd-immersive .pswp__top-bar,',
                    '.pswp.cd-immersive .pswp__caption,',
                    '.pswp.cd-immersive .pswp__counter{',
                    '  position:absolute; left:0; right:0;',
                    '  transition:opacity .2s ease;',
                    '}',
                    // Overlays are visible but do not block drags/swipes by default; re-enable for buttons
                    '.pswp.cd-immersive .pswp__top-bar{ top:0; background:rgba(0,0,0,.35); pointer-events:none; }',
                    '.pswp.cd-immersive .pswp__top-bar .pswp__button, .pswp.cd-immersive .pswp__top-bar button, .pswp.cd-immersive .pswp__top-bar input, .pswp.cd-immersive .pswp__top-bar select{ pointer-events:auto; }',
                    '.pswp.cd-immersive .pswp__caption{ bottom:0; background:rgba(0,0,0,.35); pointer-events:none; }',
                    '.pswp.cd-immersive .pswp__counter{ pointer-events:none; }',
                    '.pswp.cd-immersive .pswp__caption a, .pswp.cd-immersive .pswp__caption button{ pointer-events:auto; }',
                    // Make video truly fill the viewport in fullscreen
                    '.pswp.cd-immersive .pswp__item video{',
                    '  position:absolute; top:0; left:0; width:100% !important; height:100% !important;',
                    '  object-fit:cover; background:#000;',
                    '}',
                    // Ensure overlay sits on top
                    '.pswp.cd-immersive .pswp__top-bar, .pswp.cd-immersive .pswp__caption{ z-index: 10005; }',
                    // No extra hover zones; we use mousemove threshold detection
                ].join('\n');
                document.head.appendChild(style);
                this._immersiveCssInjected = true;
            } catch (_) {}
        }

    const tmpl = gallery.template;
        const self = this;
        const applyState = () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            try {
                if (isFs) {
                    tmpl.classList.add('cd-immersive');
            // Hide controls by default when entering fullscreen; rely on PhotoSwipe UI toggling
            try { if (gallery.ui && gallery.ui.hideControls) gallery.ui.hideControls(); } catch(_) {}
                    // In fullscreen do not reserve space for controls; overlays float on top
                    try {
                        if (!gallery.options) gallery.options = {};
                        if (typeof self._prevBarsSize === 'undefined') self._prevBarsSize = gallery.options.barsSize;
                        if (typeof self._prevFitControlsInViewport === 'undefined') self._prevFitControlsInViewport = gallery.options.fitControlsInViewport;
                        gallery.options.barsSize = { top: 0, bottom: 0 };
                        gallery.options.fitControlsInViewport = false;
                    } catch(_) {}
                    try { gallery.updateSize(true); } catch(_) {}
                    // Reduced timeout for faster response in fullscreen
                    setTimeout(() => { try { gallery.updateSize(true); } catch(_) {} }, 50);
                } else {
                    tmpl.classList.remove('cd-immersive');
            // Restore control visibility state on exit
            try { if (gallery.ui && gallery.ui.showControls) gallery.ui.showControls(); } catch(_) {}
                    // Restore option overrides
                    try {
                        if (!gallery.options) gallery.options = {};
                        if (typeof self._prevBarsSize !== 'undefined') { gallery.options.barsSize = self._prevBarsSize; self._prevBarsSize = undefined; }
                        if (typeof self._prevFitControlsInViewport !== 'undefined') { gallery.options.fitControlsInViewport = self._prevFitControlsInViewport; self._prevFitControlsInViewport = undefined; }
                        gallery.updateSize(true);
                    } catch(_) {}
                }
            } catch (_) {}
        };

        // Setup listeners
        const onFsChange = () => applyState();
        const onWebkitFsChange = () => applyState();
        const onMozFsChange = () => applyState();
        const onMsFsChange = () => applyState();
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onWebkitFsChange);
        document.addEventListener('mozfullscreenchange', onMozFsChange);
        document.addEventListener('MSFullscreenChange', onMsFsChange);
        // When slide changes in fullscreen, just refresh layout
        const onAfterChange = () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            if (isFs) { try { gallery.updateSize(true); } catch(_) {} }
        };
        try { gallery.listen('afterChange', onAfterChange); } catch (_) {}
        // On window resize during fullscreen, just refresh layout
        const onWindowResize = () => { try { gallery.updateSize(true); } catch(_) {} };
        window.addEventListener('resize', onWindowResize);
        // Input behavior by device type
        const isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
        let clickToggle = null;
        let mouseMoveHandler = null;
    if (isTouch) {
            // Mobile/tablet: rely on PhotoSwipe's built-in tap-to-toggle controls
            // No extra handlers needed; we only changed default state on entering fullscreen via ui.hideControls()
        } else {
            // Desktop: show UI when mouse near top/bottom edge; hide otherwise
            const showUI = () => { try { if (gallery.ui && gallery.ui.showControls) gallery.ui.showControls(); } catch (_) {} };
            const hideUI = () => { try { if (gallery.ui && gallery.ui.hideControls) gallery.ui.hideControls(); } catch (_) {} };
            const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            const EDGE_PX = 80; // sensitivity band at edges
            mouseMoveHandler = (e) => {
                if (!isFullscreen()) return;
                // Don't toggle UI while a drag/selection is in progress
                if ((typeof e.buttons === 'number' && e.buttons !== 0)) return;
                try {
                    const rect = tmpl.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    if (y <= EDGE_PX || y >= rect.height - EDGE_PX) {
                        showUI();
                    } else {
                        // Only hide if not hovering toolbar/caption
                        const t = e.target;
                        if (!(t && t.closest && (t.closest('.pswp__top-bar') || t.closest('.pswp__caption')))) {
                            hideUI();
                        }
                    }
                } catch (_) {}
            };
            tmpl.addEventListener('mousemove', mouseMoveHandler, { capture: false, passive: true });
            // Keep UI visible while hovering overlays themselves
            const topBar = tmpl.querySelector('.pswp__top-bar');
            const caption = tmpl.querySelector('.pswp__caption');
            if (topBar) {
                const onTopEnter = () => { if (isFullscreen()) showUI(); };
                const onTopLeave = () => { if (isFullscreen()) hideUI(); };
                topBar.addEventListener('mouseenter', onTopEnter);
                topBar.addEventListener('mouseleave', onTopLeave);
                // Track for cleanup
                if (!self._fullscreenChangeHandlers) self._fullscreenChangeHandlers = {};
                self._fullscreenChangeHandlers.topBarEl = topBar;
                self._fullscreenChangeHandlers.topBarEnter = onTopEnter;
                self._fullscreenChangeHandlers.topBarLeave = onTopLeave;
            }
            if (caption) {
                const onCapEnter = () => { if (isFullscreen()) showUI(); };
                const onCapLeave = () => { if (isFullscreen()) hideUI(); };
                caption.addEventListener('mouseenter', onCapEnter);
                caption.addEventListener('mouseleave', onCapLeave);
                // Track for cleanup
                if (!self._fullscreenChangeHandlers) self._fullscreenChangeHandlers = {};
                self._fullscreenChangeHandlers.captionEl = caption;
                self._fullscreenChangeHandlers.captionEnter = onCapEnter;
                self._fullscreenChangeHandlers.captionLeave = onCapLeave;
            }
        }

    // Track handlers for cleanup
    this._fullscreenChangeHandlers = { onFsChange, onWebkitFsChange, onMozFsChange, onMsFsChange, onAfterChange, onWindowResize, clickToggle, mouseMoveHandler };

    // Clean up on destroy
        try {
            gallery.listen('destroy', function() {
                try {
                    const h = window.photoSwipeHelpers._fullscreenChangeHandlers;
                    if (h) {
                        document.removeEventListener('fullscreenchange', h.onFsChange);
                        document.removeEventListener('webkitfullscreenchange', h.onWebkitFsChange);
                        document.removeEventListener('mozfullscreenchange', h.onMozFsChange);
                        document.removeEventListener('MSFullscreenChange', h.onMsFsChange);
                        try { gallery.unlisten('afterChange', h.onAfterChange); } catch (_) {}
                        try { gallery.unlisten('doubleTap', h.onDoubleTap); } catch (_) {}
                        try { gallery.unlisten('zoomAnimationEnded', h.onZoomEnd); } catch (_) {}
                        try { window.removeEventListener('resize', h.onWindowResize); } catch(_) {}
            // No custom touch toggles to remove anymore
                        try { if (h.mouseMoveHandler) tmpl.removeEventListener('mousemove', h.mouseMoveHandler, false); } catch (_) {}
                        // Remove overlay hover handlers if present
                        try {
                            if (h.topBarEl) {
                                if (h.topBarEnter) h.topBarEl.removeEventListener('mouseenter', h.topBarEnter);
                                if (h.topBarLeave) h.topBarEl.removeEventListener('mouseleave', h.topBarLeave);
                            }
                            if (h.captionEl) {
                                if (h.captionEnter) h.captionEl.removeEventListener('mouseenter', h.captionEnter);
                                if (h.captionLeave) h.captionEl.removeEventListener('mouseleave', h.captionLeave);
                            }
                        } catch (_) {}
                        window.photoSwipeHelpers._fullscreenChangeHandlers = null;
                    }
                } catch (_) {}
                try { tmpl.classList.remove('cd-immersive'); } catch (_) {}
                try { if (window.photoSwipeHelpers._immersiveUiHideTimer) { clearTimeout(window.photoSwipeHelpers._immersiveUiHideTimer); window.photoSwipeHelpers._immersiveUiHideTimer = null; } } catch(_) {}
            });
        } catch (_) {}

        // Initialize state
        applyState();
    },

    _fitScaleForCurrent: function() {
        try {
            const g = this.currentGallery;
            if (!g || !g.currItem) return null;
            const item = g.currItem;
            // Prefer PhotoSwipe's own computed initial zoom level for exact "fit"
            if (item && typeof item.initialZoomLevel === 'number' && isFinite(item.initialZoomLevel) && item.initialZoomLevel > 0) {
                return item.initialZoomLevel;
            }
            if (!item.w || !item.h || item.w <= 0 || item.h <= 0) return null;
            const vw = g.viewportSize && g.viewportSize.x ? g.viewportSize.x : (window.innerWidth || 0);
            const vh = g.viewportSize && g.viewportSize.y ? g.viewportSize.y : (window.innerHeight || 0);
            if (!vw || !vh) return null;
            const scale = Math.min(vw / item.w, vh / item.h);
            const maxZoom = (typeof g.options.maxSpreadZoom === 'number' && g.options.maxSpreadZoom > 0) ? g.options.maxSpreadZoom : 3;
            return Math.min(scale, maxZoom);
        } catch (_) { return null; }
    },

    _applyFullscreenFitGuarded: function() {
        try {
            const g = this.currentGallery;
            if (!g) return;
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            if (!isFs) return;
            const fit = this._fitScaleForCurrent();
            if (!fit) return;
            const getLevel = (g.getZoomLevel && g.getZoomLevel.bind(g)) || null;
            const curr = getLevel ? getLevel() : null;
            // If at-or-below fit (or very close), snap exactly to fit
            const eps = 0.005;
            if (curr == null || curr <= fit + eps) {
                const vw = g.viewportSize && g.viewportSize.x ? g.viewportSize.x : (window.innerWidth || 0);
                const vh = g.viewportSize && g.viewportSize.y ? g.viewportSize.y : (window.innerHeight || 0);
                try { g.updateSize(true); } catch (_) {}
                // Apply a tiny negative bias so PhotoSwipe treats it as <= fit and enables swipe navigation
                const bias = 1e-4;
                const target = Math.max(fit - bias, 0);
                g.zoomTo(target, { x: vw / 2, y: vh / 2 }, 150);
            }
        } catch (_) {}
    },

    _scheduleFullscreenFitAdjustments: function() {
        try {
            const g = this.currentGallery;
            if (!g) return;
            // Force size update, then apply fit a few times as fullscreen settles
            const attempt = (delay) => setTimeout(() => {
                try { g.updateSize(true); } catch (_) {}
                this._applyFullscreenFitGuarded();
            }, delay);
            attempt(0);
            attempt(120);
            attempt(300);
        } catch (_) {}
    },

    // Removed cover-based helpers to align fullscreen with non-fullscreen fit behavior.

    _injectSlideshowToolbarButton: function() {
        const gallery = this.currentGallery;
        if (!gallery || !gallery.template) return;
        const ui = gallery.template.querySelector('.pswp__top-bar');
        if (!ui) return;
        // Avoid duplicating button
        if (ui.querySelector('.pswp__button--slideshow')) return;

        // Create button
    const btn = document.createElement('button');
    btn.className = 'pswp__button pswp__button--action pswp__button--slideshow';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', this.slideshowActive ? 'Stop slideshow' : 'Start slideshow');
    // Match default toolbar button sizing/positioning; place to the left of the leftmost existing abs-positioned button
    btn.style.width = '44px';
    btn.style.height = '44px';
    btn.style.position = 'absolute';
    btn.style.top = '0';
    // Ensure visibility (PhotoSwipe may hide text via text-indent/background sprite)
    btn.style.background = 'none';
    btn.style.textIndent = '0';
    btn.style.overflow = 'visible';
    btn.style.lineHeight = '44px';
    const positionBtn = () => {
            try {
        const target = ui.querySelector('.pswp__button--close') || ui.querySelector('.pswp__button--zoom') || ui.querySelector('.pswp__button--fs');
                if (target) {
                    const containerRect = ui.getBoundingClientRect();
                    const targetRect = target.getBoundingClientRect();
                    const cs = window.getComputedStyle(target);
                    const leftStr = cs.left;
                    const rightStr = cs.right;
                    const hasLeft = leftStr && leftStr !== 'auto' && !isNaN(parseFloat(leftStr));
                    const hasRight = rightStr && rightStr !== 'auto' && !isNaN(parseFloat(rightStr));

                    if (hasLeft) {
                        // Toolbar anchored from left: put our button immediately to the right of target
                        const leftVal = (targetRect.left - containerRect.left) + 44; // one slot to the right
                        btn.style.left = leftVal + 'px';
                        btn.style.right = 'auto';
                    } else {
                        // Toolbar anchored from right (default): put our button immediately to the left of target
            const rightVal = containerRect.right - targetRect.left; // one slot to the left
                        btn.style.right = rightVal + 'px';
                        btn.style.left = 'auto';
                    }
                } else {
                    // Fallback to a safe default when buttons are missing
                    btn.style.right = '176px';
                    btn.style.left = 'auto';
                }
            } catch (_) {
                btn.style.right = '176px';
                btn.style.left = 'auto';
            }
        };
    // Boost visibility stacking just in case
    btn.style.zIndex = '10001';
    positionBtn();
    // Also position after a short delay to wait for layout stabilization
    setTimeout(positionBtn, 0);
    setTimeout(positionBtn, 50);
        // Reposition on resize to keep alignment
        const resizeHandler = () => positionBtn();
        window.addEventListener('resize', resizeHandler);
        // Clean up on destroy
        try {
            gallery.listen('destroy', function() {
                window.removeEventListener('resize', resizeHandler);
            });
        } catch (_) {}
        // Use a simple icon with Font Awesome if available
    // Inline SVG icon to avoid dependency on fonts/sprites
    const svgNS = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('width', '20');
    icon.setAttribute('height', '20');
    icon.style.position = 'absolute';
    icon.style.top = '50%';
    icon.style.left = '50%';
    icon.style.transform = 'translate(-50%, -50%)';
    icon.style.fill = 'currentColor';
    icon.style.color = '#fff';
    icon.style.pointerEvents = 'none';
    const pathPlay = document.createElementNS(svgNS, 'path');
    pathPlay.setAttribute('d', 'M8 5v14l11-7z');
    const pathPauseG = document.createElementNS(svgNS, 'g');
    const pathPause1 = document.createElementNS(svgNS, 'rect');
    pathPause1.setAttribute('x', '6');
    pathPause1.setAttribute('y', '5');
    pathPause1.setAttribute('width', '4');
    pathPause1.setAttribute('height', '14');
    const pathPause2 = document.createElementNS(svgNS, 'rect');
    pathPause2.setAttribute('x', '14');
    pathPause2.setAttribute('y', '5');
    pathPause2.setAttribute('width', '4');
    pathPause2.setAttribute('height', '14');
    pathPauseG.appendChild(pathPause1);
    pathPauseG.appendChild(pathPause2);
    // Default to play icon
    icon.appendChild(pathPlay);
    btn.appendChild(icon);

        const updateTitleAndIcon = () => {
            // Title: fallback to English; Razor handles localization for in-viewer strings, but this is JS-only
            const startTitle = 'Start slideshow';
            const stopTitle = 'Stop slideshow';
            btn.title = this.slideshowActive ? stopTitle : startTitle;
            btn.setAttribute('aria-label', this.slideshowActive ? stopTitle : startTitle);
            // Swap SVG content
            while (icon.firstChild) icon.removeChild(icon.firstChild);
            if (this.slideshowActive) {
                icon.appendChild(pathPauseG);
            } else {
                icon.appendChild(pathPlay);
            }
        };
        updateTitleAndIcon();

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                if (!this.slideshowActive) {
                    let seconds = 5;
                    try {
                        const saved = localStorage.getItem('cd.slideshowSeconds');
                        const n = parseInt(saved, 10);
                        if (!isNaN(n) && n >= 1 && n <= 3600) seconds = n;
                    } catch(_) {}
                    this.startSlideshow(seconds);
                } else {
                    this.stopSlideshow();
                }
            } finally {
                updateTitleAndIcon();
            }
        });

    // Append to toolbar; absolute "right" handles final placement robustly
    ui.appendChild(btn);

        // Keep icon in sync when slideshow stops due to reaching last item or user interaction
        const originalStop = this.stopSlideshow.bind(this);
        this.stopSlideshow = () => {
            originalStop();
            updateTitleAndIcon();
        };
        // Also update on slide change in case state toggled elsewhere
        try {
            gallery.listen('afterChange', updateTitleAndIcon);
        } catch (_) {}
    },

    // Destroy current gallery
    destroyGallery: function() {
        if (this.currentGallery) {
                    // Also stop bubbling from actual UI buttons/controls in fullscreen (bubble-phase)
                    const buttonGuardHandler = (e) => {
                        if (!isFullscreen()) return;
                        try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                        try { e.stopPropagation && e.stopPropagation(); } catch(_) {}
                    };
                    const attachButtonGuards = () => {
                        try {
                            const controls = tmpl.querySelectorAll('.pswp__top-bar .pswp__button, .pswp__top-bar button, .pswp__top-bar input, .pswp__top-bar select, .pswp__caption a, .pswp__caption button');
                            const list = Array.prototype.slice.call(controls);
                            list.forEach(el => {
                                try { el.addEventListener('click', buttonGuardHandler, false); } catch(_) {}
                                try { el.addEventListener('touchend', buttonGuardHandler, false); } catch(_) {}
                                try { el.addEventListener('pointerup', buttonGuardHandler, false); } catch(_) {}
                                try { el.addEventListener('mouseup', buttonGuardHandler, false); } catch(_) {}
                                // PhotoSwipe custom tap event may bubble on template; belt-and-suspenders
                                try { el.addEventListener('pswpTap', buttonGuardHandler, false); } catch(_) {}
                            });
                            this._fsButtonGuards = { elements: list, handler: buttonGuardHandler };
                        } catch(_) {}
                    };
                    attachButtonGuards();
                    // Re-attach shortly after to catch async-inserted controls (e.g., slideshow button)
                    setTimeout(attachButtonGuards, 0);
                    setTimeout(attachButtonGuards, 50);
                    this.currentGallery.listen('destroy', () => {
                        try {
                            const g2 = this._fsButtonGuards;
                            if (g2 && g2.elements) {
                                g2.elements.forEach(el => {
                                    try { el.removeEventListener('click', g2.handler, false); } catch(_) {}
                                    try { el.removeEventListener('touchend', g2.handler, false); } catch(_) {}
                                    try { el.removeEventListener('pointerup', g2.handler, false); } catch(_) {}
                                    try { el.removeEventListener('mouseup', g2.handler, false); } catch(_) {}
                                    try { el.removeEventListener('pswpTap', g2.handler, false); } catch(_) {}
                                });
                            }
                        } catch(_) {}
                        this._fsButtonGuards = null;
                    });
            this.currentGallery.close();
            this.currentGallery = null;
            window.pswp = null;
        }
        // Clear loaded videos set
        this.loadedVideos.clear();
        // Clear any pending subtitle loading
        if (this.subtitleLoadTimeout) {
            clearTimeout(this.subtitleLoadTimeout);
            this.subtitleLoadTimeout = null;
        }
        // Restore native image behavior
        this._removeNoReferrerImagePatch();
    },

    // Navigate to previous item
    prev: function() {
        if (this.currentGallery) {
            this.currentGallery.prev();
        }
    },

    // Navigate to next item
    next: function() {
        if (this.currentGallery) {
            this.currentGallery.next();
        }
    },

    // Go to specific index
    goTo: function(index) {
        if (this.currentGallery) {
            this.currentGallery.goTo(index);
        }
    },

    // Update current item
    setCurrentItem: function(pswpElement, item) {
        if (this.currentGallery && this.currentGallery.currItem) {
            // Update the item properties first
            Object.assign(this.currentGallery.currItem, item);
            
            // Find and update all image elements in the current item container
            const container = this.currentGallery.currItem.container;
            if (container && item.src) {
                // Get all img elements in the container
                const imgElements = container.querySelectorAll('.pswp__img');
                
                imgElements.forEach(imgElement => {
                    console.log('Updating image src from', imgElement.src, 'to', item.src);
                    try {
                        imgElement.referrerPolicy = 'no-referrer';
                        imgElement.setAttribute('referrerpolicy', 'no-referrer');
                    } catch (e) {}
                    
                    // Create a new image to load the full-size version
                    const newImg = new Image();
                    try {
                        newImg.referrerPolicy = 'no-referrer';
                    } catch (e) {}
                    newImg.onload = () => {
                        // Update the actual dimensions based on loaded image
                        this.currentGallery.currItem.w = newImg.naturalWidth;
                        this.currentGallery.currItem.h = newImg.naturalHeight;
                        
                        // Update the src
                        imgElement.src = item.src;
                        
                        // Remove placeholder class if it exists
                        if (imgElement.classList.contains('pswp__img--placeholder')) {
                            imgElement.classList.remove('pswp__img--placeholder');
                            imgElement.style.display = 'block';
                        }
                        
                        // Check if we're in fullscreen mode
                        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                        
                        if (isFs) {
                            // In fullscreen mode, use a more efficient approach to avoid delays
                            
                            // Calculate zoom before any DOM operations to avoid layout thrashing
                            const viewportWidth = this.currentGallery.viewportSize.x;
                            const viewportHeight = this.currentGallery.viewportSize.y;
                            const imageWidth = newImg.naturalWidth;
                            const imageHeight = newImg.naturalHeight;
                            
                            const zoomToFit = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
                            const initialZoomLevel = this.currentGallery.currItem.initialZoomLevel;
                            const targetZoom = (initialZoomLevel && initialZoomLevel <= zoomToFit) ? initialZoomLevel : zoomToFit;
                            
                            // Update PhotoSwipe item properties before any operations
                            this.currentGallery.currItem.initialZoomLevel = targetZoom;
                            this.currentGallery.currItem.fitRatio = targetZoom;
                            
                            // Single invalidation without immediate updateSize to avoid double layout
                            this.currentGallery.invalidateCurrItems();
                            
                            // Use a single requestAnimationFrame to batch all operations
                            requestAnimationFrame(() => {
                                // Update size only once after all calculations
                                this.currentGallery.updateSize(true);
                                
                                // Set zoom without animation to avoid delay, centered properly
                                const centerX = viewportWidth / 2;
                                const centerY = viewportHeight / 2;
                                
                                // Use zoomTo with 0 duration for instant positioning
                                this.currentGallery.zoomTo(targetZoom, {x: centerX, y: centerY}, 0);
                                
                                // Force recalculation of zoom bounds to fix click-to-zoom positioning
                                // This fixes the issue where clicks zoom to wrong position after loading original size
                                requestAnimationFrame(() => {
                                    try {
                                        // Reset all positioning-related properties to force clean recalculation
                                        const item = this.currentGallery.currItem;
                                        if (item) {
                                            // Clear cached bounds and position data
                                            item.bounds = null;
                                            item.vGap = null;
                                            item.fitRatio = targetZoom;
                                            item.initialZoomLevel = targetZoom;
                                            
                                            // Reset positioning
                                            item.initialPosition = { x: 0, y: 0 };
                                            
                                            // Force PhotoSwipe to recalculate everything
                                            this.currentGallery.updateSize(false); // false = no event trigger, just recalc
                                            
                                            // Reset pan position to ensure click-to-zoom works from correct reference point
                                            if (this.currentGallery.panX !== undefined) {
                                                this.currentGallery.panX = 0;
                                            }
                                            if (this.currentGallery.panY !== undefined) {
                                                this.currentGallery.panY = 0;
                                            }
                                            
                                            // Additional fix: ensure the image is properly centered after bounds recalculation
                                            const currentZoom = this.currentGallery.getZoomLevel();
                                            if (Math.abs(currentZoom - targetZoom) > 0.001) {
                                                // Re-center if zoom drifted during recalculation
                                                this.currentGallery.zoomTo(targetZoom, {x: centerX, y: centerY}, 0);
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('Error recalculating zoom bounds:', e);
                                    }
                                });
                            });
                        } else {
                            // Non-fullscreen mode - use the original logic
                            this.currentGallery.invalidateCurrItems();
                            this.currentGallery.updateSize(true);
                            
                            const viewportWidth = this.currentGallery.viewportSize.x;
                            const viewportHeight = this.currentGallery.viewportSize.y;
                            const imageWidth = newImg.naturalWidth;
                            const imageHeight = newImg.naturalHeight;
                            
                            const zoomToFitWidth = viewportWidth / imageWidth;
                            const zoomToFitHeight = viewportHeight / imageHeight;
                            const zoomToFit = Math.min(zoomToFitWidth, zoomToFitHeight);
                            
                            const initialZoomLevel = this.currentGallery.currItem.initialZoomLevel;
                            let targetZoom = initialZoomLevel || zoomToFit;
                            
                            if (targetZoom > zoomToFit) {
                                targetZoom = zoomToFit;
                            }
                            
                            console.log('Fitting image:', imageWidth + 'x' + imageHeight, 'to viewport:', viewportWidth + 'x' + viewportHeight, 'with zoom:', targetZoom, 'initial:', initialZoomLevel);
                            
                            const centerX = viewportWidth / 2;
                            const centerY = viewportHeight / 2;
                            this.currentGallery.zoomTo(targetZoom, {x: centerX, y: centerY}, 333);
                        }
                    };
                    newImg.src = item.src;
                });
                
                // Force PhotoSwipe to reload the image reference
                if (this.currentGallery.currItem.img) {
                    try {
                        this.currentGallery.currItem.img.referrerPolicy = 'no-referrer';
                        this.currentGallery.currItem.img.setAttribute('referrerpolicy', 'no-referrer');
                    } catch (e) {}
                    this.currentGallery.currItem.img.src = item.src;
                }
            }
        }
    },

    // Start slideshow from current item
    startSlideshow: function(seconds) {
        if (!this.currentGallery) return;
        if (!seconds || seconds < 1) seconds = 5;
        this.slideshowSeconds = seconds;
        if (this.slideshowActive) {
            // Restart timing with new seconds
            this._clearSlideshowTimer();
        }
        this.slideshowActive = true;
        this._installUserStopHandlers();
        this._scheduleNextAdvance();
        console.log('[PhotoSwipe] Slideshow started with', seconds, 'seconds');

        // On slideshow start (user gesture), try to prime current media for autoplay on iOS
        try {
            const currentItem = this.currentGallery && this.currentGallery.currItem;
            const container = currentItem && currentItem.container;
            if (container) {
                let mediaEl = null;
                if (currentItem.videoId) mediaEl = document.getElementById(currentItem.videoId);
                if (!mediaEl) mediaEl = container.querySelector('video, audio');
                if (mediaEl) {
                    this._prepareAndPlayMediaForSlideshow(mediaEl);
                }
            }
        } catch (_) {}
    },

    // Stop slideshow
    stopSlideshow: function() {
        this._stopSlideshowInternal(false);
    },

    _stopSlideshowInternal: function(silent) {
        if (!this.slideshowActive && !this.slideshowTimer && !this._userStopHandlersInstalled) return;
        this.slideshowActive = false;
        this._clearSlideshowTimer();
    // Cancel any pending image-load waiters
    try { if (this._slideshowLoadWaitCleanup) { this._slideshowLoadWaitCleanup(); } } catch(_) {}
    this._slideshowLoadWaitCleanup = null;
        this._removeMediaEndedHandler();
        // Best-effort: unmute current media after stopping, only if we muted it for autoplay
        try {
            if (this._currentMediaEl && this._currentMediaEl.dataset && this._currentMediaEl.dataset.cdMutedForAutoplay === '1') {
                this._currentMediaEl.muted = false;
                delete this._currentMediaEl.dataset.cdMutedForAutoplay;
            }
        } catch(_) {}
        this._removeUserStopHandlers();
        if (!silent && this.dotNetRef) {
            try { this.dotNetRef.invokeMethodAsync('OnSlideshowStopped'); } catch (e) {}
        }
        console.log('[PhotoSwipe] Slideshow stopped');
    },

    _clearSlideshowTimer: function() {
        if (this.slideshowTimer) {
            clearTimeout(this.slideshowTimer);
            this.slideshowTimer = null;
        }
    },

    _removeMediaEndedHandler: function() {
        try {
            if (this._currentMediaEl && this._currentMediaEndedHandler) {
                this._currentMediaEl.removeEventListener('ended', this._currentMediaEndedHandler);
            }
        } catch (e) {}
        this._currentMediaEl = null;
        this._currentMediaEndedHandler = null;
    },

    // Detect if a specific element is currently in native fullscreen
    _isElementInNativeFullscreen: function(el) {
        try {
            return !!(el && (
                document.fullscreenElement === el ||
                document.webkitFullscreenElement === el ||
                document.mozFullScreenElement === el ||
                document.msFullscreenElement === el
            ));
        } catch (_) { return false; }
    },

    // Attempt to exit native fullscreen (document or element), returns a thenable
    _exitNativeFullscreen: function(el) {
        try {
            // Try element-level exit first if available (WebKit on iOS)
            if (el && typeof el.webkitExitFullscreen === 'function') {
                try { el.webkitExitFullscreen(); } catch(_) {}
            }
            if (document.exitFullscreen) return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
            if (document.msExitFullscreen) return document.msExitFullscreen();
        } catch (_) {}
        // Fallback to a resolved promise-like
        return { then: (fn) => { try { fn && fn(); } catch(_) {} } };
    },

    // Prepare media for autoplay and attempt playback; only mute if autoplay is blocked
    _prepareAndPlayMediaForSlideshow: function(mediaEl) {
        try {
            // Ensure inline playback for video
            if (mediaEl.tagName === 'VIDEO') {
                mediaEl.setAttribute('playsinline', '');
                mediaEl.setAttribute('webkit-playsinline', '');
            }
            mediaEl.setAttribute('autoplay', '');

            const tryPlay = () => {
                try {
                    const p = mediaEl.play && mediaEl.play();
                    if (p && typeof p.then === 'function') {
                        p.catch(() => {
                            // Autoplay likely blocked; retry with muted
                            try {
                                if (!mediaEl.muted) {
                                    mediaEl.muted = true;
                                }
                                mediaEl.dataset && (mediaEl.dataset.cdMutedForAutoplay = '1');
                                const p2 = mediaEl.play && mediaEl.play();
                                if (p2 && typeof p2.then === 'function') {
                                    p2.catch(() => {});
                                }
                            } catch (_) {}
                        });
                    }
                } catch (_) {
                    // As a last resort, retry muted
                    try {
                        if (!mediaEl.muted) mediaEl.muted = true;
                        mediaEl.dataset && (mediaEl.dataset.cdMutedForAutoplay = '1');
                        const p2 = mediaEl.play && mediaEl.play();
                        if (p2 && typeof p2.then === 'function') {
                            p2.catch(() => {});
                        }
                    } catch (__) {}
                }
            };

            // If media not loaded at all, attempt a light load before playing
            try {
                if (mediaEl.readyState === 0 && mediaEl.load) mediaEl.load();
            } catch (_) {}
            tryPlay();
        } catch (_) {}
    },

    _scheduleNextAdvance: function() {
        this._clearSlideshowTimer();
    // Cancel previous pending image load waits
    try { if (this._slideshowLoadWaitCleanup) { this._slideshowLoadWaitCleanup(); } } catch(_) {}
    this._slideshowLoadWaitCleanup = null;
        this._removeMediaEndedHandler();
        if (!this.currentGallery || !this.slideshowActive) return;

        const currentItem = this.currentGallery.currItem;
        if (!currentItem) return;

        // If current slide contains a video or audio, play and advance on end
    const container = currentItem.container;
        if (container) {
            // Prefer specific video id if provided
            let mediaEl = null;
            if (currentItem.videoId) {
                mediaEl = document.getElementById(currentItem.videoId);
            }
            if (!mediaEl) {
                mediaEl = container.querySelector('video, audio');
            }

            if (mediaEl) {
                this._currentMediaEl = mediaEl;
                const handler = () => {
                    if (!this.slideshowActive) return;
                    // If user used the player's own fullscreen, exit it first to avoid frozen last frame overlay
                    const wasFs = this._isElementInNativeFullscreen(mediaEl);
                    if (wasFs) {
                        let exited = false;
                        const proceed = () => { if (this.slideshowActive) this.next(); };
                        const onFsChange = () => {
                            exited = true;
                            try {
                                document.removeEventListener('fullscreenchange', onFsChange);
                                document.removeEventListener('webkitfullscreenchange', onFsChange);
                                document.removeEventListener('mozfullscreenchange', onFsChange);
                                document.removeEventListener('MSFullscreenChange', onFsChange);
                                // iOS-specific end event on video element
                                mediaEl.removeEventListener('webkitendfullscreen', onFsChange);
                            } catch(_) {}
                            proceed();
                        };
                        document.addEventListener('fullscreenchange', onFsChange);
                        document.addEventListener('webkitfullscreenchange', onFsChange);
                        document.addEventListener('mozfullscreenchange', onFsChange);
                        document.addEventListener('MSFullscreenChange', onFsChange);
                        // iOS Safari fires this on the video element
                        try { mediaEl.addEventListener('webkitendfullscreen', onFsChange, { once: true }); } catch(_) {}
                        try { this._exitNativeFullscreen(mediaEl); } catch(_) {}
                        // Fallback if no event fires
                        setTimeout(() => {
                            if (!exited) {
                                try {
                                    document.removeEventListener('fullscreenchange', onFsChange);
                                    document.removeEventListener('webkitfullscreenchange', onFsChange);
                                    document.removeEventListener('mozfullscreenchange', onFsChange);
                                    document.removeEventListener('MSFullscreenChange', onFsChange);
                                    mediaEl.removeEventListener('webkitendfullscreen', onFsChange);
                                } catch(_) {}
                                proceed();
                            }
                        }, 400);
                        return;
                    }
                    this.next();
                };
                this._currentMediaEndedHandler = handler;
                try { mediaEl.removeEventListener('ended', handler); } catch (e) {}
                mediaEl.addEventListener('ended', handler, { once: true });
        // Prepare element for iOS autoplay and try to play
        this._prepareAndPlayMediaForSlideshow(mediaEl);
                return; // Do not set timeout; advance when media ends
            }
        }

        // Fallback: image or no media - advance after configured seconds,
        // but only start counting once the image is fully rendered.
        this._scheduleImageAdvanceAfterRendered();
    },

    _scheduleImageAdvanceAfterRendered: function() {
        const g = this.currentGallery;
        if (!g || !this.slideshowActive) return;
        const token = ++this._slideshowToken;

        const advanceAfterDelay = () => {
            if (!this.slideshowActive || !this.currentGallery || token !== this._slideshowToken) return;
            this.slideshowTimer = setTimeout(() => {
                if (!this.slideshowActive || !this.currentGallery || token !== this._slideshowToken) return;
                const g2 = this.currentGallery;
                const isLast = g2.getCurrentIndex && (g2.getCurrentIndex() >= g2.items.length - 1);
                if (isLast) {
                    let loop = false;
                    try {
                        const v = localStorage.getItem('cd.slideshowLoop');
                        loop = (v === '1' || v === 'true');
                    } catch (e) {}
                    if (loop) { g2.goTo(0); } else { this.stopSlideshow(); }
                } else {
                    this.next();
                }
            }, this.slideshowSeconds * 1000);
        };

        const item = g.currItem;
    const readyNow = () => {
            try {
                if (!item) return false;
        if (item.loadComplete === true || item.loaded === true) return true; // PhotoSwipe marks when image is loaded
                const img = item.container && item.container.querySelector && item.container.querySelector('.pswp__img');
                return !!(img && img.complete && img.naturalWidth > 0);
            } catch (_) { return false; }
        };

        const cleanup = () => {
            try { if (imgEl && onImgLoad) imgEl.removeEventListener('load', onImgLoad, true); } catch(_) {}
            try { if (offPswp) offPswp(); } catch(_) {}
            try { if (fallbackTimer) clearTimeout(fallbackTimer); } catch(_) {}
            this._slideshowLoadWaitCleanup = null;
        };

        if (readyNow()) {
            // One RAF to yield to paint
            requestAnimationFrame(advanceAfterDelay);
            return;
        }

        let imgEl = null;
        try { imgEl = item && item.container && item.container.querySelector && item.container.querySelector('.pswp__img'); } catch(_) {}
        const onImgLoad = () => {
            if (!this.slideshowActive || token !== this._slideshowToken) { cleanup(); return; }
            cleanup();
            requestAnimationFrame(advanceAfterDelay);
        };
        if (imgEl) { try { imgEl.addEventListener('load', onImgLoad, true); } catch(_) {} }

        let offPswp = null;
        try {
            const idx = g.getCurrentIndex ? g.getCurrentIndex() : -1;
            const listener = (i) => {
                if (!this.slideshowActive || token !== this._slideshowToken) return;
                const same = (g.getCurrentIndex && g.getCurrentIndex() === i);
                if (same) onImgLoad();
            };
            g.listen('imageLoadComplete', listener);
            offPswp = () => { try { g.unlisten('imageLoadComplete', listener); } catch(_) {} };
        } catch(_) {}

        const fallbackTimer = setTimeout(() => {
            if (!this.slideshowActive || token !== this._slideshowToken) { cleanup(); return; }
            cleanup();
            advanceAfterDelay();
        }, 4000);
        this._slideshowLoadWaitCleanup = cleanup;
    },

    _installUserStopHandlers: function() {
        if (this._userStopHandlersInstalled) return;
        const root = (this.currentGallery && this.currentGallery.template) || document;
        const isInControls = (el) => !!(
            el && el.closest && (
                el.closest('.pswp__slideshow-controls') ||
                el.closest('.pswp__slideshow-input') ||
                el.closest('.pswp__button--fs') ||
                el.closest('.pswp__button--slideshow')
            )
        );
        const stop = (e) => {
            const t = e && (e.target || document.activeElement);
            if (isInControls(t)) return;
            // Click anywhere outside controls stops slideshow (including on picture)
            if (e && e.type === 'click') { this.stopSlideshow(); return; }
            // Stop on wheel/touchpad scrolls
            if (e && e.type === 'wheel') { this.stopSlideshow(); return; }
            // Stop on drag gestures: mouse drag (buttons != 0) or touch moves
            if (e && e.type === 'pointermove') {
                if ((typeof e.buttons === 'number' && e.buttons !== 0) || e.pointerType === 'touch') {
                    this.stopSlideshow();
                }
                return;
            }
            if (e && e.type === 'touchmove') { this.stopSlideshow(); return; }
            // Stop on key interactions
            if (e && e.type === 'keydown') { this.stopSlideshow(); return; }
        };
        this._boundUserStopHandler = stop.bind(this);
        // Attach specific events: click (ignore on media), wheel (stop), drag moves (stop), keydown (stop)
        root.addEventListener('click', this._boundUserStopHandler, { capture: true });
        root.addEventListener('wheel', this._boundUserStopHandler, { capture: true });
        root.addEventListener('pointermove', this._boundUserStopHandler, { capture: true });
        root.addEventListener('touchmove', this._boundUserStopHandler, { capture: true });
        window.addEventListener('keydown', this._boundUserStopHandler, { capture: true });
        this._userStopHandlersInstalled = true;
    },

    _removeUserStopHandlers: function() {
        if (!this._userStopHandlersInstalled) return;
        const root = (this.currentGallery && this.currentGallery.template) || document;
        try {
            root.removeEventListener('click', this._boundUserStopHandler, { capture: true });
            root.removeEventListener('wheel', this._boundUserStopHandler, { capture: true });
            root.removeEventListener('pointermove', this._boundUserStopHandler, { capture: true });
            root.removeEventListener('touchmove', this._boundUserStopHandler, { capture: true });
            window.removeEventListener('keydown', this._boundUserStopHandler, { capture: true });
        } catch (e) {}
        this._boundUserStopHandler = null;
        this._userStopHandlersInstalled = false;
    },

    // Get image size
    getImageSize: function(dotNetRef, url, callbackMethodName) {
        const img = new Image();
        try {
            img.referrerPolicy = 'no-referrer';
        } catch (e) {}
        img.onload = function() {
            dotNetRef.invokeMethodAsync(callbackMethodName, url, this.width, this.height);
        };
        img.onerror = function() {
            dotNetRef.invokeMethodAsync(callbackMethodName, url, -1, -1);
        };
        img.src = url;
    },

    // Internal: patch HTMLImageElement to default referrerPolicy before any src/srcset assignment
    _applyNoReferrerImagePatch: function() {
        if (this._imgPatched) return;
        try {
            const proto = HTMLImageElement.prototype;
            if (!this._imgSrcDescriptor) {
                this._imgSrcDescriptor = Object.getOwnPropertyDescriptor(proto, 'src');
            }
            if (!this._imgSrcsetDescriptor) {
                this._imgSrcsetDescriptor = Object.getOwnPropertyDescriptor(proto, 'srcset');
            }

            if (this._imgSrcDescriptor && this._imgSrcDescriptor.set) {
                const originalSet = this._imgSrcDescriptor.set;
                const originalGet = this._imgSrcDescriptor.get;
                Object.defineProperty(proto, 'src', {
                    configurable: true,
                    enumerable: true,
                    get: function() { return originalGet.call(this); },
                    set: function(value) {
                        try {
                            this.referrerPolicy = 'no-referrer';
                            this.setAttribute && this.setAttribute('referrerpolicy', 'no-referrer');
                        } catch (e) {}
                        return originalSet.call(this, value);
                    }
                });
            }

            if (this._imgSrcsetDescriptor && this._imgSrcsetDescriptor.set) {
                const originalSet = this._imgSrcsetDescriptor.set;
                const originalGet = this._imgSrcsetDescriptor.get;
                Object.defineProperty(proto, 'srcset', {
                    configurable: true,
                    enumerable: true,
                    get: function() { return originalGet.call(this); },
                    set: function(value) {
                        try {
                            this.referrerPolicy = 'no-referrer';
                            this.setAttribute && this.setAttribute('referrerpolicy', 'no-referrer');
                        } catch (e) {}
                        return originalSet.call(this, value);
                    }
                });
            }

            this._imgPatched = true;
            console.log('[PhotoSwipe] Referrer policy patch applied to images');
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to apply image referrer patch:', e.message);
        }
    },

    // Internal: restore original HTMLImageElement descriptors
    _removeNoReferrerImagePatch: function() {
        if (!this._imgPatched) return;
        try {
            const proto = HTMLImageElement.prototype;
            if (this._imgSrcDescriptor) {
                Object.defineProperty(proto, 'src', this._imgSrcDescriptor);
            }
            if (this._imgSrcsetDescriptor) {
                Object.defineProperty(proto, 'srcset', this._imgSrcsetDescriptor);
            }
            this._imgPatched = false;
            console.log('[PhotoSwipe] Referrer policy patch removed');
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to remove image referrer patch:', e.message);
        }
    },

    // Load subtitles for a video element
    loadSubtitlesForVideo: async function(videoId, subtitleFiles) {
        if (!subtitleFiles || subtitleFiles.length === 0) {
            console.log('[PhotoSwipe] No subtitle files to load for video:', videoId);
            return;
        }

        const videoElement = document.getElementById(videoId);
        if (!videoElement) {
            console.warn('[PhotoSwipe] Video element not found:', videoId);
            return;
        }

        // Check if video element already has subtitle tracks loaded
        const existingTracks = videoElement.querySelectorAll('track');
        if (existingTracks.length > 0) {
            console.log('[PhotoSwipe] Video already has', existingTracks.length, 'subtitle tracks loaded:', videoId);
            // Ensure first track is enabled
            if (videoElement.textTracks && videoElement.textTracks.length > 0) {
                const firstTrack = videoElement.textTracks[0];
                if (firstTrack.mode !== 'showing') {
                    firstTrack.mode = 'showing';
                    console.log('[PhotoSwipe] Re-enabled first subtitle track');
                }
            }
            // Mark as loaded for future reference
            this.loadedVideos.add(videoId);
            return;
        }

        // If we've processed this video before but tracks are missing, reload them
        if (this.loadedVideos.has(videoId)) {
            console.log('[PhotoSwipe] Video was processed before but tracks are missing, reloading:', videoId);
        }

        // Mark this video as being processed
        this.loadedVideos.add(videoId);

        console.log('[PhotoSwipe] Loading subtitles for video:', videoId, 'Files:', subtitleFiles.length);

        // Remove existing track elements before adding new ones
        const currentTracks = videoElement.querySelectorAll('track');
        currentTracks.forEach(track => {
            console.log('[PhotoSwipe] Removing existing track:', track.label || 'unlabeled');
            track.remove();
        });

        let successfullyLoaded = 0;

        // Load each subtitle file
        for (let i = 0; i < subtitleFiles.length; i++) {
            const subtitle = subtitleFiles[i];
            
            try {
                console.log('[PhotoSwipe] Processing subtitle:', subtitle.name);
                
                // Get file extension
                const extension = subtitle.name.split('.').pop().toLowerCase();
                
                // Only process SRT and VTT files
                if (extension !== 'srt' && extension !== 'vtt') {
                    console.warn('[PhotoSwipe] Skipping unsupported format:', extension);
                    continue;
                }
                
                let trackSrc = subtitle.url;
                
                // For SRT files, try to convert them
                if (extension === 'srt' && window.subtitleProxy) {
                    try {
                        const content = await window.subtitleProxy.loadSubtitleContent(subtitle.url);
                        if (content && content.trim()) {
                            const vttContent = window.subtitleProxy.convertToWebVTT(content, extension);
                            if (vttContent.includes('WEBVTT')) {
                                trackSrc = window.subtitleProxy.createBlobUrl(vttContent, 'text/vtt');
                                console.log('[PhotoSwipe] Converted SRT to WebVTT for:', subtitle.name);
                            }
                        }
                    } catch (error) {
                        console.warn('[PhotoSwipe] Failed to convert SRT, using direct URL:', error.message);
                    }
                }
                
                // Create track element
                const trackElement = document.createElement('track');
                trackElement.kind = 'subtitles';
                trackElement.src = trackSrc;
                trackElement.srclang = subtitle.language || 'en';
                trackElement.label = this.getDisplayName(subtitle.name, subtitle.language);
                
                // Set first track as default
                if (successfullyLoaded === 0) {
                    trackElement.default = true;
                    console.log('[PhotoSwipe] Set as default track:', trackElement.label);
                }
                
                trackElement.addEventListener('load', function() {
                    console.log('[PhotoSwipe] Track loaded successfully:', subtitle.name);
                });
                
                trackElement.addEventListener('error', function(e) {
                    console.error('[PhotoSwipe] Track failed to load:', subtitle.name, e);
                });
                
                videoElement.appendChild(trackElement);
                console.log('[PhotoSwipe] Added subtitle track:', trackElement.label);
                successfullyLoaded++;
                
            } catch (error) {
                console.warn('[PhotoSwipe] Failed to process subtitle:', subtitle.name, error.message);
            }
        }

        console.log('[PhotoSwipe] Successfully loaded', successfullyLoaded, 'subtitle tracks');

        // Enable first track if available
        if (successfullyLoaded > 0) {
            setTimeout(() => {
                if (videoElement.textTracks && videoElement.textTracks.length > 0) {
                    const firstTrack = videoElement.textTracks[0];
                    if (firstTrack.mode !== 'showing') {
                        firstTrack.mode = 'showing';
                        console.log('[PhotoSwipe] Enabled first subtitle track');
                    }
                }
            }, 100);
        }
    },
    
    // Helper method to generate display name for subtitle
    getDisplayName: function(fileName, language) {
        const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        const parts = nameWithoutExt.split(/[._-]/);
        
        if (parts.length > 1) {
            const lastPart = parts[parts.length - 1].toLowerCase();
            const languageNames = {
                'en': 'English',
                'zh': 'Chinese',
                'ja': 'Japanese',
                'ko': 'Korean',
                'fr': 'French',
                'de': 'German',
                'es': 'Spanish',
                'it': 'Italian',
                'pt': 'Portuguese',
                'ru': 'Russian'
            };
            
            const langName = languageNames[lastPart] || languageNames[language];
            if (langName) {
                return langName;
            }
            
            if (lastPart.match(/^[a-z]{2,3}$/)) {
                return lastPart.toUpperCase();
            }
        }
        
        return fileName;
    },
    
    // Enable wheel scrolling for file properties panel in overlay
    enablePropertiesPanelWheelScroll: function() {
        // Wait for DOM to be ready
        setTimeout(() => {
            const propertiesCard = document.querySelector('.overlay-properties .card');
            if (propertiesCard) {
                // Remove any existing wheel listeners
                propertiesCard.removeEventListener('wheel', this.handlePropertiesWheelEvent);
                
                // Add wheel event listener
                propertiesCard.addEventListener('wheel', this.handlePropertiesWheelEvent, { passive: false });
                console.log('Properties panel wheel scroll enabled');
            }
        }, 100);
    },
    
    // Handle wheel events for properties panel
    handlePropertiesWheelEvent: function(event) {
        // Stop the event from bubbling up to PhotoSwipe
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // Get the scrollable element (the card)
        const scrollElement = event.currentTarget;
        const delta = event.deltaY;
        
        // Use smaller scroll steps for smoother scrolling
        const scrollStep = Math.abs(delta) > 100 ? delta * 0.5 : delta;
        
        // Check if we can scroll in the requested direction
        const canScrollUp = scrollElement.scrollTop > 0;
        const canScrollDown = scrollElement.scrollTop < (scrollElement.scrollHeight - scrollElement.clientHeight - 1);
        
        if ((scrollStep > 0 && canScrollDown) || (scrollStep < 0 && canScrollUp)) {
            // We can scroll, so prevent PhotoSwipe from handling this event
            event.preventDefault();
            
            // Use requestAnimationFrame for smooth scrolling
            requestAnimationFrame(() => {
                scrollElement.scrollTop += scrollStep;
            });
        }
        // If we can't scroll in the requested direction, let PhotoSwipe handle it
    },
    
    // Disable wheel scrolling for properties panel
    disablePropertiesPanelWheelScroll: function() {
        const propertiesCard = document.querySelector('.overlay-properties .card');
        if (propertiesCard) {
            propertiesCard.removeEventListener('wheel', this.handlePropertiesWheelEvent);
            console.log('Properties panel wheel scroll disabled');
        }
    }
};

// Legacy support functions
function createPhotoSwipeGallery(dotnetobject, pwspElement, items, options) {
    return window.photoSwipeHelpers.initGallery(dotnetobject, pwspElement, items, options);
}

function destroyPhotoSwipeItem() {
    window.photoSwipeHelpers.destroyGallery();
}

function getImageSizeFromUrlAsyncCallBack(dotnetRef, url, callbackMethodName) {
    window.photoSwipeHelpers.getImageSize(dotnetRef, url, callbackMethodName);
}
